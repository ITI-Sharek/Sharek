import { Injectable } from '@nestjs/common';

import { AiService } from '../ai/ai.service';
import {
  ContributorMatchingCandidateSnapshot as AiCandidateSnapshot,
  ContributorMatchingEvidenceCapsule,
  ContributorMatchingInput,
  ContributorMatchingProviderMatch,
} from '../ai/dto/contributor-matching.dto';
import { ContributionTasksService } from '../contribution-tasks/services/contribution-tasks.service';
import { ContributorMatchingRequestContext } from '../contribution-tasks/dto/contributor-matching-context.dto';
import { ReputationService, ReputationSummaryDto } from '../reputation/reputation.service';
import {
  ContributorMatchingCandidateSnapshot,
  SkillProfileSummaryService,
} from '../skill-profiles/services/skill-profile-summary.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import {
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';

export interface OwnerContributorMatchDto {
  contributorId: string;
  contributorName: string;
  contributorUsername: string | null;
  rank: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  justification: string;
  matchedSkills: Array<{
    name: string;
    proficiency: 'beginner' | 'intermediate' | 'advanced';
  }>;
}

export interface OwnerContributorMatchingResponseDto {
  requestId: string;
  planType: 'free' | 'gold';
  resultLimit: number;
  status: 'completed' | 'no_candidates' | 'system_limit';
  matches: OwnerContributorMatchDto[];
}

const CANDIDATE_LIMIT = 500;

/**
 * Gold-owner matching behind one narrow interface.
 *
 * NestJS owns authorization, entitlement, candidate discovery and the visible
 * response. FastAPI receives a closed candidate/evidence scope and may only
 * rank and explain it. Numeric provider scores stay internal and are used only
 * to establish ordinal rank.
 */
@Injectable()
export class OwnerContributorMatchingService {
  constructor(
    private readonly contributionTasks: ContributionTasksService,
    private readonly entitlements: EntitlementsService,
    private readonly skillProfiles: SkillProfileSummaryService,
    private readonly reputation: ReputationService,
    private readonly ai: AiService,
  ) {}

