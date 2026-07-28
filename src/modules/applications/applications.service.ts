import { createHash, randomUUID } from 'node:crypto';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  ApplicationAuditAction,
  ApplicationStatus,
  ContributionRequestStatus,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { ContributionTasksService } from '../contribution-tasks/services/contribution-tasks.service';
import { ContributorProfilesService } from '../contributor-profiles/contributor-profiles.service';
import { IdentityUsernameService } from '../identity/services/identity-username.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SkillProfileSummaryService } from '../skill-profiles/services/skill-profile-summary.service';
import {
  ApplicationDto,
  ApplicationEvidenceSummaryDto,
  ApplicationProfileContextDto,
  ApplicationRequirementSnapshotDto,
  ApplicationStatusDto,
  OwnerApplicationsDto,
} from './dto/application-response.dto';
import { ApplicationRequestContextDto } from '../contribution-tasks/dto/application-request-context.dto';
import {
  ApplicationRequestScopeDto,
  PendingApplicationsOwnerWorkspaceSummaryDto,
} from './dto/owner-workspace-summary.dto';

const APPLICATION_INCLUDE = {
  requirementSnapshot: true,
  evidenceSnapshot: true,
  contributionRequest: { select: { owner_id: true } },
} satisfies Prisma.ApplicationInclude;

