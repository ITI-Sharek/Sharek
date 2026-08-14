import { createHash, randomUUID } from 'node:crypto';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import {
  ApplicationAuditAction,
  ApplicationStatus,
  ContributionRequestStatus,
  OwnerDecisionType,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import { AssignmentConversationsService } from '../assignment-conversations/assignment-conversations.service';
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
  OwnerDecisionReportContextDto,
  OwnerDecisionResultDto,
} from './dto/application-response.dto';
import { ApplicationRequestContextDto } from '../contribution-tasks/dto/application-request-context.dto';
import {
  ApplicationRequestScopeDto,
  PendingApplicationsOwnerWorkspaceSummaryDto,
} from './dto/owner-workspace-summary.dto';
import { DeliveryLifecycleApplicationContextDto } from './dto/delivery-lifecycle-context.dto';
import {
  APPLICATION_REVIEW_EXPIRY_DAYS,
  APPLICATION_REVIEW_OVERDUE_DAYS,
  APPLICATION_REVIEW_REMINDER_DAYS,
} from './application-review-window.policy';
import { ApplicationDailyQuotaService } from './services/application-daily-quota.service';

const APPLICATION_INCLUDE = {
  requirementSnapshot: true,
  evidenceSnapshot: true,
  contributionRequest: { select: { owner_id: true } },
  ownerDecision: true,
  assignment: true,
} satisfies Prisma.ApplicationInclude;

type ApplicationWithSnapshots = Prisma.ApplicationGetPayload<{
  include: typeof APPLICATION_INCLUDE;
}>;

const OWNER_DECISION_INCLUDE = {
  application: { include: APPLICATION_INCLUDE },
  assignment: true,
} satisfies Prisma.OwnerDecisionInclude;