  async generate(input: {
    actor: AuthenticatedUser;
    requestId: string;
    now?: Date;
  }): Promise<OwnerContributorMatchingResponseDto> {
    this.assertActiveOwner(input.actor);
    const context = await this.requireOwnedPublishedRequest({
      ownerId: input.actor.id,
      requestId: input.requestId,
    });
    const entitlement = await this.entitlements.resolveForOwner(
      input.actor.id,
      undefined,
      input.now,
    );
    if (entitlement.contributorMatchLimit <= 0) {
      throw new ForbiddenApplicationError(
        'AI contributor matching requires an active Gold owner plan',
        'OWNER_CONTRIBUTOR_MATCHING_PLAN_REQUIRED',
      );
    }

    const candidates = (
      await this.skillProfiles.listApprovedContributorMatchingSnapshots()
    ).slice(0, CANDIDATE_LIMIT);
    if (candidates.length === 0) {
      return this.empty(context.id, entitlement.planType, entitlement.contributorMatchLimit, 'no_candidates');
    }
    const reputations = await this.reputation.listSummariesForUsers(
      candidates.map((candidate) => candidate.contributorId),
    );
    const result = await this.ai.requestContributorMatching(
      this.buildAiInput(context, candidates, reputations, input.now),
    );
    if (result.kind === 'system_limit') {
      return this.empty(context.id, entitlement.planType, entitlement.contributorMatchLimit, 'system_limit');
    }
    if (result.kind === 'no_candidates') {
      return this.empty(context.id, entitlement.planType, entitlement.contributorMatchLimit, 'no_candidates');
    }

    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.contributorId, candidate]),
    );
    const matches = [...result.matches]
      .sort(
        (left, right) =>
          right.matchScore - left.matchScore ||
          left.contributorId.localeCompare(right.contributorId),
      )
      .slice(0, entitlement.contributorMatchLimit)
      .flatMap((match, index) => {
        const candidate = candidatesById.get(match.contributorId);
        return candidate ? [this.present(match, candidate, index + 1)] : [];
      });
    return {
      requestId: context.id,
      planType: entitlement.planType,
      resultLimit: entitlement.contributorMatchLimit,
      status: matches.length > 0 ? 'completed' : 'no_candidates',
      matches,
    };
  }

  private async requireOwnedPublishedRequest(input: {
    ownerId: string;
    requestId: string;
  }): Promise<ContributorMatchingRequestContext> {
    const context = await this.contributionTasks.getPublishedMatchingContext(
      input.requestId,
    );
    if (!context) {
      throw new NotFoundApplicationError(
        'Published Contribution Request was not found',
        'OWNER_CONTRIBUTOR_MATCHING_REQUEST_NOT_FOUND',
      );
    }
    if (context.ownerId !== input.ownerId) {
      throw new ForbiddenApplicationError(
        'Only the Contribution Request owner can generate contributor matches',
        'OWNER_CONTRIBUTOR_MATCHING_NOT_AUTHORIZED',
      );
    }
    return context;
  }

  private assertActiveOwner(actor: AuthenticatedUser): void {
    if (actor.role !== 'owner' || actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'An active owner account is required to generate contributor matches',
        'OWNER_CONTRIBUTOR_MATCHING_ACCOUNT_NOT_ELIGIBLE',
      );
    }
  }

  private buildAiInput(
    context: ContributorMatchingRequestContext,
    candidates: ContributorMatchingCandidateSnapshot[],
    reputations: Map<string, ReputationSummaryDto>,
    now?: Date,
  ): ContributorMatchingInput {
    const evidence = new Map<string, ContributorMatchingEvidenceCapsule>();
    for (const requirement of context.requirements) {
      evidence.set(`requirement:${requirement.id}`, {
        evidenceId: `requirement:${requirement.id}`,
        type: 'contribution_requirement',
        label: `${requirement.kind} requirement`,
        summary: requirement.text,
      });
    }
    const aiCandidates: AiCandidateSnapshot[] = candidates.map((candidate) => {
      for (const skill of candidate.approvedSkills) {
        for (const evidenceId of skill.evidenceIds) {
          evidence.set(evidenceId, {
            evidenceId,
            type: 'approved_skill',
            label: `${candidate.displayName}: ${skill.name}`,
            summary: skill.evidenceSummary,
            contributorId: candidate.contributorId,
          });
        }
      }
      const reputation = reputations.get(candidate.contributorId) ?? emptyReputation();
      const reputationEvidenceId = `reputation:${candidate.contributorId}`;
      evidence.set(reputationEvidenceId, {
        evidenceId: reputationEvidenceId,
        type: 'reputation_signal',
        label: `${candidate.displayName}: verified reputation`,
        summary: `${reputation.completedContributions} completed contributions; ${reputation.successRate}% success rate`,
        contributorId: candidate.contributorId,
      });
      return {
        contributorId: candidate.contributorId,
        displayName: candidate.displayName,
        username: candidate.username,
        approvedSkills: candidate.approvedSkills,
        reputation: {
          rating: reputation.rating,
          completedContributions: reputation.completedContributions,
          successRate: reputation.successRate,
          topVerifiedSkills: reputation.topVerifiedSkills.map((skill) => skill.name),
        },
      };
    });
    return {
      matchingRequestId: `owner-matching:${context.id}`,
      contributionRequestId: context.id,
      title: context.title,
      description: context.description,
      requirements: context.requirements,
      candidates: aiCandidates,
      evidence: [...evidence.values()],
      allowedEvidenceIds: [...evidence.keys()],
      requestedAt: (now ?? new Date()).toISOString(),
      contractVersion: 'contributor-matching-v1',
    };
  }

  private present(
    match: ContributorMatchingProviderMatch,
    candidate: ContributorMatchingCandidateSnapshot,
    rank: number,
  ): OwnerContributorMatchDto {
    return {
      contributorId: candidate.contributorId,
      contributorName: candidate.displayName,
      contributorUsername: candidate.username,
      rank,
      confidence: match.confidence,
      justification: match.justification,
      matchedSkills: match.matchedSkills.map((skill) => ({
        name: skill.name,
        proficiency: skill.proficiency,
      })),
    };
  }

  private empty(
    requestId: string,
    planType: 'free' | 'gold',
    resultLimit: number,
    status: 'no_candidates' | 'system_limit',
  ): OwnerContributorMatchingResponseDto {
    return { requestId, planType, resultLimit, status, matches: [] };
  }
}

function emptyReputation(): ReputationSummaryDto {
  return {
    rating: null,
    reviewsCount: 0,
    completedContributions: 0,
    totalAssignedTasks: 0,
    successRate: 0,
    topVerifiedSkills: [],
  };
}