type ApplicationWithSnapshots = Prisma.ApplicationGetPayload<{
  include: typeof APPLICATION_INCLUDE;
}>;

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(forwardRef(() => ContributionTasksService))
    private readonly contributionTasks: ContributionTasksService,
    private readonly skillProfiles: SkillProfileSummaryService,
    private readonly identity: IdentityUsernameService,
    private readonly notifications: NotificationsService,
    private readonly contributorProfiles: ContributorProfilesService,
  ) {}

  async submit(input: {
    actor: AuthenticatedUser;
    contributionRequestId: string;
    contributionApproach: string;
    proposedDeliveryDurationDays: number;
    idempotencyKey: string;
  }): Promise<ApplicationDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ApplicationAuditAction.submitted,
      contributionRequestId: input.contributionRequestId,
      contributionApproach: input.contributionApproach,
      proposedDeliveryDurationDays: input.proposedDeliveryDurationDays,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ApplicationAuditAction.submitted,
      idempotencyKey,
      fingerprint,
    });
    if (replay) {
      await this.notify(replay, 'submitted');
      return this.present(replay);
    }

    const context =
      await this.contributionTasks.getApplicationSubmissionContext(
        input.contributionRequestId,
      );
    this.assertRequestAcceptsApplications(context, new Date());
    const [user, profileContext] = await Promise.all([
      this.identity.getUserById(input.actor.id),
      this.contributorProfiles.getApplicationProfileContext(input.actor.id),
    ]);
    const contributorContext = {
      id: user.id,
      username: user.username,
      displayName: `${user.first_name} ${user.last_name}`.trim(),
      profile: profileContext,
    };

    let application: ApplicationWithSnapshots;
    try {
      application = await this.database.$transaction(async (transaction) => {
        const locked =
          await this.contributionTasks.lockApplicationSubmissionContext(
            input.contributionRequestId,
            transaction,
          );
        const now = new Date();
        this.assertRequestAcceptsApplications(locked, now);
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.actor.id,
          action: ApplicationAuditAction.submitted,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const approvedSkills =
          await this.skillProfiles.listAuthorizedSkillsForApplicationSnapshot(
            input.actor.id,
            transaction,
          );

        const existing = await transaction.application.findUnique({
          where: {
            contribution_request_id_contributor_id: {
              contribution_request_id: input.contributionRequestId,
              contributor_id: input.actor.id,
            },
          },
          include: APPLICATION_INCLUDE,
        });
        if (existing) throw this.alreadyApplied();

        const applicationId = randomUUID();
        const requirementSnapshotId = randomUUID();
        const evidenceSnapshotId = randomUUID();
        await transaction.applicationRequirementSnapshot.create({
          data: {
            id: requirementSnapshotId,
            contribution_request_id: input.contributionRequestId,
            source_request_updated_at: locked!.updatedAt,
            requirements: locked!.requirements.map((requirement) => ({
              id: requirement.id,
              kind: requirement.kind,
              position: requirement.position,
              text: requirement.text,
            })) as unknown as Prisma.InputJsonValue,
          },
        });
        await transaction.applicationEvidenceSnapshot.create({
          data: {
            id: evidenceSnapshotId,
            contributor_id: input.actor.id,
            contributor_context:
              contributorContext as unknown as Prisma.InputJsonValue,
            evidence: approvedSkills.map((skill) => ({
              ...skill,
              evidenceSources: this.jsonObject(skill.evidenceSources),
            })) as unknown as Prisma.InputJsonValue,
          },
        });
        const created = await transaction.application.create({
          data: {
            id: applicationId,
            contribution_request_id: input.contributionRequestId,
            contributor_id: input.actor.id,
            contribution_approach: input.contributionApproach,
            proposed_delivery_duration_days: input.proposedDeliveryDurationDays,
            requirement_snapshot_id: requirementSnapshotId,
            evidence_snapshot_id: evidenceSnapshotId,
            status: ApplicationStatus.pending_owner_review,
            submitted_at: now,
            review_due_at: this.addDays(now, 3),
            expires_at: this.addDays(now, 7),
          },
          include: APPLICATION_INCLUDE,
        });
        await transaction.applicationAudit.create({
          data: {
            application_id: created.id,
            actor_id: input.actor.id,
            action: ApplicationAuditAction.submitted,
            to_status: ApplicationStatus.pending_owner_review,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: { payloadVersion: 1 },
          },
        });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const lostRace = await this.readReplay({
          actorId: input.actor.id,
          action: ApplicationAuditAction.submitted,
          idempotencyKey,
          fingerprint,
        });
        if (lostRace) application = lostRace;
        else throw this.alreadyApplied();
      } else {
        throw error;
      }
    }
    await this.notify(application, 'submitted');
    return this.present(application);
  }

  async listForOwner(
    actor: AuthenticatedUser,
    contributionRequestId: string,
  ): Promise<OwnerApplicationsDto> {
    this.assertActiveOwner(actor);
    const context =
      await this.contributionTasks.getApplicationSubmissionContext(
        contributionRequestId,
      );
    if (!context || context.ownerId !== actor.id)
      throw this.applicationNotFound();
    const applications = await this.database.application.findMany({
      where: {
        contribution_request_id: contributionRequestId,
        status: ApplicationStatus.pending_owner_review,
      },
      orderBy: [{ submitted_at: 'asc' }, { id: 'asc' }],
      include: APPLICATION_INCLUDE,
    });
    return {
      applications: applications.map((application) =>
        this.present(application),
      ),
    };
  }

  async getForActor(
    actor: AuthenticatedUser,
    applicationId: string,
  ): Promise<ApplicationDto> {
    this.assertActiveApplicationActor(actor);
    const application = await this.database.application.findUnique({
      where: { id: applicationId },
      include: APPLICATION_INCLUDE,
    });
    if (
      !application ||
      (application.contributor_id !== actor.id &&
        application.contributionRequest.owner_id !== actor.id)
    ) {
      throw this.applicationNotFound();
    }
    return this.present(application);
  }

  async withdraw(input: {
    actor: AuthenticatedUser;
    applicationId: string;
    idempotencyKey?: string;
  }): Promise<ApplicationDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = input.idempotencyKey
      ? this.normalizeIdempotencyKey(input.idempotencyKey)
      : null;
    const fingerprint = this.fingerprint({
      action: ApplicationAuditAction.withdrawn,
      applicationId: input.applicationId,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ApplicationAuditAction.withdrawn,
      idempotencyKey,
      fingerprint,
    });
    if (replay) {
      await this.notify(replay, 'withdrawn');
      return this.present(replay);
    }

    let application: ApplicationWithSnapshots;
    try {
      application = await this.database.$transaction(async (transaction) => {
        const current = await transaction.application.findFirst({
          where: { id: input.applicationId, contributor_id: input.actor.id },
          include: APPLICATION_INCLUDE,
        });
        if (!current) throw this.applicationNotFound();
        if (current.status === ApplicationStatus.withdrawn) return current;
        if (current.status !== ApplicationStatus.pending_owner_review) {
          throw new ConflictApplicationError(
            'Only a pending Application can be withdrawn',
            'APPLICATION_TERMINAL',
            { status: current.status },
          );
        }
        const updated = await transaction.application.updateMany({
          where: {
            id: input.applicationId,
            contributor_id: input.actor.id,
            status: ApplicationStatus.pending_owner_review,
          },
          data: { status: ApplicationStatus.withdrawn },
        });
        if (updated.count !== 1) {
          throw new ConflictApplicationError(
            'Application changed during withdrawal',
            'APPLICATION_CONCURRENT_MODIFICATION',
          );
        }
        await transaction.applicationAudit.create({
          data: {
            application_id: input.applicationId,
            actor_id: input.actor.id,
            action: ApplicationAuditAction.withdrawn,
            from_status: ApplicationStatus.pending_owner_review,
            to_status: ApplicationStatus.withdrawn,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: { payloadVersion: 1 },
          },
        });
        return transaction.application.findUniqueOrThrow({
          where: { id: input.applicationId },
          include: APPLICATION_INCLUDE,
        });
      });
    } catch (error) {
      const mayHaveLostRetryRace =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code === 'P2002'
          : error instanceof ConflictApplicationError &&
            error.code === 'APPLICATION_CONCURRENT_MODIFICATION';
      if (idempotencyKey && mayHaveLostRetryRace) {
        const lostRace = await this.readReplay({
          actorId: input.actor.id,
          action: ApplicationAuditAction.withdrawn,
          idempotencyKey,
          fingerprint,
        });
        if (lostRace) application = lostRace;
        else throw error;
      } else {
        throw error;
      }
    }
    await this.notify(application, 'withdrawn');
    return this.present(application);
  }

  async summarizePendingByContributionRequests(input: {
    requestScopes: ApplicationRequestScopeDto[];
  }): Promise<PendingApplicationsOwnerWorkspaceSummaryDto> {
    const contributionRequestIds = [
      ...new Set(
        input.requestScopes.flatMap((scope) => scope.contributionRequestIds),
      ),
    ];
    if (contributionRequestIds.length === 0)
      return this.emptySummary(input.requestScopes);
    const counts = await this.database.application.groupBy({
      by: ['contribution_request_id'],
      where: {
        contribution_request_id: { in: contributionRequestIds },
        status: ApplicationStatus.pending_owner_review,
      },
      _count: { _all: true },
    });
    const countsByRequestId = new Map(
      counts.map((count) => [count.contribution_request_id, count._count._all]),
    );
    return {
      projects: input.requestScopes.map((scope) => ({
        projectId: scope.projectId,
        pendingApplicationCount: scope.contributionRequestIds.reduce(
          (total, requestId) => total + (countsByRequestId.get(requestId) ?? 0),
          0,
        ),
      })),
    };
  }

  async cancelPendingForRequest(input: {
    contributionRequestId: string;
    actorId: string;
    reason: string | null;
    correlationId: string;
    causationAuditId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<{ cancelledApplicationIds: string[] }> {
    const pending = await input.transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "Application"
        WHERE "contribution_request_id" = ${input.contributionRequestId}::uuid
          AND "status" = ${ApplicationStatus.pending_owner_review}::"ApplicationStatus"
        ORDER BY "id"
        FOR UPDATE
      `,
    );
    const cancelledApplicationIds = pending.map(
      (application) => application.id,
    );
    if (cancelledApplicationIds.length === 0) {
      return { cancelledApplicationIds };
    }

    const updated = await input.transaction.application.updateMany({
      where: {
        id: { in: cancelledApplicationIds },
        status: ApplicationStatus.pending_owner_review,
      },
      data: { status: ApplicationStatus.request_cancelled },
    });
    if (updated.count !== cancelledApplicationIds.length) {
      throw new ConflictApplicationError(
        'An Application changed during Contribution Request cancellation',
        'APPLICATION_CONCURRENT_MODIFICATION',
      );
    }
    await input.transaction.applicationAudit.createMany({
      data: cancelledApplicationIds.map((applicationId) => ({
        application_id: applicationId,
        actor_id: input.actorId,
        action: ApplicationAuditAction.request_cancelled,
        from_status: ApplicationStatus.pending_owner_review,
        to_status: ApplicationStatus.request_cancelled,
        metadata: {
          payloadVersion: 1,
          contributionRequestId: input.contributionRequestId,
          reason: input.reason,
          correlationId: input.correlationId,
          causation: {
            type: 'contribution_request_audit',
            id: input.causationAuditId,
          },
        },
      })),
    });
    return { cancelledApplicationIds };
  }

  private assertRequestAcceptsApplications(
    context: ApplicationRequestContextDto | null,
    now: Date,
  ): asserts context is ApplicationRequestContextDto {
    if (!context || context.status === ContributionRequestStatus.draft) {
      throw new ForbiddenApplicationError(
        'This Contribution Request is not available for Applications',
        'APPLICATION_NOT_AUTHORIZED',
      );
    }
    if (context.status === ContributionRequestStatus.cancelled) {
      throw new ConflictApplicationError(
        'The Contribution Request was cancelled',
        'REQUEST_CANCELLED',
      );
    }
    if (context.status !== ContributionRequestStatus.published) {
      throw new ConflictApplicationError(
        'The Contribution Request no longer accepts Applications',
        'REQUEST_TERMINAL',
        { status: context.status },
      );
    }
    if (!context.applicationsCloseAt || context.applicationsCloseAt <= now) {
      throw new ConflictApplicationError(
        'Applications Close Time has passed',
        'APPLICATIONS_CLOSED',
      );
    }
  }

  private async readReplay(input: {
    actorId: string;
    action: ApplicationAuditAction;
    idempotencyKey: string | null;
    fingerprint: string;
  }): Promise<ApplicationWithSnapshots | null> {
    if (!input.idempotencyKey) return null;
    const audit = await this.database.applicationAudit.findFirst({
      where: {
        actor_id: input.actorId,
        action: input.action,
        idempotency_key: input.idempotencyKey,
      },
      include: { application: { include: APPLICATION_INCLUDE } },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  private async readReplayFromTransaction(input: {
    transaction: Prisma.TransactionClient;
    actorId: string;
    action: ApplicationAuditAction;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<ApplicationWithSnapshots | null> {
    const audit = await input.transaction.applicationAudit.findFirst({
      where: {
        actor_id: input.actorId,
        action: input.action,
        idempotency_key: input.idempotencyKey,
      },
      include: { application: { include: APPLICATION_INCLUDE } },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  private presentReplay(
    audit: Prisma.ApplicationAuditGetPayload<{
      include: { application: { include: typeof APPLICATION_INCLUDE } };
    }> | null,
    fingerprint: string,
  ): ApplicationWithSnapshots | null {
    if (!audit) return null;
    if (audit.command_fingerprint !== fingerprint) {
      throw new ConflictApplicationError(
        'Idempotency key was already used for another Application command',
        'APPLICATION_IDEMPOTENCY_CONFLICT',
      );
    }
    return audit.application;
  }

  private present(application: ApplicationWithSnapshots): ApplicationDto {
    const context = this.jsonObject(
      application.evidenceSnapshot?.contributor_context,
    );
    const requirements = this.jsonArray(
      application.requirementSnapshot?.requirements,
    );
    const evidence = this.jsonArray(application.evidenceSnapshot?.evidence);
    return {
      id: application.id,
      contributionRequestId: application.contribution_request_id,
      contributor: {
        id: application.contributor_id,
        username:
          typeof context.username === 'string' ? context.username : null,
        displayName:
          typeof context.displayName === 'string'
            ? context.displayName
            : 'Contributor',
      },
      profileContext: this.presentProfileContext(context.profile),
      contributionApproach:
        application.contribution_approach ?? application.cover_message,
      proposedDeliveryDurationDays: application.proposed_delivery_duration_days,
      status: this.presentStatus(application.status),
      requirementSnapshot: this.presentRequirements(requirements),
      evidenceSummary: evidence.map((item) => this.presentEvidence(item)),
      submittedAt: application.submitted_at,
      reviewDueAt: application.review_due_at,
      expiresAt: application.expires_at,
    };
  }

  private presentRequirements(
    items: unknown[],
  ): ApplicationRequirementSnapshotDto {
    const mapped = items.map((item) => this.jsonObject(item));
    const project = (kind: string) =>
      mapped
        .filter((item) => item.kind === kind)
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          position: typeof item.position === 'number' ? item.position : 0,
          text: typeof item.text === 'string' ? item.text : '',
        }));
    return { required: project('required'), preferred: project('preferred') };
  }

  private presentEvidence(item: unknown): ApplicationEvidenceSummaryDto {
    const value = this.jsonObject(item);
    const sources = this.jsonObject(value.evidenceSources);
    return {
      skillProfileId:
        typeof value.skillProfileId === 'string' ? value.skillProfileId : '',
      name: typeof value.name === 'string' ? value.name : '',
      proficiencyLevel:
        typeof value.proficiencyLevel === 'string'
          ? value.proficiencyLevel
          : 'beginner',
      evidenceSummary:
        typeof value.evidenceSummary === 'string'
          ? value.evidenceSummary
          : null,
      limitations: Array.isArray(sources.limitations)
        ? sources.limitations.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
    };
  }

  private presentProfileContext(value: unknown): ApplicationProfileContextDto {
    const profile = this.jsonObject(value);
    const experience = this.jsonObject(profile.experienceLevel);
    const fields = this.jsonArray(profile.fields).map((field) =>
      this.jsonObject(field),
    );
    return {
      bio: typeof profile.bio === 'string' ? profile.bio : null,
      availability:
        typeof profile.availability === 'string' ? profile.availability : null,
      experienceLevel:
        typeof experience.key === 'string'
          ? {
              key: experience.key,
              labelEn:
                typeof experience.labelEn === 'string'
                  ? experience.labelEn
                  : '',
              labelAr:
                typeof experience.labelAr === 'string'
                  ? experience.labelAr
                  : '',
            }
          : null,
      fields: fields
        .filter((field) => typeof field.key === 'string')
        .map((field) => ({
          key: field.key as string,
          labelEn: typeof field.labelEn === 'string' ? field.labelEn : '',
          labelAr: typeof field.labelAr === 'string' ? field.labelAr : '',
        })),
      declaredSkills: this.jsonArray(profile.declaredSkills).filter(
        (skill): skill is string => typeof skill === 'string',
      ),
    };
  }

  private async notify(
    application: ApplicationWithSnapshots,
    action: 'submitted' | 'withdrawn',
  ): Promise<void> {
    await this.notifications.createApplicationNotification({
      userId: application.contributionRequest.owner_id,
      applicationId: application.id,
      contributionRequestId: application.contribution_request_id,
      action,
    });
  }

  private assertActiveContributor(actor: AuthenticatedUser): void {
    if (actor.status !== 'active' || actor.role !== 'contributor') {
      throw new ForbiddenApplicationError(
        'An active contributor account is required',
        'APPLICATION_NOT_AUTHORIZED',
      );
    }
  }

  private assertActiveOwner(actor: AuthenticatedUser): void {
    if (actor.status !== 'active' || actor.role !== 'owner') {
      throw new ForbiddenApplicationError(
        'An active Project owner account is required',
        'APPLICATION_NOT_AUTHORIZED',
      );
    }
  }

  private assertActiveApplicationActor(actor: AuthenticatedUser): void {
    if (
      actor.status !== 'active' ||
      (actor.role !== 'owner' && actor.role !== 'contributor')
    ) {
      throw new ForbiddenApplicationError(
        'Application access is not authorized',
        'APPLICATION_NOT_AUTHORIZED',
      );
    }
  }

  private normalizeIdempotencyKey(value: string): string {
    const normalized = value.trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw new BadRequestApplicationError(
        'Application idempotency key must be a UUID',
        'APPLICATION_IDEMPOTENCY_KEY_INVALID',
      );
    }
    return normalized;
  }

  private alreadyApplied(): ConflictApplicationError {
    return new ConflictApplicationError(
      'An Application already exists for this Contribution Request',
      'ALREADY_APPLIED',
    );
  }

  private applicationNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Application was not found',
      'APPLICATION_NOT_FOUND',
    );
  }

  private presentStatus(status: ApplicationStatus): ApplicationStatusDto {
    return status.toUpperCase() as ApplicationStatusDto;
  }

  private addDays(value: Date, days: number): Date {
    return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private jsonArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private emptySummary(
    requestScopes: ApplicationRequestScopeDto[],
  ): PendingApplicationsOwnerWorkspaceSummaryDto {
    return {
      projects: requestScopes.map((scope) => ({
        projectId: scope.projectId,
        pendingApplicationCount: 0,
      })),
    };
  }
}