type OwnerDecisionWithResult = Prisma.OwnerDecisionGetPayload<{
  include: typeof OWNER_DECISION_INCLUDE;
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
    private readonly dailyQuota: ApplicationDailyQuotaService,
    @Optional()
    private readonly assignmentConversations?: AssignmentConversationsService,
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
        // Taken before any other lock so one contributor's concurrent
        // submissions serialize here rather than racing each other's quota
        // reads further down.
        await this.dailyQuota.lockContributor(input.actor.id, transaction);
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

        // Last, so that nothing which would have refused the submission anyway
        // — a closed request, a replay, a duplicate — costs the contributor a
        // slot. Anything that throws after this point rolls the tally back with
        // the rest of the transaction.
        await this.dailyQuota.reserve({
          contributorId: input.actor.id,
          transaction,
          now,
        });

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
            review_due_at: this.addDays(now, APPLICATION_REVIEW_REMINDER_DAYS),
            expires_at: this.addDays(now, APPLICATION_REVIEW_EXPIRY_DAYS),
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
    await this.confirmOwnerDecisionActor({
      requestId: contributionRequestId,
      ownerId: actor.id,
    });
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
    if (!application) throw this.applicationNotFound();
    if (application.contributor_id !== actor.id) {
      if (actor.role !== 'owner') throw this.applicationNotFound();
      await this.confirmOwnerDecisionActor({
        requestId: application.contribution_request_id,
        ownerId: actor.id,
      });
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

  async accept(_input: {
    actor: AuthenticatedUser;
    applicationId: string;
    idempotencyKey?: string;
  }): Promise<OwnerDecisionResultDto> {
    this.assertActiveOwner(_input.actor);
    const idempotencyKey = this.normalizeRequiredIdempotencyKey(
      _input.idempotencyKey,
    );
    const fingerprint = this.fingerprint({
      action: OwnerDecisionType.accepted,
      applicationId: _input.applicationId,
    });
    let decision: OwnerDecisionWithResult;
    let notificationsToEmit: Parameters<
      NotificationsService['emitApplicationNotifications']
    >[0] = [];
    try {
      const result = await this.database.$transaction(async (transaction) => {
        const current = await transaction.application.findFirst({
          where: { id: _input.applicationId },
          include: APPLICATION_INCLUDE,
        });
        if (!current) throw this.applicationNotFound();
        await this.reconfirmOwnerDecisionActor({
          requestId: current.contribution_request_id,
          ownerId: _input.actor.id,
          transaction,
        });
        const transactionReplay =
          await this.readOwnerDecisionReplayFromTransaction({
            transaction,
            ownerId: _input.actor.id,
            idempotencyKey,
            fingerprint,
          });
        if (transactionReplay) {
          return { decision: transactionReplay, notifications: [] };
        }
        this.assertPendingOwnerDecision(current.status);
        const now = new Date();
        this.assertOwnerDecisionWindowOpen(current.expires_at, now);
        if (!current.proposed_delivery_duration_days) {
          throw new ConflictApplicationError(
            'The Application has no Proposed Delivery Duration',
            'APPLICATION_DELIVERY_DURATION_MISSING',
          );
        }

        const decisionId = randomUUID();
        const assignmentId = randomUUID();
        await this.contributionTasks.assignFromOwnerDecision({
          requestId: current.contribution_request_id,
          ownerId: _input.actor.id,
          ownerDecisionId: decisionId,
          idempotencyKey,
          commandFingerprint: fingerprint,
          transaction,
        });

        const lockedPendingApplications = await transaction.$queryRaw<
          Array<{ id: string; contributor_id: string }>
        >(Prisma.sql`
          SELECT "id", "contributor_id"
          FROM "Application"
          WHERE "contribution_request_id" = ${current.contribution_request_id}::uuid
            AND "status" = 'pending_owner_review'
          ORDER BY "id"
          FOR UPDATE
        `);
        if (
          !lockedPendingApplications.some(
            (application) => application.id === current.id,
          )
        ) {
          throw this.concurrentDecision();
        }
        const siblings = lockedPendingApplications.filter(
          (application) => application.id !== current.id,
        );

        await transaction.ownerDecision.create({
          data: {
            id: decisionId,
            application_id: current.id,
            contribution_request_id: current.contribution_request_id,
            owner_id: _input.actor.id,
            decision_type: OwnerDecisionType.accepted,
            feedback: null,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            decided_at: now,
          },
        });
        const accepted = await transaction.application.updateMany({
          where: {
            id: current.id,
            status: ApplicationStatus.pending_owner_review,
          },
          data: {
            status: ApplicationStatus.accepted,
            owner_reviewed_at: now,
          },
        });
        if (accepted.count !== 1) throw this.concurrentDecision();

        await transaction.assignment.create({
          data: {
            id: assignmentId,
            contribution_request_id: current.contribution_request_id,
            application_id: current.id,
            owner_decision_id: decisionId,
            contributor_id: current.contributor_id,
            agreed_delivery_duration_days:
              current.proposed_delivery_duration_days,
            agreed_delivery_due_at: this.addDays(
              now,
              current.proposed_delivery_duration_days,
            ),
            assigned_at: now,
          },
        });
        await this.assignmentConversations?.ensureForAssignment({
          assignmentId,
          transaction,
        });
        await transaction.applicationAudit.create({
          data: {
            application_id: current.id,
            actor_id: _input.actor.id,
            action: ApplicationAuditAction.accepted,
            from_status: ApplicationStatus.pending_owner_review,
            to_status: ApplicationStatus.accepted,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: {
              payloadVersion: 1,
              ownerDecisionId: decisionId,
              assignmentId,
            },
          },
        });

        if (siblings.length > 0) {
          const closed = await transaction.application.updateMany({
            where: {
              contribution_request_id: current.contribution_request_id,
              id: { not: current.id },
              status: ApplicationStatus.pending_owner_review,
            },
            data: { status: ApplicationStatus.not_selected },
          });
          if (closed.count !== siblings.length) {
            throw this.concurrentDecision();
          }
          await transaction.applicationAudit.createMany({
            data: siblings.map((sibling) => ({
              application_id: sibling.id,
              actor_id: _input.actor.id,
              action: ApplicationAuditAction.not_selected,
              from_status: ApplicationStatus.pending_owner_review,
              to_status: ApplicationStatus.not_selected,
              idempotency_key: `${idempotencyKey}:${sibling.id}`,
              command_fingerprint: fingerprint,
              metadata: {
                payloadVersion: 1,
                selectedApplicationId: current.id,
                ownerDecisionId: decisionId,
              },
            })),
          });
        }

        const notificationResults = [];
        notificationResults.push(
          await this.notifications.createApplicationNotification(
            {
              userId: current.contributor_id,
              applicationId: current.id,
              contributionRequestId: current.contribution_request_id,
              action: 'accepted',
            },
            { transaction, emitRealtime: false },
          ),
        );
        for (const sibling of siblings) {
          notificationResults.push(
            await this.notifications.createApplicationNotification(
              {
                userId: sibling.contributor_id,
                applicationId: sibling.id,
                contributionRequestId: current.contribution_request_id,
                action: 'not_selected',
              },
              { transaction, emitRealtime: false },
            ),
          );
        }
        const savedDecision = await transaction.ownerDecision.findUniqueOrThrow({
          where: { id: decisionId },
          include: OWNER_DECISION_INCLUDE,
        });
        return {
          decision: savedDecision,
          notifications: notificationResults
            .filter((notification) => notification.created)
            .map((notification) => notification.notification),
        };
      });
      decision = result.decision;
      notificationsToEmit = result.notifications;
    } catch (error) {
      decision = await this.resolveOwnerDecisionRaceOrThrow({
        error,
        ownerId: _input.actor.id,
        idempotencyKey,
        fingerprint,
      });
    }

    this.notifications.emitApplicationNotifications(notificationsToEmit);
    return this.presentOwnerDecisionResult(decision);
  }

  async decline(_input: {
    actor: AuthenticatedUser;
    applicationId: string;
    feedback: string;
    idempotencyKey?: string;
  }): Promise<OwnerDecisionResultDto> {
    this.assertActiveOwner(_input.actor);
    const feedback = this.normalizeDeclineFeedback(_input.feedback);
    const idempotencyKey = this.normalizeRequiredIdempotencyKey(
      _input.idempotencyKey,
    );
    const fingerprint = this.fingerprint({
      action: OwnerDecisionType.declined,
      applicationId: _input.applicationId,
      feedback,
    });
    let decision: OwnerDecisionWithResult;
    let notificationsToEmit: Parameters<
      NotificationsService['emitApplicationNotifications']
    >[0] = [];
    try {
      const result = await this.database.$transaction(async (transaction) => {
        const current = await transaction.application.findFirst({
          where: { id: _input.applicationId },
          include: APPLICATION_INCLUDE,
        });
        if (!current) throw this.applicationNotFound();
        await this.reconfirmOwnerDecisionActor({
          requestId: current.contribution_request_id,
          ownerId: _input.actor.id,
          transaction,
        });
        const transactionReplay =
          await this.readOwnerDecisionReplayFromTransaction({
            transaction,
            ownerId: _input.actor.id,
            idempotencyKey,
            fingerprint,
          });
        if (transactionReplay) {
          return { decision: transactionReplay, notifications: [] };
        }
        this.assertPendingOwnerDecision(current.status);

        const now = new Date();
        this.assertOwnerDecisionWindowOpen(current.expires_at, now);
        const decisionId = randomUUID();
        await transaction.ownerDecision.create({
          data: {
            id: decisionId,
            application_id: current.id,
            contribution_request_id: current.contribution_request_id,
            owner_id: _input.actor.id,
            decision_type: OwnerDecisionType.declined,
            feedback,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            decided_at: now,
          },
        });
        const updated = await transaction.application.updateMany({
          where: {
            id: current.id,
            status: ApplicationStatus.pending_owner_review,
          },
          data: {
            status: ApplicationStatus.declined_by_owner,
            owner_reviewed_at: now,
          },
        });
        if (updated.count !== 1) throw this.concurrentDecision();
        await transaction.applicationAudit.create({
          data: {
            application_id: current.id,
            actor_id: _input.actor.id,
            action: ApplicationAuditAction.declined_by_owner,
            from_status: ApplicationStatus.pending_owner_review,
            to_status: ApplicationStatus.declined_by_owner,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: { payloadVersion: 1, ownerDecisionId: decisionId },
          },
        });
        const notification =
          await this.notifications.createApplicationNotification(
            {
              userId: current.contributor_id,
              applicationId: current.id,
              contributionRequestId: current.contribution_request_id,
              action: 'declined_by_owner',
            },
            { transaction, emitRealtime: false },
          );
        const savedDecision = await transaction.ownerDecision.findUniqueOrThrow({
          where: { id: decisionId },
          include: OWNER_DECISION_INCLUDE,
        });
        return {
          decision: savedDecision,
          notifications: notification.created
            ? [notification.notification]
            : [],
        };
      });
      decision = result.decision;
      notificationsToEmit = result.notifications;
    } catch (error) {
      decision = await this.resolveOwnerDecisionRaceOrThrow({
        error,
        ownerId: _input.actor.id,
        idempotencyKey,
        fingerprint,
      });
    }

    this.notifications.emitApplicationNotifications(notificationsToEmit);
    return this.presentOwnerDecisionResult(decision);
  }

  async getOwnerDecisionReportContext(
    actor: AuthenticatedUser,
    ownerDecisionId: string,
  ): Promise<OwnerDecisionReportContextDto> {
    this.assertActiveContributor(actor);
    const decision = await this.database.ownerDecision.findFirst({
      where: {
        id: ownerDecisionId,
        decision_type: OwnerDecisionType.declined,
        application: { contributor_id: actor.id },
      },
      select: {
        id: true,
        application_id: true,
        contribution_request_id: true,
        owner_id: true,
        feedback: true,
        application: { select: { contributor_id: true } },
      },
    });
    if (!decision?.feedback) {
      throw new NotFoundApplicationError(
        'Owner Decision was not found',
        'OWNER_DECISION_NOT_FOUND',
      );
    }
    return {
      ownerDecisionId: decision.id,
      applicationId: decision.application_id,
      contributionRequestId: decision.contribution_request_id,
      contributorId: decision.application.contributor_id,
      ownerId: decision.owner_id,
      feedback: decision.feedback,
    };
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

  private async readOwnerDecisionReplay(input: {
    ownerId: string;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<OwnerDecisionWithResult | null> {
    const decision = await this.database.ownerDecision.findUnique({
      where: {
        owner_id_idempotency_key: {
          owner_id: input.ownerId,
          idempotency_key: input.idempotencyKey,
        },
      },
      include: OWNER_DECISION_INCLUDE,
    });
    return this.presentOwnerDecisionReplay(decision, input.fingerprint);
  }

  private async readOwnerDecisionReplayFromTransaction(input: {
    transaction: Prisma.TransactionClient;
    ownerId: string;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<OwnerDecisionWithResult | null> {
    const decision = await input.transaction.ownerDecision.findUnique({
      where: {
        owner_id_idempotency_key: {
          owner_id: input.ownerId,
          idempotency_key: input.idempotencyKey,
        },
      },
      include: OWNER_DECISION_INCLUDE,
    });
    return this.presentOwnerDecisionReplay(decision, input.fingerprint);
  }

  private presentOwnerDecisionReplay(
    decision: OwnerDecisionWithResult | null,
    fingerprint: string,
  ): OwnerDecisionWithResult | null {
    if (!decision) return null;
    if (decision.command_fingerprint !== fingerprint) {
      throw new ConflictApplicationError(
        'Idempotency key was already used for another Owner Decision',
        'APPLICATION_IDEMPOTENCY_CONFLICT',
      );
    }
    return decision;
  }

  private async resolveOwnerDecisionRaceOrThrow(input: {
    error: unknown;
    ownerId: string;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<OwnerDecisionWithResult> {
    const mayHaveLostRace =
      (input.error instanceof Prisma.PrismaClientKnownRequestError &&
        input.error.code === 'P2002') ||
      (input.error instanceof ConflictApplicationError &&
        [
          'APPLICATION_CONCURRENT_MODIFICATION',
          'APPLICATION_TERMINAL',
          'REQUEST_TERMINAL',
        ].includes(input.error.code));
    if (mayHaveLostRace) {
      const replay = await this.readOwnerDecisionReplay(input);
      if (replay) return replay;
      if (
        input.error instanceof Prisma.PrismaClientKnownRequestError &&
        input.error.code === 'P2002'
      ) {
        throw this.concurrentDecision();
      }
    }
    throw input.error;
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
      expiredAt: application.expired_at,
      overdue:
        application.status === ApplicationStatus.pending_owner_review &&
        Date.now() >=
          this.addDays(
            application.submitted_at,
            APPLICATION_REVIEW_OVERDUE_DAYS,
          ).getTime(),
      ownerDecision: application.ownerDecision
        ? this.presentOwnerDecision(application.ownerDecision)
        : null,
      assignment: application.assignment
        ? this.presentAssignment(application.assignment)
        : null,
    };
  }

  private presentOwnerDecisionResult(
    decision: OwnerDecisionWithResult,
  ): OwnerDecisionResultDto {
    return {
      application: this.present(decision.application),
      ownerDecision: this.presentOwnerDecision(decision),
      assignment: decision.assignment
        ? this.presentAssignment(decision.assignment)
        : null,
    };
  }

  private presentOwnerDecision(
    decision: Prisma.OwnerDecisionGetPayload<Record<string, never>>,
  ) {
    return {
      id: decision.id,
      applicationId: decision.application_id,
      contributionRequestId: decision.contribution_request_id,
      decisionType:
        decision.decision_type === OwnerDecisionType.accepted
          ? ('ACCEPTED' as const)
          : ('DECLINED' as const),
      feedback: decision.feedback,
      decidedAt: decision.decided_at,
    };
  }

  private presentAssignment(
    assignment: Prisma.AssignmentGetPayload<Record<string, never>>,
  ) {
    return {
      id: assignment.id,
      contributionRequestId: assignment.contribution_request_id,
      applicationId: assignment.application_id,
      ownerDecisionId: assignment.owner_decision_id,
      contributorId: assignment.contributor_id,
      agreedDeliveryDurationDays:
        assignment.agreed_delivery_duration_days,
      agreedDeliveryDueDate: assignment.agreed_delivery_due_at,
      assignedAt: assignment.assigned_at,
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

  private normalizeRequiredIdempotencyKey(value?: string): string {
    if (!value) {
      throw new BadRequestApplicationError(
        'Idempotency-Key is required for an Owner Decision',
        'APPLICATION_IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    return this.normalizeIdempotencyKey(value);
  }

  private normalizeDeclineFeedback(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestApplicationError(
        'Owner decision feedback is required when declining an Application',
        'APPLICATION_DECISION_FEEDBACK_REQUIRED',
      );
    }
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestApplicationError(
        'Owner decision feedback is required when declining an Application',
        'APPLICATION_DECISION_FEEDBACK_REQUIRED',
      );
    }
    return normalized;
  }

  private async reconfirmOwnerDecisionActor(input: {
    requestId: string;
    ownerId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<void> {
    try {
      await this.contributionTasks.reconfirmOwnerDecisionActor(input);
    } catch (error) {
      if (
        error instanceof NotFoundApplicationError &&
        error.code !== 'APPLICATION_NOT_FOUND'
      ) {
        throw this.applicationNotFound();
      }
      throw error;
    }
  }

  private async confirmOwnerDecisionActor(input: {
    requestId: string;
    ownerId: string;
  }): Promise<void> {
    try {
      await this.contributionTasks.confirmOwnerDecisionActor(input);
    } catch (error) {
      if (error instanceof NotFoundApplicationError) {
        throw this.applicationNotFound();
      }
      throw error;
    }
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

  private assertPendingOwnerDecision(status: ApplicationStatus): void {
    if (status !== ApplicationStatus.pending_owner_review) {
      throw new ConflictApplicationError(
        'Only a pending Application can receive an Owner Decision',
        'APPLICATION_TERMINAL',
        { status },
      );
    }
  }

  private assertOwnerDecisionWindowOpen(
    expiresAt: Date | null,
    now: Date,
  ): void {
    if (expiresAt !== null && expiresAt <= now) {
      throw new ConflictApplicationError(
        'Only a pending Application can receive an Owner Decision',
        'APPLICATION_TERMINAL',
        { status: ApplicationStatus.expired },
      );
    }
  }

  private concurrentDecision(): ConflictApplicationError {
    return new ConflictApplicationError(
      'Application changed during the Owner Decision',
      'APPLICATION_CONCURRENT_MODIFICATION',
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

  async lockDeliverySubmissionContext(input: {
    applicationId: string;
    contributorId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<{
    applicationId: string;
    contributionRequestId: string;
    contributorId: string;
    status: ApplicationStatus;
  }> {
    const applications = await input.transaction.$queryRaw<
      Array<{
        id: string;
        contribution_request_id: string;
        contributor_id: string;
        status: ApplicationStatus;
      }>
    >(Prisma.sql`
      SELECT "id", "contribution_request_id", "contributor_id", "status"
      FROM "Application"
      WHERE "id" = ${input.applicationId}::uuid
      FOR UPDATE
    `);
    const application = applications[0];
    if (!application || application.contributor_id !== input.contributorId) {
      throw new ForbiddenApplicationError(
        'The Application is not available for Delivery submission',
        'DELIVERY_NOT_AUTHORIZED',
      );
    }
    if (application.status !== ApplicationStatus.accepted) {
      throw new ConflictApplicationError(
        'Only an accepted Application can submit a Delivery',
        'APPLICATION_NOT_ACCEPTED',
        { status: application.status },
      );
    }
    return {
      applicationId: application.id,
      contributionRequestId: application.contribution_request_id,
      contributorId: application.contributor_id,
      status: application.status,
    };
  }

  async listDeliveryLifecycleContextsForContributor(
    contributorId: string,
  ): Promise<DeliveryLifecycleApplicationContextDto[]> {
    return this.listDeliveryLifecycleContexts({ contributor_id: contributorId });
  }

  async listDeliveryLifecycleContextsForOwner(
    contributionRequestIds: string[],
  ): Promise<DeliveryLifecycleApplicationContextDto[]> {
    if (contributionRequestIds.length === 0) return [];
    return this.listDeliveryLifecycleContexts({
      contribution_request_id: { in: contributionRequestIds },
    });
  }

  private async listDeliveryLifecycleContexts(
    where: Prisma.ApplicationWhereInput,
  ): Promise<DeliveryLifecycleApplicationContextDto[]> {
    const applications = await this.database.application.findMany({
      where,
      select: {
        id: true,
        contribution_request_id: true,
        contributor_id: true,
        status: true,
        contributionRequest: { select: { title: true } },
        contributor: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            avatar_url: true,
          },
        },
        assignment: {
          select: {
            agreed_delivery_due_at: true,
            assigned_at: true,
          },
        },
      },
      orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
    });
    return applications.map((application) => ({
      applicationId: application.id,
      contributionRequestId: application.contribution_request_id,
      contributionRequestTitle: application.contributionRequest.title,
      contributorId: application.contributor_id,
      contributor: {
        id: application.contributor.id,
        username: application.contributor.username,
        displayName:
          `${application.contributor.first_name} ${application.contributor.last_name}`.trim(),
        avatarUrl: application.contributor.avatar_url,
      },
      applicationStatus: this.presentStatus(application.status),
      deliveryDueAt: application.assignment?.agreed_delivery_due_at ?? null,
      assignedAt: application.assignment?.assigned_at ?? null,
    }));
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
