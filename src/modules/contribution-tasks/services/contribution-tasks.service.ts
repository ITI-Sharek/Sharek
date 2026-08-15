import { createHash } from 'node:crypto';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import {
  ContributionRequestAuditAction,
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
  Prisma,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
  UnprocessableApplicationError,
} from '../../../shared/errors/application.error';
import { ProjectsService } from '../../projects/projects.service';
import { RequirementInferenceQueue } from '../jobs/requirement-inference.queue';
import { RequirementInferenceProcessorService } from './requirement-inference-processor.service';
import {
  CreateContributionRequestDto,
  UpdateContributionRequestDto,
} from '../dto/contribution-request-input.dto';
import { ApplicationRequestContextDto } from '../dto/application-request-context.dto';
import { ContributorMatchingRequestContext } from '../dto/contributor-matching-context.dto';
import { MatchingCandidateRequestDto } from '../dto/matching-candidate.dto';
import {
  ContributionRequestDto,
  ContributionRequestsByStatusDto,
  OwnerProjectContributionRequestsDto,
} from '../dto/contribution-request-response.dto';
import {
  CONTRIBUTION_REQUEST_INCLUDE,
  ContributionRequestWithRequirements,
  toContributionRequestDto,
} from '../mappers/contribution-request.mapper';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

interface NormalizedDraftContract {
  title: string;
  description: string;
  requiredRequirements: string[];
  preferredRequirements: string[];
  technologyTags: string[];
  applicationsCloseAt: Date;
  targetCompletionDate: Date | null;
  difficulty: ContributionRequestDifficulty | null;
  reward: number | null;
  rewardCurrency: string | null;
}

