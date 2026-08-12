import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma, SubscriptionPlanType } from '@prisma/client';

import { AiService } from '../ai/ai.service';
import {
  ContributorMatchingCandidateSnapshot as AiCandidateSnapshot,
  ContributorMatchingEvidenceCapsule,
  ContributorMatchingInput,
  ContributorMatchingProviderMatch,
  ContributorMatchingResult as AiMatchingResult,
} from '../ai/dto/contributor-matching.dto';
import { ContributionTasksService } from '../contribution-tasks/services/contribution-tasks.service';
import {
  ContributorMatchingRequestContext,
  ContributorTaskRecommendationContext,
} from '../contribution-tasks/dto/contributor-matching-context.dto';
import { SkillProfileSummaryService } from '../skill-profiles/services/skill-profile-summary.service';
import { ReputationService, ReputationSummaryDto } from '../reputation/reputation.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ContributorMatchingQueue } from './jobs/contributor-matching.queue';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  ApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';

export interface ContributorMatchingMatchedSkillDto {
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
  evidenceIds: string[];
}

export interface ContributorMatchingMatchDto {
  contributorId: string;
  contributorName: string;
  contributorUsername: string | null;
  matchScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  justification: string;
  matchedSkills: ContributorMatchingMatchedSkillDto[];
  evidenceIds: string[];
  rank: number;
}

export interface ContributorMatchingResponseDto {
  requestId: string;
  planType: SubscriptionPlanType;
  resultLimit: 0 | 5 | 10;
  status: 'completed' | 'no_candidates' | 'system_limit';
  matches: ContributorMatchingMatchDto[];
}

export interface ContributorTaskRecommendationDto {
  requestId: string;
  projectName: string;
  title: string;
  matchScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  justification: string;
  matchedSkills: ContributorMatchingMatchedSkillDto[];
  applicationsCloseAt: Date;
  targetCompletionDate: Date | null;
  difficulty: ContributorTaskRecommendationContext['difficulty'];
  reward: number | null;
  rewardCurrency: string | null;
}

export interface ContributorTaskRecommendationsResponseDto {
  planType: SubscriptionPlanType;
  recommendations: ContributorTaskRecommendationDto[];
}

