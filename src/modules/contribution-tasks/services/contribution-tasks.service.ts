import { createHash } from 'node:crypto';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  ContributionRequestAuditAction,
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
  Prisma,
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
import {
  CreateContributionRequestDto,
  UpdateContributionRequestDto,
} from '../dto/contribution-request-input.dto';
import { ApplicationRequestContextDto } from '../dto/application-request-context.dto';
import {
  ContributionRequestDto,
  ContributionRequestsByStatusDto,
  OwnerProjectContributionRequestsDto,
} from '../dto/contribution-request-response.dto';
import {
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
  ) {}

  async getApplicationSubmissionContext(
    requestId: string,
  ): Promise<ApplicationRequestContextDto | null> {
    const request = await this.database.contributionRequest.findUnique({
      where: { id: requestId },
      include: { requirements: true },
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
    return this.toApplicationRequestContext({ ...request, requirements });
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
      return await this.database.$transaction(async (transaction) => {
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
          include: { requirements: true },
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
      include: { requirements: true },
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

  async getOwnedRequest(
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<ContributionRequestDto> {
    this.assertActiveOwner(user);
    const request = await this.database.contributionRequest.findFirst({
      where: { id: requestId, owner_id: user.id },
      include: { requirements: true },
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
      include: { requirements: true },
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
      return await this.database.$transaction(async (transaction) => {
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
          include: { requirements: true },
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
          include: { requirements: true },
        });
        return toContributionRequestDto(updated);
      });
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
          include: { requirements: true },
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
          include: { requirements: true },
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
      include: { requirements: true },
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
        contributionRequest: { include: { requirements: true } },
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
        contributionRequest: { include: { requirements: true } },
      },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  private presentReplay(
    audit:
      | (Prisma.ContributionRequestAuditGetPayload<{
          include: {
            contributionRequest: { include: { requirements: true } };
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