@Injectable()
export class ContributionTasksService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    @Optional()
    private readonly requirementInference?: RequirementInferenceQueue,
  ) {}

  /**
   * The owner-authorized Request snapshot consumed by owner contributor
   * matching. Only published Requests qualify; candidate discovery remains in
   * the matching module.
   */
  async getPublishedMatchingContext(
    requestId: string,
  ): Promise<ContributorMatchingRequestContext | null> {
    const request = await this.database.contributionRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        owner_id: true,
        title: true,
        description: true,
        technology_tags: true,
        status: true,
        requirements: {
          select: { id: true, kind: true, position: true, text: true },
          orderBy: [{ kind: 'asc' }, { position: 'asc' }],
        },
      },
    });
    if (!request || request.status !== ContributionRequestStatus.published) {
      return null;
    }
    return {
      id: request.id,
      ownerId: request.owner_id,
      title: request.title,
      description: request.description,
      technologyTags: this.normalizeTechnologyTags(request.technology_tags),
      requirements: request.requirements,
    };
  }

  /**
   * Ask for a level bar for this draft, after the transaction has committed.
   *
   * Outside the transaction on purpose: enqueuing inside it would hold the
   * database connection across a Redis round-trip, and a rolled-back draft
   * would leave a job pointing at a Request that never existed. The queue never
   * throws, so a Redis outage cannot fail a draft save — the owner can always
   * type the set by hand.
   */
  private async queueRequirementInference(draft: {
    id: string;
    description: string;
    requirementTexts: string[];
    technologyTags: string[];
    updatedAt: Date;
  }): Promise<void> {
    if (!this.requirementInference) return;
    if (!RequirementInferenceProcessorService.hasEnoughContent(draft)) return;
    await this.requirementInference.enqueueInference({
      contributionRequestId: draft.id,
      requestedAt: draft.updatedAt.toISOString(),
    });
  }

  /**
   * The open Contribution Requests the matching module may consider.
   *
   * Two exclusions are applied here rather than left to the caller, because
   * they are this module's rules about its own rows: a Request that has closed
   * to Applications is not a candidate, and neither is one the contributor
   * owns. Everything else — skill fit, entitlement, ranking — is the caller's
   * business.
   *
   * The result is **bounded**: `limit` caps how many rows leave this module, and
   * the ordering is the same deterministic key the shortlist ranks on last, so
   * truncation keeps the most recently published candidates rather than an
   * arbitrary slice. `@@index([status, applications_close_at, published_at])`
   * covers the filter.
   */
  async listOpenRequestsForMatching(input: {
    excludeOwnerId: string;
    limit: number;
    now?: Date;
  }): Promise<MatchingCandidateRequestDto[]> {
    const now = input.now ?? new Date();
    const publishedProjects =
      await this.projectsService.listContributionRequestProjectReferences({});
    if (publishedProjects.length === 0) return [];

    const requests = await this.database.contributionRequest.findMany({
      where: {
        status: ContributionRequestStatus.published,
        published_at: { not: null },
        applications_close_at: { gt: now },
        project_id: { in: publishedProjects.map((project) => project.id) },
        owner_id: { not: input.excludeOwnerId },
      },
      orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
      take: input.limit,
      include: CONTRIBUTION_REQUEST_INCLUDE,
    });

    const projectTitles = new Map(
      publishedProjects.map((project) => [project.id, project.title]),
    );
    return requests.map((request) =>
      this.toMatchingCandidate(
        request,
        projectTitles.get(request.project_id) ?? '',
      ),
    );
  }

  private toMatchingCandidate(
    request: ContributionRequestWithRequirements,
    projectName: string,
  ): MatchingCandidateRequestDto {
    const requirements = [...request.requirements].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === ContributionRequestRequirementKind.required
          ? -1
          : 1;
      }
      return left.position - right.position;
    });
    return {
      id: request.id,
      projectId: request.project_id,
      projectName,
      ownerId: request.owner_id,
      title: request.title,
      technologyTags: this.normalizeTechnologyTags(request.technology_tags),
      requirementTexts: requirements.map((requirement) => requirement.text),
      skillRequirements: [...request.skillRequirements]
        .sort(
          (left, right) =>
            (left.kind === ContributionRequestRequirementKind.required ? 0 : 1) -
              (right.kind === ContributionRequestRequirementKind.required ? 0 : 1) ||
            left.position - right.position,
        )
        .map((skill) => ({
          skillName: skill.skill_name,
          skillNameNormalized: skill.skill_name_normalized,
          requiredLevel: skill.required_level,
          kind: skill.kind,
        })),
      difficulty: request.difficulty,
      applicationsCloseAt: request.applications_close_at,
      targetCompletionDate: request.target_completion_date,
      reward: request.reward === null ? null : Number(request.reward),
      rewardCurrency: request.reward_currency,
      // A published Request always has this; the fallback keeps the type honest
      // rather than asserting non-null over a nullable column.
      publishedAt: request.published_at ?? request.created_at,
    };
  }

  private normalizeTechnologyTags(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((tag): tag is string => typeof tag === 'string');
  }

  async getApplicationSubmissionContext(
    requestId: string,
  ): Promise<ApplicationRequestContextDto | null> {
    const request = await this.database.contributionRequest.findUnique({
      where: { id: requestId },
      include: CONTRIBUTION_REQUEST_INCLUDE,
    });
    if (
      !request ||
      !(await this.projectsService.isContributionRequestProjectPublished(
        request.project_id,
      ))
    ) {
      return null;
    }
    return this.toApplicationRequestContext(request);
  }

  async lockApplicationSubmissionContext(
    requestId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<ApplicationRequestContextDto | null> {
    const rows = await transaction.$queryRaw<
      Array<{
        id: string;
        owner_id: string;
        project_id: string;
        status: ContributionRequestStatus;
        applications_close_at: Date | null;
        updated_at: Date;
      }>
    >(Prisma.sql`
      SELECT "id", "owner_id", "project_id", "status", "applications_close_at", "updated_at"
      FROM "ContributionRequest"
      WHERE "id" = ${requestId}::uuid
      FOR SHARE
    `);
    const request = rows[0];
    if (!request) return null;
    const projectIsPublished =
      await this.projectsService.lockContributionRequestProjectPublication(
        request.project_id,
        transaction,
      );
    if (!projectIsPublished) return null;
    const requirements = await transaction.contributionRequestRequirement.findMany({
      where: { contribution_request_id: requestId },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }],
    });
    // Read under the `FOR SHARE` taken above, so the set the Application is
    // about to snapshot cannot change between reading it and writing it.
    const skillRequirements =
      await transaction.contributionRequestSkillRequirement.findMany({
        where: { contribution_request_id: requestId },
        orderBy: [{ kind: 'asc' }, { position: 'asc' }],
      });
    return this.toApplicationRequestContext({
      ...request,
      requirements,
      skillRequirements,
    });
  }

  async assignFromOwnerDecision(input: {
    requestId: string;
    ownerId: string;
    ownerDecisionId: string;
    idempotencyKey: string;
    commandFingerprint: string;
    transaction: Prisma.TransactionClient;
  }): Promise<void> {
    const rows = await input.transaction.$queryRaw<
      Array<{
        id: string;
        project_id: string;
        status: ContributionRequestStatus;
      }>
    >(Prisma.sql`
      SELECT "id", "project_id", "status"
      FROM "ContributionRequest"
      WHERE "id" = ${input.requestId}::uuid
      FOR UPDATE
    `);
    const request = rows[0];
    if (!request) throw this.requestNotFound();
    await this.projectsService.lockContributionRequestProjectOwnerAccess(
      request.project_id,
      input.ownerId,
      input.transaction,
    );
    if (request.status === ContributionRequestStatus.cancelled) {
      throw new ConflictApplicationError(
        'The Contribution Request was cancelled',
        'REQUEST_CANCELLED',
      );
    }
    if (request.status !== ContributionRequestStatus.published) {
      throw new ConflictApplicationError(
        'The Contribution Request can no longer be assigned',
        'REQUEST_TERMINAL',
        { status: request.status },
      );
    }

    const updated = await input.transaction.contributionRequest.updateMany({
      where: {
        id: input.requestId,
        status: ContributionRequestStatus.published,
      },
      data: { status: ContributionRequestStatus.assigned },
    });
    if (updated.count !== 1) throw this.concurrentModification();

    await input.transaction.contributionRequestAudit.create({
      data: {
        contribution_request_id: input.requestId,
        actor_id: input.ownerId,
        action: ContributionRequestAuditAction.assigned,
        from_status: ContributionRequestStatus.published,
        to_status: ContributionRequestStatus.assigned,
        idempotency_key: input.idempotencyKey,
        command_fingerprint: input.commandFingerprint,
        metadata: {
          payloadVersion: 1,
          ownerDecisionId: input.ownerDecisionId,
        },
      },
    });
  }

  async completeFromDeliveryReview(input: {
    requestId: string;
    ownerId: string;
    deliveryId: string;
    deliveryReviewId: string;
    idempotencyKey: string;
    commandFingerprint: string;
    transaction: Prisma.TransactionClient;
  }): Promise<void> {
    const rows = await input.transaction.$queryRaw<
      Array<{
        id: string;
        project_id: string;
        status: ContributionRequestStatus;
      }>
    >(Prisma.sql`
      SELECT "id", "project_id", "status"
      FROM "ContributionRequest"
      WHERE "id" = ${input.requestId}::uuid
      FOR UPDATE
    `);
    const request = rows[0];
    if (!request) throw this.requestNotFound();
    await this.projectsService.lockContributionRequestProjectOwnerAccess(
      request.project_id,
      input.ownerId,
      input.transaction,
    );
    if (request.status === ContributionRequestStatus.completed) return;
    if (request.status !== ContributionRequestStatus.assigned) {
      throw new ConflictApplicationError(
        'The Contribution Request cannot be completed from this Delivery',
        'REQUEST_TERMINAL',
        { status: request.status },
      );
    }

    const completed = await input.transaction.contributionRequest.updateMany({
      where: {
        id: input.requestId,
        status: ContributionRequestStatus.assigned,
      },
      data: { status: ContributionRequestStatus.completed },
    });
    if (completed.count !== 1) throw this.concurrentModification();

    await input.transaction.contributionRequestAudit.create({
      data: {
        contribution_request_id: input.requestId,
        actor_id: input.ownerId,
        action: ContributionRequestAuditAction.completed,
        from_status: ContributionRequestStatus.assigned,
        to_status: ContributionRequestStatus.completed,
        idempotency_key: input.idempotencyKey,
        command_fingerprint: input.commandFingerprint,
        metadata: {
          payloadVersion: 1,
          deliveryId: input.deliveryId,
          deliveryReviewId: input.deliveryReviewId,
        },
      },
    });
  }

  async reconfirmOwnerDecisionActor(input: {
    requestId: string;
    ownerId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<void> {
    const rows = await input.transaction.$queryRaw<
      Array<{ id: string; project_id: string }>
    >(Prisma.sql`
      SELECT "id", "project_id"
      FROM "ContributionRequest"
      WHERE "id" = ${input.requestId}::uuid
    `);
    const request = rows[0];
    if (!request) throw this.requestNotFound();
    await this.projectsService.lockContributionRequestProjectOwnerAccess(
      request.project_id,
      input.ownerId,
      input.transaction,
    );
  }

  async confirmOwnerDecisionActor(input: {
    requestId: string;
    ownerId: string;
  }): Promise<void> {
    const request = await this.database.contributionRequest.findUnique({
      where: { id: input.requestId },
      select: { project_id: true },
    });
    if (!request) throw this.requestNotFound();
    await this.projectsService.getContributionRequestProjectOwnerAccess(
      request.project_id,
      input.ownerId,
    );
  }

  async lockContributionRequestOwnerContext(input: {
    requestId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<{ ownerId: string }> {
    const rows = await input.transaction.$queryRaw<
      Array<{ id: string; project_id: string }>
    >(Prisma.sql`
      SELECT "id", "project_id"
      FROM "ContributionRequest"
      WHERE "id" = ${input.requestId}::uuid
      FOR SHARE
    `);
    const request = rows[0];
    if (!request) throw this.requestNotFound();
    const project =
      await this.projectsService.lockContributionRequestProjectOwnerContext(
        request.project_id,
        input.transaction,
      );
    return { ownerId: project.ownerId };
  }

  async lockApplicationReviewOwner(input: {
    requestId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<{ ownerId: string }> {
    return this.lockContributionRequestOwnerContext(input);
  }

  async listDeliveryReviewScopesForOwner(ownerId: string): Promise<
    Array<{
      contributionRequestId: string;
      title: string;
      requirements: Array<{
        kind: ContributionRequestRequirementKind;
        position: number;
        text: string;
      }>;
    }>
  > {
    const projectIds =
      await this.projectsService.listContributionRequestProjectIdsForOwner(
        ownerId,
      );
    if (projectIds.length === 0) return [];
    const requests = await this.database.contributionRequest.findMany({
      where: {
        project_id: { in: projectIds },
        status: ContributionRequestStatus.assigned,
      },
      select: {
        id: true,
        title: true,
        requirements: {
          select: { kind: true, position: true, text: true },
          orderBy: [{ kind: 'asc' }, { position: 'asc' }],
        },
      },
    });
    return requests.map((request) => ({
      contributionRequestId: request.id,
      title: request.title,
      requirements: request.requirements,
    }));
  }

  async listDeliveryLifecycleScopesForOwner(ownerId: string): Promise<
    Array<{
      contributionRequestId: string;
      title: string;
    }>
  > {
    const projectIds =
      await this.projectsService.listContributionRequestProjectIdsForOwner(
        ownerId,
      );
    if (projectIds.length === 0) return [];
    const requests = await this.database.contributionRequest.findMany({
      where: {
        project_id: { in: projectIds },
        status: { not: ContributionRequestStatus.draft },
      },
      select: { id: true, title: true },
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    });
    return requests.map((request) => ({
      contributionRequestId: request.id,
      title: request.title,
    }));
  }

  async createDraft(input: {
    user: AuthenticatedUser;
    projectId: string;
    body: CreateContributionRequestDto;
    idempotencyKey?: string;
  }): Promise<ContributionRequestDto> {
    this.assertActiveOwner(input.user);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const contract = this.normalizeCreateContract(input.body);
    const fingerprint = this.fingerprint({
      action: ContributionRequestAuditAction.created,
      projectId: input.projectId,
      contract,
    });

    await this.projectsService.getContributionRequestProjectAccess(
      input.projectId,
      input.user.id,
    );

    const replay = await this.readReplay({
      actorId: input.user.id,
      action: ContributionRequestAuditAction.created,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return replay;

    try {
      const created = await this.database.$transaction(async (transaction) => {
        await this.projectsService.lockContributionRequestProjectAccess(
          input.projectId,
          input.user.id,
          transaction,
        );

        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.user.id,
          action: ContributionRequestAuditAction.created,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const request = await transaction.contributionRequest.create({
          data: {
            project_id: input.projectId,
            owner_id: input.user.id,
            title: contract.title,
            description: contract.description,
            technology_tags:
              contract.technologyTags as Prisma.InputJsonValue,
            difficulty: contract.difficulty,
            applications_close_at: contract.applicationsCloseAt,
            target_completion_date: contract.targetCompletionDate,
            reward: contract.reward,
            reward_currency: contract.rewardCurrency,
            status: ContributionRequestStatus.draft,
            requirements: {
              create: this.buildRequirementRows(contract),
            },
          },
          include: CONTRIBUTION_REQUEST_INCLUDE,
        });

        await transaction.contributionRequestAudit.create({
          data: {
            contribution_request_id: request.id,
            actor_id: input.user.id,
            action: ContributionRequestAuditAction.created,
            from_status: null,
            to_status: ContributionRequestStatus.draft,
            idempotency_key: idempotencyKey,
            command_fingerprint: idempotencyKey ? fingerprint : null,
            metadata: {
              requiredRequirementCount:
                contract.requiredRequirements.length,
              preferredRequirementCount:
                contract.preferredRequirements.length,
            },
          },
        });

        return toContributionRequestDto(request);
      });
      await this.queueRequirementInference({
        id: created.id,
        description: created.description,
        requirementTexts: [
          ...created.requiredRequirements.map((item) => item.text),
          ...created.preferredRequirements.map((item) => item.text),
        ],
        technologyTags: created.technologyTags,
        updatedAt: created.updatedAt,
      });
      return created;
    } catch (error) {
      return this.resolveIdempotencyRaceOrThrow({
        error,
        actorId: input.user.id,
        action: ContributionRequestAuditAction.created,
        idempotencyKey,
        fingerprint,
      });
    }
  }

  /**
   * Creates an owner-controlled draft Contribution Request from an accepted
   * Contribution Proposal, with immutable proposer attribution. Runs inside the
   * caller's transaction so acceptance and draft creation commit atomically. It
   * creates no Assignment, Application, reserved place, quota use, or selection
   * priority — only a draft the owner can later edit and publish.
   */
  async createDraftFromAcceptedProposal(input: {
    transaction: Prisma.TransactionClient;
    ownerId: string;
    projectId: string;
    proposalId: string;
    attributedContributorId: string;
    title: string;
    description: string;
  }): Promise<ContributionRequestDto> {
    const request = await input.transaction.contributionRequest.create({
      data: {
        project_id: input.projectId,
        owner_id: input.ownerId,
        title: input.title,
        description: input.description,
        status: ContributionRequestStatus.draft,
        origin_proposal_id: input.proposalId,
        attributed_contributor_id: input.attributedContributorId,
      },
      include: CONTRIBUTION_REQUEST_INCLUDE,
    });

    await input.transaction.contributionRequestAudit.create({
      data: {
        contribution_request_id: request.id,
        actor_id: input.ownerId,
        action: ContributionRequestAuditAction.created,
        from_status: null,
        to_status: ContributionRequestStatus.draft,
        metadata: {
          source: 'contribution_proposal',
          originProposalId: input.proposalId,
          attributedContributorId: input.attributedContributorId,
        },
      },
    });

    return toContributionRequestDto(request);
  }

  /**
   * Assignment facts the Materials module needs to resolve visibility.
   *
   * Exported rather than queried there, because Assignment belongs to this
   * module and Materials must never read another module's tables.
   *
   * "Active" means the Contribution Request is still `assigned`. There is no
   * status column on Assignment itself, so the Request's terminal states --
   * completed, cancelled, discarded -- are what end an assignee's access, which
   * is why a delivered Request stops opening `assignment` Materials.
   *
   * Note what `activeProjectAssigneeIds` means: Assignment is per Contribution
   * Request, not per Project, so a "Project assignee" is anyone holding a live
   * Assignment on *any* Request in that Project. A contributor finishing one
   * Request therefore keeps Project-level access while another of theirs is
   * still open, which is the reading that makes a grant survive the ordinary
   * course of work rather than lapsing mid-collaboration.
   */
  async getMaterialAssignmentAccess(input: {
    projectId: string | null;
    contributionRequestId: string | null;
  }): Promise<{
    projectId: string | null;
    activeProjectAssigneeIds: string[];
    activeRequestAssigneeId: string | null;
  }> {
    let projectId = input.projectId;
    let activeRequestAssigneeId: string | null = null;

    if (input.contributionRequestId) {
      const request = await this.database.contributionRequest.findUnique({
        where: { id: input.contributionRequestId },
        select: {
          project_id: true,
          status: true,
          // Declared as a list on the relation, but Assignment's
          // contribution_request_id is unique, so there is at most one.
          assignments: { select: { contributor_id: true }, take: 1 },
        },
      });
      projectId = request?.project_id ?? null;
      activeRequestAssigneeId =
        request?.status === ContributionRequestStatus.assigned
          ? (request.assignments[0]?.contributor_id ?? null)
          : null;
    }

    if (!projectId) {
      return { projectId: null, activeProjectAssigneeIds: [], activeRequestAssigneeId };
    }

    const assignments = await this.database.assignment.findMany({
      where: {
        contributionRequest: {
          project_id: projectId,
          status: ContributionRequestStatus.assigned,
        },
      },
      select: { contributor_id: true },
    });

    return {
      projectId,
      activeProjectAssigneeIds: [
        ...new Set(assignments.map((assignment) => assignment.contributor_id)),
      ],
      activeRequestAssigneeId,
    };
  }

  async getOwnedRequest(
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<ContributionRequestDto> {
    this.assertActiveOwner(user);
    const request = await this.database.contributionRequest.findFirst({
      where: { id: requestId, owner_id: user.id },
      include: CONTRIBUTION_REQUEST_INCLUDE,
    });

    if (!request) throw this.requestNotFound();
    await this.projectsService.getContributionRequestProjectAccess(
      request.project_id,
      user.id,
    );
    return toContributionRequestDto(request);
  }

  async listForOwnedProject(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<OwnerProjectContributionRequestsDto> {
    this.assertActiveOwner(user);
    await this.projectsService.getContributionRequestProjectOwnerAccess(
      projectId,
      user.id,
    );
    const requests = await this.database.contributionRequest.findMany({
      where: { project_id: projectId, owner_id: user.id },
      include: CONTRIBUTION_REQUEST_INCLUDE,
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    });
    const byStatus: ContributionRequestsByStatusDto = {
      [ContributionRequestStatus.draft]: [],
      [ContributionRequestStatus.published]: [],
      [ContributionRequestStatus.assigned]: [],
      [ContributionRequestStatus.completed]: [],
      [ContributionRequestStatus.cancelled]: [],
      [ContributionRequestStatus.discarded]: [],
    };
    for (const request of requests) {
      byStatus[request.status].push(toContributionRequestDto(request));
    }
    return { projectId, totalCount: requests.length, byStatus };
  }

  async updateDraft(input: {
    user: AuthenticatedUser;
    requestId: string;
    body: UpdateContributionRequestDto;
    idempotencyKey?: string;
  }): Promise<ContributionRequestDto> {
    this.assertActiveOwner(input.user);
    this.assertUpdateHasFields(input.body);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionRequestAuditAction.updated,
      requestId: input.requestId,
      body: input.body,
    });

    const current = await this.requireOwnedRequest(
      input.user.id,
      input.requestId,
    );
    await this.projectsService.getContributionRequestProjectAccess(
      current.project_id,
      input.user.id,
    );
    const replay = await this.readReplay({
      actorId: input.user.id,
      action: ContributionRequestAuditAction.updated,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return replay;
    this.assertEditableDraft(current.status);

    try {
      const result = await this.database.$transaction(async (transaction) => {
        await this.projectsService.lockContributionRequestProjectAccess(
          current.project_id,
          input.user.id,
          transaction,
        );

        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.user.id,
          action: ContributionRequestAuditAction.updated,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const locked = await transaction.contributionRequest.findFirst({
          where: { id: input.requestId, owner_id: input.user.id },
          include: CONTRIBUTION_REQUEST_INCLUDE,
        });
        if (!locked) throw this.requestNotFound();
        this.assertEditableDraft(locked.status);
        const contract = this.normalizeUpdateContract(locked, input.body);

        const update = await transaction.contributionRequest.updateMany({
          where: {
            id: locked.id,
            owner_id: input.user.id,
            status: ContributionRequestStatus.draft,
            updated_at: locked.updated_at,
          },
          data: {
            title: contract.title,
            description: contract.description,
            technology_tags:
              contract.technologyTags as Prisma.InputJsonValue,
            difficulty: contract.difficulty,
            applications_close_at: contract.applicationsCloseAt,
            target_completion_date: contract.targetCompletionDate,
            reward: contract.reward,
            reward_currency: contract.rewardCurrency,
          },
        });
        if (update.count !== 1) throw this.concurrentModification();

        if (
          input.body.requiredRequirements !== undefined ||
          input.body.preferredRequirements !== undefined
        ) {
          await transaction.contributionRequestRequirement.deleteMany({
            where: { contribution_request_id: locked.id },
          });
          await transaction.contributionRequestRequirement.createMany({
            data: this.buildRequirementRows(contract).map((requirement) => ({
              contribution_request_id: locked.id,
              ...requirement,
            })),
          });
        }

        await transaction.contributionRequestAudit.create({
          data: {
            contribution_request_id: locked.id,
            actor_id: input.user.id,
            action: ContributionRequestAuditAction.updated,
            from_status: ContributionRequestStatus.draft,
            to_status: ContributionRequestStatus.draft,
            idempotency_key: idempotencyKey,
            command_fingerprint: idempotencyKey ? fingerprint : null,
            metadata: {
              changedFields: Object.entries(input.body)
                .filter(([, value]) => value !== undefined)
                .map(([field]) => field),
            },
          },
        });

        const updated = await transaction.contributionRequest.findUniqueOrThrow({
          where: { id: locked.id },
          include: CONTRIBUTION_REQUEST_INCLUDE,
        });
        return toContributionRequestDto(updated);
      });
      // Re-inferred on every content edit. The bar has to describe the text the
      // owner currently sees, and `updatedAt` is what lets a slow run against
      // the previous text recognise itself as stale and stand down.
      await this.queueRequirementInference({
        id: result.id,
        description: result.description,
        requirementTexts: [
          ...result.requiredRequirements.map((item) => item.text),
          ...result.preferredRequirements.map((item) => item.text),
        ],
        technologyTags: result.technologyTags,
        updatedAt: result.updatedAt,
      });
      return result;
    } catch (error) {
      return this.resolveIdempotencyRaceOrThrow({
        error,
        actorId: input.user.id,
        action: ContributionRequestAuditAction.updated,
        idempotencyKey,
        fingerprint,
      });
    }
  }

  async discardDraft(input: {
    user: AuthenticatedUser;
    requestId: string;
    reason?: string;
    idempotencyKey?: string;
  }): Promise<ContributionRequestDto> {
    this.assertActiveOwner(input.user);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const reason = input.reason?.trim() || null;
    const fingerprint = this.fingerprint({
      action: ContributionRequestAuditAction.discarded,
      requestId: input.requestId,
      reason,
    });
    const current = await this.requireOwnedRequest(
      input.user.id,
      input.requestId,
    );
    await this.projectsService.getContributionRequestProjectAccess(
      current.project_id,
      input.user.id,
    );

    const replay = await this.readReplay({
      actorId: input.user.id,
      action: ContributionRequestAuditAction.discarded,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return replay;
    if (current.status === ContributionRequestStatus.discarded) {
      return toContributionRequestDto(current);
    }
    this.assertEditableDraft(current.status);

    try {
      return await this.database.$transaction(async (transaction) => {
        await this.projectsService.lockContributionRequestProjectAccess(
          current.project_id,
          input.user.id,
          transaction,
        );

        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.user.id,
          action: ContributionRequestAuditAction.discarded,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const locked = await transaction.contributionRequest.findFirst({
          where: { id: input.requestId, owner_id: input.user.id },
          include: CONTRIBUTION_REQUEST_INCLUDE,
        });
        if (!locked) throw this.requestNotFound();
        if (locked.status === ContributionRequestStatus.discarded) {
          return toContributionRequestDto(locked);
        }
        this.assertEditableDraft(locked.status);

        const update = await transaction.contributionRequest.updateMany({
          where: {
            id: locked.id,
            owner_id: input.user.id,
            status: ContributionRequestStatus.draft,
            updated_at: locked.updated_at,
          },
          data: { status: ContributionRequestStatus.discarded },
        });
        if (update.count !== 1) throw this.concurrentModification();

        await transaction.contributionRequestAudit.create({
          data: {
            contribution_request_id: locked.id,
            actor_id: input.user.id,
            action: ContributionRequestAuditAction.discarded,
            from_status: ContributionRequestStatus.draft,
            to_status: ContributionRequestStatus.discarded,
            reason,
            idempotency_key: idempotencyKey,
            command_fingerprint: idempotencyKey ? fingerprint : null,
            metadata: { terminal: true },
          },
        });

        const discarded = await transaction.contributionRequest.findUniqueOrThrow({
          where: { id: locked.id },
          include: CONTRIBUTION_REQUEST_INCLUDE,
        });
        return toContributionRequestDto(discarded);
      });
    } catch (error) {
      return this.resolveIdempotencyRaceOrThrow({
        error,
        actorId: input.user.id,
        action: ContributionRequestAuditAction.discarded,
        idempotencyKey,
        fingerprint,
      });
    }
  }

  private normalizeCreateContract(
    body: CreateContributionRequestDto,
  ): NormalizedDraftContract {
    return this.assertContract({
      title: body.title.trim(),
      description: body.description.trim(),
      requiredRequirements: body.requiredRequirements.map(({ text }) => text),
      preferredRequirements: (body.preferredRequirements ?? []).map(
        ({ text }) => text,
      ),
      technologyTags: body.technologyTags ?? [],
      applicationsCloseAt: new Date(body.applicationsCloseTime),
      targetCompletionDate: this.parseDateOnly(body.targetCompletionDate),
      difficulty: body.difficulty ?? null,
      reward: body.reward ?? null,
      rewardCurrency: body.rewardCurrency ?? null,
    });
  }

  private normalizeUpdateContract(
    request: ContributionRequestWithRequirements,
    body: UpdateContributionRequestDto,
  ): NormalizedDraftContract {
    const applicationsCloseAt = body.applicationsCloseTime
      ? new Date(body.applicationsCloseTime)
      : request.applications_close_at;
    if (!applicationsCloseAt) {
      throw new UnprocessableApplicationError(
        'Applications Close Time is required before this draft can be updated',
        'CONTRIBUTION_REQUEST_CLOSE_TIME_REQUIRED',
      );
    }
    const currentRequired = request.requirements
      .filter((requirement) => requirement.kind === 'required')
      .sort((left, right) => left.position - right.position)
      .map((requirement) => requirement.text);
    const currentPreferred = request.requirements
      .filter((requirement) => requirement.kind === 'preferred')
      .sort((left, right) => left.position - right.position)
      .map((requirement) => requirement.text);
    const reward =
      body.reward !== undefined
        ? body.reward
        : request.reward
          ? Number(request.reward.toString())
          : null;
    const rewardCurrency =
      body.rewardCurrency !== undefined
        ? body.rewardCurrency
        : body.reward === null
          ? null
          : request.reward_currency;

    return this.assertContract({
      title: body.title ?? request.title,
      description: body.description ?? request.description,
      requiredRequirements:
        body.requiredRequirements?.map(({ text }) => text) ?? currentRequired,
      preferredRequirements:
        body.preferredRequirements?.map(({ text }) => text) ?? currentPreferred,
      technologyTags:
        body.technologyTags ?? this.readStringArray(request.technology_tags),
      applicationsCloseAt,
      targetCompletionDate:
        body.targetCompletionDate !== undefined
          ? this.parseDateOnly(body.targetCompletionDate)
          : request.target_completion_date,
      difficulty:
        body.difficulty !== undefined ? body.difficulty : request.difficulty,
      reward,
      rewardCurrency,
    });
  }

  private assertContract(
    contract: NormalizedDraftContract,
  ): NormalizedDraftContract {
    const requiredRequirements = this.normalizeRequirements(
      contract.requiredRequirements,
    );
    const preferredRequirements = this.normalizeRequirements(
      contract.preferredRequirements,
    );
    const requiredKeys = new Set(
      requiredRequirements.map((requirement) => requirement.toLocaleLowerCase()),
    );
    if (
      preferredRequirements.some((requirement) =>
        requiredKeys.has(requirement.toLocaleLowerCase()),
      )
    ) {
      throw new UnprocessableApplicationError(
        'A Requirement cannot be both Required and Preferred',
        'CONTRIBUTION_REQUEST_REQUIREMENT_DUPLICATE',
      );
    }
    if (requiredRequirements.length === 0) {
      throw new UnprocessableApplicationError(
        'At least one Required Requirement is required',
        'CONTRIBUTION_REQUEST_REQUIRED_REQUIREMENT_MISSING',
      );
    }

    if (contract.applicationsCloseAt.getTime() <= Date.now()) {
      throw new UnprocessableApplicationError(
        'Applications Close Time must be in the future',
        'CONTRIBUTION_REQUEST_CLOSE_TIME_INVALID',
      );
    }
    if (
      contract.targetCompletionDate &&
      contract.targetCompletionDate.getTime() <=
        contract.applicationsCloseAt.getTime()
    ) {
      throw new UnprocessableApplicationError(
        'Target Completion Date must be after Applications Close Time',
        'CONTRIBUTION_REQUEST_DATE_ORDER_INVALID',
      );
    }

    const rewardCurrency = contract.rewardCurrency?.trim().toUpperCase() ?? null;
    if (
      (contract.reward === null && rewardCurrency !== null) ||
      (contract.reward !== null && rewardCurrency === null)
    ) {
      throw new UnprocessableApplicationError(
        'Reward amount and currency must be provided together',
        'CONTRIBUTION_REQUEST_REWARD_INVALID',
      );
    }

    return {
      ...contract,
      title: contract.title.trim(),
      description: contract.description.trim(),
      requiredRequirements,
      preferredRequirements,
      technologyTags: this.normalizeTags(contract.technologyTags),
      rewardCurrency,
    };
  }

  private buildRequirementRows(contract: NormalizedDraftContract) {
    return [
      ...contract.requiredRequirements.map((text, position) => ({
        kind: ContributionRequestRequirementKind.required,
        position,
        text,
      })),
      ...contract.preferredRequirements.map((text, position) => ({
        kind: ContributionRequestRequirementKind.preferred,
        position,
        text,
      })),
    ];
  }

  private normalizeRequirements(values: string[]): string[] {
    const normalized = values.map((value) => value.trim());
    const unique = new Set(
      normalized.map((value) => value.toLocaleLowerCase()),
    );
    if (unique.size !== normalized.length) {
      throw new UnprocessableApplicationError(
        'Requirements must be unique within their classification',
        'CONTRIBUTION_REQUEST_REQUIREMENT_DUPLICATE',
      );
    }
    return normalized;
  }

  private normalizeTags(values: string[]): string[] {
    const normalized = values.map((value) => value.trim()).filter(Boolean);
    return normalized.filter(
      (value, index) =>
        normalized.findIndex(
          (candidate) =>
            candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
        ) === index,
    );
  }

  private parseDateOnly(value?: string | null): Date | null {
    return value ? new Date(`${value}T00:00:00.000Z`) : null;
  }

  private readStringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private assertActiveOwner(user: AuthenticatedUser): void {
    if (user.status !== 'active' || user.role !== 'owner') {
      throw new ForbiddenApplicationError(
        'An active owner account is required to manage Contribution Requests',
        'CONTRIBUTION_REQUEST_OWNER_ACCESS_REQUIRED',
      );
    }
  }

  private assertUpdateHasFields(body: UpdateContributionRequestDto): void {
    if (!Object.values(body).some((value) => value !== undefined)) {
      throw new UnprocessableApplicationError(
        'At least one draft field must be provided',
        'CONTRIBUTION_REQUEST_UPDATE_EMPTY',
      );
    }
  }

  private toApplicationRequestContext(request: {
    id: string;
    owner_id: string;
    status: ContributionRequestStatus;
    applications_close_at: Date | null;
    updated_at: Date;
    requirements: Array<{
      id: string;
      kind: ContributionRequestRequirementKind;
      position: number;
      text: string;
    }>;
    skillRequirements: Array<{
      id: string;
      skill_name: string;
      skill_name_normalized: string;
      required_level: SkillProfileProficiencyLevel;
      kind: ContributionRequestRequirementKind;
      position: number;
    }>;
  }): ApplicationRequestContextDto {
    return {
      id: request.id,
      ownerId: request.owner_id,
      status: request.status,
      applicationsCloseAt: request.applications_close_at,
      updatedAt: request.updated_at,
      requirements: request.requirements.map((requirement) => ({
        id: requirement.id,
        kind: requirement.kind,
        position: requirement.position,
        text: requirement.text,
      })),
      skillRequirements: request.skillRequirements.map((skill) => ({
        id: skill.id,
        skillName: skill.skill_name,
        skillNameNormalized: skill.skill_name_normalized,
        requiredLevel: skill.required_level,
        kind: skill.kind,
        position: skill.position,
      })),
    };
  }

  private assertEditableDraft(status: ContributionRequestStatus): void {
    if (status !== ContributionRequestStatus.draft) {
      throw new ConflictApplicationError(
        'Only a draft Contribution Request can be edited or discarded',
        'CONTRIBUTION_REQUEST_DRAFT_NOT_EDITABLE',
        { status },
      );
    }
  }

  private async requireOwnedRequest(
    ownerId: string,
    requestId: string,
  ): Promise<ContributionRequestWithRequirements> {
    const request = await this.database.contributionRequest.findFirst({
      where: { id: requestId, owner_id: ownerId },
      include: CONTRIBUTION_REQUEST_INCLUDE,
    });
    if (!request) throw this.requestNotFound();
    return request;
  }

  private requestNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Contribution Request was not found',
      'CONTRIBUTION_REQUEST_NOT_FOUND',
    );
  }

  private concurrentModification(): ConflictApplicationError {
    return new ConflictApplicationError(
      'Contribution Request changed during this operation',
      'CONTRIBUTION_REQUEST_CONCURRENT_MODIFICATION',
    );
  }

  private normalizeIdempotencyKey(value?: string): string | null {
    if (value === undefined) return null;
    const normalized = value.trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw new BadRequestApplicationError(
        'Idempotency-Key must contain 8 to 128 safe characters',
        'CONTRIBUTION_REQUEST_IDEMPOTENCY_KEY_INVALID',
      );
    }
    return normalized;
  }

  private async readReplay(input: {
    actorId: string;
    action: ContributionRequestAuditAction;
    idempotencyKey: string | null;
    fingerprint: string;
  }): Promise<ContributionRequestDto | null> {
    if (!input.idempotencyKey) return null;
    const audit = await this.database.contributionRequestAudit.findFirst({
      where: {
        actor_id: input.actorId,
        action: input.action,
        idempotency_key: input.idempotencyKey,
      },
      include: {
        contributionRequest: { include: CONTRIBUTION_REQUEST_INCLUDE },
      },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  private async readReplayFromTransaction(input: {
    transaction: Prisma.TransactionClient;
    actorId: string;
    action: ContributionRequestAuditAction;
    idempotencyKey: string | null;
    fingerprint: string;
  }): Promise<ContributionRequestDto | null> {
    if (!input.idempotencyKey) return null;
    const audit = await input.transaction.contributionRequestAudit.findFirst({
      where: {
        actor_id: input.actorId,
        action: input.action,
        idempotency_key: input.idempotencyKey,
      },
      include: {
        contributionRequest: { include: CONTRIBUTION_REQUEST_INCLUDE },
      },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  private presentReplay(
    audit:
      | (Prisma.ContributionRequestAuditGetPayload<{
          include: {
            contributionRequest: { include: typeof CONTRIBUTION_REQUEST_INCLUDE };
          };
        }> | null),
    fingerprint: string,
  ): ContributionRequestDto | null {
    if (!audit) return null;
    if (audit.command_fingerprint !== fingerprint) {
      throw new ConflictApplicationError(
        'Idempotency-Key was already used for a different command',
        'CONTRIBUTION_REQUEST_IDEMPOTENCY_CONFLICT',
      );
    }
    return toContributionRequestDto(audit.contributionRequest);
  }

  private async resolveIdempotencyRaceOrThrow(input: {
    error: unknown;
    actorId: string;
    action: ContributionRequestAuditAction;
    idempotencyKey: string | null;
    fingerprint: string;
  }): Promise<ContributionRequestDto> {
    const mayHaveLostIdempotencyRace =
      input.error instanceof Prisma.PrismaClientKnownRequestError
        ? input.error.code === 'P2002'
        : input.error instanceof ConflictApplicationError &&
          input.error.code ===
            'CONTRIBUTION_REQUEST_CONCURRENT_MODIFICATION';
    if (input.idempotencyKey && mayHaveLostIdempotencyRace) {
      const replay = await this.readReplay(input);
      if (replay) return replay;
    }
    throw input.error;
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256')
      .update(this.stableSerialize(value))
      .digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries
        .map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${this.stableSerialize(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
