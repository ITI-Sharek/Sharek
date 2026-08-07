import { createHash, randomUUID } from 'node:crypto';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  ContributionRequestAuditAction,
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
import { ApplicationsService } from '../../applications/applications.service';
import { ProjectsService } from '../../projects/projects.service';
import { ContributionRequestDto } from '../dto/contribution-request-response.dto';
import {
  CONTRIBUTION_REQUEST_INCLUDE,
  ContributionRequestWithRequirements,
  toContributionRequestDto,
} from '../mappers/contribution-request.mapper';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
@Injectable()
export class ContributionRequestPublicationService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    @Inject(forwardRef(() => ApplicationsService))
    private readonly applicationsService: ApplicationsService,
  ) {}

  async publishRequest(input: {
    user: AuthenticatedUser;
    requestId: string;
    idempotencyKey?: string;
  }): Promise<ContributionRequestDto> {
    this.assertActiveOwner(input.user);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionRequestAuditAction.published,
      requestId: input.requestId,
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
      action: ContributionRequestAuditAction.published,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return replay;
    if (current.status === ContributionRequestStatus.published) {
      return toContributionRequestDto(current);
    }
    this.assertPublishableDraft(current);

    try {
      return await this.database.$transaction(async (transaction) => {
        await this.projectsService.lockContributionRequestProjectAccess(
          current.project_id,
          input.user.id,
          transaction,
        );
        await transaction.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "ContributionRequest"
          WHERE "owner_id" = ${input.user.id}::uuid
          FOR UPDATE
        `);
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.user.id,
          action: ContributionRequestAuditAction.published,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const locked = await transaction.contributionRequest.findFirst({
          where: { id: input.requestId, owner_id: input.user.id },
          include: CONTRIBUTION_REQUEST_INCLUDE,
        });
        if (!locked) throw this.requestNotFound();
        if (locked.status === ContributionRequestStatus.published) {
          return toContributionRequestDto(locked);
        }
        this.assertPublishableDraft(locked);

        const now = new Date();
        const { planType, monthlyLimit } =
          await this.projectsService.getContributionRequestPublicationEntitlement(
            input.user.id,
            transaction,
            now,
          );
        const periodStart = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        );
        const periodEnd = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        );
        const monthlyUsage = await transaction.contributionRequest.count({
          where: {
            owner_id: input.user.id,
            published_at: { gte: periodStart, lt: periodEnd },
          },
        });
        if (monthlyUsage >= monthlyLimit) {
          throw new ConflictApplicationError(
            'The monthly Contribution Request publication limit was reached',
            'CONTRIBUTION_REQUEST_LIMIT_REACHED',
            { planType, monthlyLimit, monthlyUsage, periodStart },
          );
        }

        const updated = await transaction.contributionRequest.updateMany({
          where: {
            id: locked.id,
            owner_id: input.user.id,
            status: ContributionRequestStatus.draft,
            updated_at: locked.updated_at,
          },
          data: {
            status: ContributionRequestStatus.published,
            published_at: now,
          },
        });
        if (updated.count !== 1) throw this.concurrentModification();
        await transaction.contributionRequestAudit.create({
          data: {
            contribution_request_id: locked.id,
            actor_id: input.user.id,
            action: ContributionRequestAuditAction.published,
            from_status: ContributionRequestStatus.draft,
            to_status: ContributionRequestStatus.published,
            idempotency_key: idempotencyKey,
            command_fingerprint: idempotencyKey ? fingerprint : null,
            metadata: {
              planType,
              monthlyLimit,
              monthlyUsageBefore: monthlyUsage,
              periodStart: periodStart.toISOString(),
            },
          },
        });
        const published =
          await transaction.contributionRequest.findUniqueOrThrow({
            where: { id: locked.id },
            include: CONTRIBUTION_REQUEST_INCLUDE,
          });
        return toContributionRequestDto(published);
      });
    } catch (error) {
      return this.resolveIdempotencyRaceOrThrow({
        error,
        actorId: input.user.id,
        action: ContributionRequestAuditAction.published,
        idempotencyKey,
        fingerprint,
      });
    }
  }

  async cancelRequest(input: {
    user: AuthenticatedUser;
    requestId: string;
    reason?: string;
    idempotencyKey?: string;
  }): Promise<ContributionRequestDto> {
    this.assertActiveOwner(input.user);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const reason = input.reason?.trim() || null;
    const fingerprint = this.fingerprint({
      action: ContributionRequestAuditAction.cancelled,
      requestId: input.requestId,
      reason,
    });
    const current = await this.requireOwnedRequest(
      input.user.id,
      input.requestId,
    );
    await this.projectsService.getContributionRequestProjectOwnerAccess(
      current.project_id,
      input.user.id,
    );
    const replay = await this.readReplay({
      actorId: input.user.id,
      action: ContributionRequestAuditAction.cancelled,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return replay;
    if (current.status === ContributionRequestStatus.cancelled) {
      return toContributionRequestDto(current);
    }
    this.assertCancellableRequest(current.status);

    try {
      return await this.database.$transaction(async (transaction) => {
        await this.projectsService.lockContributionRequestProjectOwnerAccess(
          current.project_id,
          input.user.id,
          transaction,
        );
        await transaction.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "ContributionRequest"
          WHERE "id" = ${input.requestId}::uuid
          FOR UPDATE
        `);
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.user.id,
          action: ContributionRequestAuditAction.cancelled,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;
        const locked = await transaction.contributionRequest.findFirst({
          where: { id: input.requestId, owner_id: input.user.id },
          include: CONTRIBUTION_REQUEST_INCLUDE,
        });
        if (!locked) throw this.requestNotFound();
        if (locked.status === ContributionRequestStatus.cancelled) {
          return toContributionRequestDto(locked);
        }
        this.assertCancellableRequest(locked.status);
        const cancellationAuditId = randomUUID();
        const correlationId = randomUUID();

        const updated = await transaction.contributionRequest.updateMany({
          where: {
            id: locked.id,
            owner_id: input.user.id,
            status: ContributionRequestStatus.published,
            updated_at: locked.updated_at,
          },
          data: { status: ContributionRequestStatus.cancelled },
        });
        if (updated.count !== 1) throw this.concurrentModification();
        const cancellation =
          await this.applicationsService.cancelPendingForRequest({
            contributionRequestId: locked.id,
            actorId: input.user.id,
            reason,
            correlationId,
            causationAuditId: cancellationAuditId,
            transaction,
          });
        await transaction.contributionRequestAudit.create({
          data: {
            id: cancellationAuditId,
            contribution_request_id: locked.id,
            actor_id: input.user.id,
            action: ContributionRequestAuditAction.cancelled,
            from_status: ContributionRequestStatus.published,
            to_status: ContributionRequestStatus.cancelled,
            reason,
            idempotency_key: idempotencyKey,
            command_fingerprint: idempotencyKey ? fingerprint : null,
            metadata: {
              terminal: true,
              cancelledApplicationCount:
                cancellation.cancelledApplicationIds.length,
              correlationId,
              causation: {
                type: 'owner_command',
                idempotencyKey,
              },
            },
          },
        });
        const cancelled =
          await transaction.contributionRequest.findUniqueOrThrow({
            where: { id: locked.id },
            include: CONTRIBUTION_REQUEST_INCLUDE,
          });
        return toContributionRequestDto(cancelled);
      });
    } catch (error) {
      return this.resolveIdempotencyRaceOrThrow({
        error,
        actorId: input.user.id,
        action: ContributionRequestAuditAction.cancelled,
        idempotencyKey,
        fingerprint,
      });
    }
  }

  private assertPublishableDraft(
    request: ContributionRequestWithRequirements,
  ): void {
    if (request.status !== ContributionRequestStatus.draft) {
      throw new ConflictApplicationError(
        'Only a complete draft Contribution Request can be published',
        'CONTRIBUTION_REQUEST_DRAFT_NOT_PUBLISHABLE',
        { status: request.status },
      );
    }
    const incompleteFields: string[] = [];
    if (request.title.trim().length < 3 || request.title.trim().length > 255) {
      incompleteFields.push('title');
    }
    if (
      request.description.trim().length < 10 ||
      request.description.trim().length > 5000
    ) {
      incompleteFields.push('description');
    }
    if (incompleteFields.length) {
      throw new ConflictApplicationError(
        'The Contribution Request work contract is incomplete',
        'CONTRIBUTION_REQUEST_DRAFT_NOT_PUBLISHABLE',
        { incompleteFields },
      );
    }
    if (
      !request.requirements.some(
        (requirement) =>
          requirement.kind === ContributionRequestRequirementKind.required,
      )
    ) {
      throw new UnprocessableApplicationError(
        'At least one Required Requirement is required',
        'CONTRIBUTION_REQUEST_REQUIRED_REQUIREMENT_MISSING',
      );
    }
    if (
      !request.applications_close_at ||
      request.applications_close_at.getTime() <= Date.now()
    ) {
      throw new UnprocessableApplicationError(
        'Applications Close Time must be in the future',
        'CONTRIBUTION_REQUEST_CLOSE_TIME_INVALID',
      );
    }
    if (
      request.target_completion_date &&
      request.target_completion_date.getTime() <=
        request.applications_close_at.getTime()
    ) {
      throw new UnprocessableApplicationError(
        'Target Completion Date must be after Applications Close Time',
        'CONTRIBUTION_REQUEST_DATE_ORDER_INVALID',
      );
    }
    const rewardIsValid =
      (request.reward === null && request.reward_currency === null) ||
      (request.reward !== null &&
        Number(request.reward.toString()) > 0 &&
        request.reward_currency !== null &&
        /^[A-Z]{3}$/.test(request.reward_currency));
    if (!rewardIsValid) {
      throw new UnprocessableApplicationError(
        'Reward amount and currency must be provided together',
        'CONTRIBUTION_REQUEST_REWARD_INVALID',
      );
    }
  }

  private assertCancellableRequest(status: ContributionRequestStatus): void {
    if (status !== ContributionRequestStatus.published) {
      throw new ConflictApplicationError(
        'Only a published Contribution Request can be cancelled',
        'CONTRIBUTION_REQUEST_NOT_CANCELLABLE',
        { status },
      );
    }
  }

  private assertActiveOwner(user: AuthenticatedUser): void {
    if (user.status !== 'active' || user.role !== 'owner') {
      throw new ForbiddenApplicationError(
        'An active owner account is required to manage Contribution Requests',
        'CONTRIBUTION_REQUEST_OWNER_ACCESS_REQUIRED',
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
    audit: Prisma.ContributionRequestAuditGetPayload<{
      include: {
        contributionRequest: { include: typeof CONTRIBUTION_REQUEST_INCLUDE };
      };
    }> | null,
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
          input.error.code === 'CONTRIBUTION_REQUEST_CONCURRENT_MODIFICATION';
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