@Injectable()
export class ContributorMatchingService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(forwardRef(() => ContributionTasksService))
    private readonly contributionTasks: ContributionTasksService,
    private readonly subscriptions: SubscriptionsService,
    private readonly skillProfiles: SkillProfileSummaryService,
    private readonly reputation: ReputationService,
    private readonly ai: AiService,
    private readonly queue: ContributorMatchingQueue,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async enqueueForPublishedRequest(input: {
    ownerId: string;
    requestId: string;
  }): Promise<void> {
    await this.queue.enqueueForPublishedRequest(input);
  }

  async generateForPublishedRequest(input: {
    ownerId: string;
    requestId: string;
    now?: Date;
  }): Promise<ContributorMatchingResponseDto> {
    const context = await this.requireOwnedPublishedRequest(input);
    const entitlement = await this.subscriptions.getOwnerMatchingEntitlement(
      input.ownerId,
      input.now,
    );
    const resultLimit = this.assertEntitled(entitlement);

    const candidateSkills =
      await this.skillProfiles.listApprovedContributorMatchingSnapshots();
    const reputations = await this.reputation.listSummariesForUsers(
      candidateSkills.map((candidate) => candidate.contributorId),
    );
    const aiInput = this.buildAiInput(context, candidateSkills, reputations, input.now);
    const result = await this.ai.requestContributorMatching(aiInput);

    if (result.kind === 'system_limit') {
      return {
        requestId: context.id,
        planType: entitlement.planType,
        resultLimit: entitlement.resultLimit,
        status: 'system_limit',
        matches: [],
      };
    }

    const matches =
      result.kind === 'no_candidates'
        ? []
        : this.rankAndLimitMatches(
            result.matches,
            candidateSkills,
            resultLimit,
          );
    await this.persistMatches(context.id, matches, result);
    await this.emitMatchNotifications(context, matches, entitlement.planType);
    return {
      requestId: context.id,
      planType: entitlement.planType,
      resultLimit,
      status: result.kind === 'no_candidates' ? 'no_candidates' : 'completed',
      matches,
    };
  }

  async listForOwner(input: {
    actor: AuthenticatedUser;
    requestId: string;
    now?: Date;
  }): Promise<ContributorMatchingResponseDto> {
    const context = await this.requireOwnedPublishedRequest({
      ownerId: input.actor.id,
      requestId: input.requestId,
      now: input.now,
    });
    const entitlement = await this.subscriptions.getOwnerMatchingEntitlement(
      input.actor.id,
      input.now,
    );
    const resultLimit = this.assertEntitled(entitlement);
    const rows = await this.database.aiMatchResult.findMany({
      where: { contribution_request_id: context.id },
      include: {
        contributor: {
          select: { first_name: true, last_name: true, username: true },
        },
      },
      orderBy: [{ rank: 'asc' }, { id: 'asc' }],
      take: resultLimit,
    });
    return {
      requestId: context.id,
      planType: entitlement.planType,
      resultLimit,
      status: rows.length ? 'completed' : 'no_candidates',
      matches: rows.map((row) => this.presentStoredMatch(row)),
    };
  }

  async inviteMatchedContributor(input: {
    ownerId: string;
    requestId: string;
    contributorId: string;
  }): Promise<{
    requestId: string;
    contributorId: string;
    notificationId: string;
    created: boolean;
  }> {
    const context = await this.requireOwnedPublishedRequest({
      ownerId: input.ownerId,
      requestId: input.requestId,
    });
    const entitlement = await this.subscriptions.getOwnerMatchingEntitlement(
      input.ownerId,
    );
    this.assertEntitled(entitlement);
    const match = await this.database.aiMatchResult.findFirst({
      where: {
        contribution_request_id: context.id,
        contributor_id: input.contributorId,
      },
      select: {
        contributor_id: true,
        match_score: true,
        matched_skills: true,
      },
    });
    if (!match) {
      throw new NotFoundApplicationError(
        'The contributor is not a current match for this request',
        'CONTRIBUTOR_MATCHING_RESULT_NOT_FOUND',
      );
    }
    if (!this.notifications) {
      throw new ApplicationError(
        'Match notifications are not configured',
        'MATCH_NOTIFICATION_SERVICE_NOT_CONFIGURED',
        503,
      );
    }
    const notification = await this.notifications.createMatchFoundNotification({
      userId: match.contributor_id,
      contributionRequestId: context.id,
      requestTitle: context.title,
      audience: 'contributor',
      notificationKind: 'owner_invite',
      matchScore: match.match_score,
      matchedSkills: this.readMatchedSkillNames(match.matched_skills),
    });
    return {
      requestId: context.id,
      contributorId: match.contributor_id,
      notificationId: notification.notificationId,
      created: notification.created,
    };
  }

  async listRecommendedTasks(input: {
    actor: AuthenticatedUser;
    now?: Date;
  }): Promise<ContributorTaskRecommendationsResponseDto> {
    this.assertActiveContributor(input.actor);
    const now = input.now ?? new Date();
    const entitlement = await this.subscriptions.getContributorBenefitEntitlement(
      input.actor.id,
      now,
    );
    if (!entitlement.taskRecommendations) {
      throw new ForbiddenApplicationError(
        'AI-recommended tasks are available to Gold contributors',
        'CONTRIBUTOR_RECOMMENDATIONS_PLAN_REQUIRED',
      );
    }
    const [candidate, contexts] = await Promise.all([
      this.skillProfiles.getApprovedContributorMatchingSnapshot(input.actor.id),
      this.contributionTasks.listPublishedTaskRecommendationContexts(now),
    ]);
    if (!candidate || contexts.length === 0) {
      return { planType: entitlement.planType, recommendations: [] };
    }
    const reputation = await this.reputation.getSummaryForUser(input.actor.id);
    const byRequest = await Promise.all(
      contexts.map(async (context) => {
        const result = await this.ai.requestContributorMatching(
          this.buildAiInput(
            context,
            [candidate],
            new Map([[input.actor.id, reputation]]),
            now,
          ),
        );
        if (result.kind !== 'completed') return null;
        const match = result.matches.find(
          (item) => item.contributorId === input.actor.id,
        );
        if (!match) return null;
        const [presented] = this.rankAndLimitMatches(
          [match],
          [candidate],
          5,
        );
        return this.presentRecommendation(context, presented);
      }),
    );
    return {
      planType: entitlement.planType,
      recommendations: byRequest
        .filter((item): item is ContributorTaskRecommendationDto => item !== null)
        .sort(
          (left, right) =>
            right.matchScore - left.matchScore ||
            left.requestId.localeCompare(right.requestId),
        )
        .slice(0, 20),
    };
  }

  private async requireOwnedPublishedRequest(input: {
    ownerId: string;
    requestId: string;
    now?: Date;
  }): Promise<ContributorMatchingRequestContext> {
    const context = await this.contributionTasks.getPublishedMatchingContext(
      input.requestId,
    );
    if (!context) throw this.requestNotFound();
    if (context.ownerId !== input.ownerId) {
      throw new ForbiddenApplicationError(
        'Only the Contribution Request owner can use contributor matching',
        'CONTRIBUTOR_MATCHING_NOT_AUTHORIZED',
      );
    }
    return context;
  }

  private assertEntitled(entitlement: {
    entitled: boolean;
    planType: SubscriptionPlanType;
    resultLimit: 0 | 5 | 10;
  }): 5 | 10 {
    if (
      entitlement.entitled &&
      (entitlement.resultLimit === 5 || entitlement.resultLimit === 10)
    ) {
      return entitlement.resultLimit;
    }
    throw new ForbiddenApplicationError(
      'Contributor matching is available to Silver and Gold owners',
      'CONTRIBUTOR_MATCHING_PLAN_REQUIRED',
    );
  }

  private buildAiInput(
    context: ContributorMatchingRequestContext,
    candidates: Awaited<
      ReturnType<SkillProfileSummaryService['listApprovedContributorMatchingSnapshots']>
    >,
    reputations: Map<string, ReputationSummaryDto>,
    now?: Date,
  ): ContributorMatchingInput {
    const evidence = new Map<string, ContributorMatchingEvidenceCapsule>();
    const addEvidence = (item: ContributorMatchingEvidenceCapsule) => {
      if (!evidence.has(item.evidenceId)) evidence.set(item.evidenceId, item);
    };
    const requirements = context.requirements.map((requirement) => {
      addEvidence({
        evidenceId: `requirement:${requirement.id}`,
        type: 'contribution_requirement',
        label: `${requirement.kind} Requirement`,
        summary: requirement.text,
      });
      return requirement;
    });
    const aiCandidates: AiCandidateSnapshot[] = candidates.map((candidate) => {
      const summary = reputations.get(candidate.contributorId) ?? this.emptyReputation();
      const approvedSkills = candidate.approvedSkills.map((skill) => {
        for (const evidenceId of skill.evidenceIds) {
          addEvidence({
            evidenceId,
            type: 'approved_skill',
            label: `${candidate.displayName}: ${skill.name}`,
            summary: skill.evidenceSummary,
            contributorId: candidate.contributorId,
          });
        }
        return {
          skillProfileId: skill.skillProfileId,
          name: skill.name,
          proficiency: skill.proficiency,
          confidence: skill.confidence,
          evidenceIds: skill.evidenceIds,
          evidenceSummary: skill.evidenceSummary,
        };
      });
      const reputationEvidenceId = `reputation:${candidate.contributorId}`;
      addEvidence({
        evidenceId: reputationEvidenceId,
        type: 'reputation_signal',
        label: `${candidate.displayName}: verified reputation`,
        summary: `${summary.completedContributions} completed contributions; ${summary.successRate}% success rate`,
        contributorId: candidate.contributorId,
      });
      return {
        contributorId: candidate.contributorId,
        displayName: candidate.displayName,
        username: candidate.username,
        approvedSkills,
        reputation: {
          rating: summary.rating,
          completedContributions: summary.completedContributions,
          successRate: summary.successRate,
          topVerifiedSkills: summary.topVerifiedSkills.map((skill) => skill.name),
        },
      };
    });
    return {
      matchingRequestId: `matching:${context.id}`,
      contributionRequestId: context.id,
      title: context.title,
      description: context.description,
      requirements,
      candidates: aiCandidates,
      evidence: [...evidence.values()],
      allowedEvidenceIds: [...evidence.keys()],
      requestedAt: (now ?? new Date()).toISOString(),
      contractVersion: 'contributor-matching-v1',
    };
  }

  private rankAndLimitMatches(
    matches: ContributorMatchingProviderMatch[],
    candidates: Awaited<
      ReturnType<SkillProfileSummaryService['listApprovedContributorMatchingSnapshots']>
    >,
    resultLimit: 5 | 10,
  ): ContributorMatchingMatchDto[] {
    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.contributorId, candidate]),
    );
    return [...matches]
      .sort(
        (left, right) =>
          right.matchScore - left.matchScore ||
          left.contributorId.localeCompare(right.contributorId),
      )
      .slice(0, resultLimit)
      .map((match, index) => {
        const candidate = candidatesById.get(match.contributorId);
        if (!candidate) throw new ApplicationError(
          'Matching output referenced an unavailable candidate',
          'CONTRIBUTOR_MATCHING_CANDIDATE_MISSING',
        );
        return {
          contributorId: candidate.contributorId,
          contributorName: candidate.displayName,
          contributorUsername: candidate.username,
          matchScore: match.matchScore,
          confidence: match.confidence,
          justification: match.justification,
          matchedSkills: match.matchedSkills,
          evidenceIds: match.evidenceIds,
          rank: index + 1,
        };
      });
  }

  private async persistMatches(
    requestId: string,
    matches: ContributorMatchingMatchDto[],
    result: Extract<AiMatchingResult, { kind: 'completed' }> | { kind: 'no_candidates' },
  ): Promise<void> {
    const sourceMetadata = result.kind === 'completed' ? result.metadata : null;
    await this.database.$transaction(async (transaction) => {
      await transaction.aiMatchResult.deleteMany({
        where: { contribution_request_id: requestId },
      });
      if (matches.length === 0) return;
      await transaction.aiMatchResult.createMany({
        data: matches.map((match) => ({
          contribution_request_id: requestId,
          contributor_id: match.contributorId,
          match_score: match.matchScore,
          confidence: match.confidence,
          justification: match.justification,
          matched_skills: match.matchedSkills as unknown as Prisma.InputJsonValue,
          reputation_signals: Prisma.JsonNull,
          source_attribution: {
            evidenceIds: match.evidenceIds,
            provider: sourceMetadata?.provider ?? 'none',
            promptVersion: sourceMetadata?.promptVersion ?? 'none',
          },
          rank: match.rank,
          model_used: sourceMetadata?.model ?? null,
        })),
      });
    });
  }

  private async emitMatchNotifications(
    context: ContributorMatchingRequestContext,
    matches: ContributorMatchingMatchDto[],
    ownerPlanType: SubscriptionPlanType,
  ): Promise<void> {
    if (!this.notifications || matches.length === 0) return;
    const ownerHasAutoNotifications = ownerPlanType === SubscriptionPlanType.gold;
    if (
      typeof this.subscriptions.getContributorBenefitEntitlement !== 'function' &&
      !ownerHasAutoNotifications
    ) {
      return;
    }
    const eligible = await Promise.all(
      matches.map(async (match) => {
        const contributorEntitlement =
          typeof this.subscriptions.getContributorBenefitEntitlement === 'function'
            ? await this.subscriptions.getContributorBenefitEntitlement(
                match.contributorId,
              )
            : { skillMatchedNotifications: false };
        return {
          match,
          eligible:
            ownerHasAutoNotifications ||
            Boolean(contributorEntitlement?.skillMatchedNotifications),
          };
      }),
    );
    const notificationCandidates = eligible.filter((item) => item.eligible);
    const notificationResults = await Promise.allSettled(
      notificationCandidates.map(({ match }) =>
        this.notifications!.createMatchFoundNotification({
            userId: match.contributorId,
            contributionRequestId: context.id,
            requestTitle: context.title,
            audience: 'contributor',
            notificationKind: ownerHasAutoNotifications
              ? 'gold_auto_match'
              : 'skill_matched_task',
            matchScore: match.matchScore,
            matchedSkills: match.matchedSkills.map((skill) => skill.name),
        }),
      ),
    );
    const notifiedContributorIds = notificationCandidates.flatMap((item, index) =>
      notificationResults[index]?.status === 'fulfilled'
        ? [item.match.contributorId]
        : [],
    );
    if (notifiedContributorIds.length === 0) return;
    const updateMany = this.database.aiMatchResult.updateMany;
    if (typeof updateMany === 'function') {
      await updateMany.call(this.database.aiMatchResult, {
        where: {
          contribution_request_id: context.id,
          contributor_id: { in: notifiedContributorIds },
        },
        data: { notification_sent: true },
      });
    }
  }

  private presentRecommendation(
    context: ContributorTaskRecommendationContext,
    match: ContributorMatchingMatchDto,
  ): ContributorTaskRecommendationDto {
    return {
      requestId: context.id,
      projectName: context.projectName,
      title: context.title,
      matchScore: match.matchScore,
      confidence: match.confidence,
      justification: match.justification,
      matchedSkills: match.matchedSkills,
      applicationsCloseAt: context.applicationsCloseAt,
      targetCompletionDate: context.targetCompletionDate,
      difficulty: context.difficulty,
      reward: context.reward,
      rewardCurrency: context.rewardCurrency,
    };
  }

  private presentStoredMatch(row: {
    contributor_id: string;
    match_score: number;
    confidence: string;
    justification: string | null;
    matched_skills: Prisma.JsonValue | null;
    source_attribution: Prisma.JsonValue | null;
    rank: number;
    contributor: { first_name: string; last_name: string; username: string | null };
  }): ContributorMatchingMatchDto {
    const confidence = this.readConfidence(row.confidence);
    const sourceAttribution = this.readRecord(row.source_attribution);
    return {
      contributorId: row.contributor_id,
      contributorName: `${row.contributor.first_name} ${row.contributor.last_name}`.trim(),
      contributorUsername: row.contributor.username,
      matchScore: row.match_score,
      confidence,
      justification: row.justification ?? 'Recommended from the approved matching snapshot.',
      matchedSkills: this.readMatchedSkills(row.matched_skills),
      evidenceIds: this.readStringArray(sourceAttribution?.evidenceIds),
      rank: row.rank,
    };
  }

  private readMatchedSkills(value: Prisma.JsonValue | null): ContributorMatchingMatchedSkillDto[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (
        typeof record.name !== 'string' ||
        (record.proficiency !== 'beginner' &&
          record.proficiency !== 'intermediate' &&
          record.proficiency !== 'advanced')
      ) return [];
      return [{
        name: record.name,
        proficiency: record.proficiency,
        evidenceIds: this.readStringArray(record.evidenceIds),
      }];
    });
  }

  private readMatchedSkillNames(value: Prisma.JsonValue | null): string[] {
    return this.readMatchedSkills(value).map((skill) => skill.name);
  }

  private readRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private readConfidence(value: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    return value === 'HIGH' || value === 'LOW' ? value : 'MEDIUM';
  }

  private emptyReputation(): ReputationSummaryDto {
    return {
      rating: null,
      reviewsCount: 0,
      completedContributions: 0,
      totalAssignedTasks: 0,
      successRate: 0,
      topVerifiedSkills: [],
    };
  }

  private requestNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Published Contribution Request was not found',
      'CONTRIBUTION_MATCHING_REQUEST_NOT_FOUND',
    );
  }

  private assertActiveContributor(actor: AuthenticatedUser): void {
    if (actor.status !== 'active' || actor.role !== 'contributor') {
      throw new ForbiddenApplicationError(
        'An active contributor account is required',
        'CONTRIBUTOR_RECOMMENDATIONS_ACCOUNT_NOT_ELIGIBLE',
      );
    }
  }
}
