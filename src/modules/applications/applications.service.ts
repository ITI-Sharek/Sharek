import { randomUUID } from 'node:crypto';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import {
  ApplicationAuditAction,
  ApplicationStatus,
  OwnerDecisionType,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import { AssignmentConversationsService } from '../assignment-conversations/assignment-conversations.service';
import {
  ConflictApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { ContributionTasksService } from '../contribution-tasks/services/contribution-tasks.service';
import { ContributorProfilesService } from '../contributor-profiles/contributor-profiles.service';
import { IdentityUsernameService } from '../identity/services/identity-username.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SkillProfileSummaryService } from '../skill-profiles/services/skill-profile-summary.service';
import { BlockingSkillDto } from '../eligibility/dto/eligibility.dto';
import { EligibilityService } from '../eligibility/services/eligibility.service';
import {
  ApplicationDto,
  OwnerApplicationsDto,
  OwnerDecisionReportContextDto,
  OwnerDecisionResultDto,
} from './dto/application-response.dto';
import {
  ApplicationRequestScopeDto,
  PendingApplicationsOwnerWorkspaceSummaryDto,
} from './dto/owner-workspace-summary.dto';
import {
  APPLICATION_REVIEW_EXPIRY_DAYS,
  APPLICATION_REVIEW_REMINDER_DAYS,
} from './application-review-window.policy';
import {
  addDays,
  ApplicationWithSnapshots,
  OwnerDecisionWithResult,
  toApplicationDto,
  toEmptyOwnerWorkspaceSummaryDto,
  toJsonObject,
  toOwnerDecisionResultDto,
} from './mappers/application.mapper';
import { ApplicationRepository } from './repositories/application.repository';
import { ApplicationDailyQuotaService } from './services/application-daily-quota.service';
import {
  ApplicationReplayService,
  applicationCommandFingerprint,
} from './services/application-replay.service';
import {
  alreadyApplied,
  applicationNotFound,
  concurrentDecision,
  normalizeDeclineFeedback,
  normalizeIdempotencyKey,
  normalizeRequiredIdempotencyKey,
} from './policies/application-command.policy';
import {
  assertActiveApplicationActor,
  assertActiveContributor,
  assertActiveOwner,
} from './policies/application-actor.policy';
import {
  assertOwnerDecisionWindowOpen,
  assertPendingOwnerDecision,
  assertRequestAcceptsApplications,
} from './policies/application-window.policy';

@Injectable()
export class ApplicationsService {
  private readonly applications: ApplicationRepository;

  constructor(
    private readonly database: DatabaseService,
    @Inject(forwardRef(() => ContributionTasksService))
    private readonly contributionTasks: ContributionTasksService,
    private readonly skillProfiles: SkillProfileSummaryService,
    @Inject(forwardRef(() => EligibilityService))
    private readonly eligibility: EligibilityService,
    private readonly identity: IdentityUsernameService,
    private readonly notifications: NotificationsService,
    private readonly contributorProfiles: ContributorProfilesService,
    private readonly dailyQuota: ApplicationDailyQuotaService,
    private readonly replay: ApplicationReplayService,
    @Optional()
    private readonly assignmentConversations?: AssignmentConversationsService,
  ) {
    this.applications = new ApplicationRepository(database);
  }

  async submit(input: {
    actor: AuthenticatedUser;
    contributionRequestId: string;
    contributionApproach: string;
    proposedDeliveryDurationDays: number;
    idempotencyKey: string;
  }): Promise<ApplicationDto> {
    assertActiveContributor(input.actor);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = applicationCommandFingerprint({
      action: ApplicationAuditAction.submitted,
      contributionRequestId: input.contributionRequestId,
      contributionApproach: input.contributionApproach,
      proposedDeliveryDurationDays: input.proposedDeliveryDurationDays,
    });
    const replay = await this.replay.readReplay({
      actorId: input.actor.id,
      action: ApplicationAuditAction.submitted,
      idempotencyKey,
      fingerprint,
    });
    if (replay) {
      await this.notify(replay, 'submitted');
      return toApplicationDto(replay);
    }

    const context =
      await this.contributionTasks.getApplicationSubmissionContext(
        input.contributionRequestId,
      );
    assertRequestAcceptsApplications(context, new Date());
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
      application = await this.applications.inTransaction(async (transaction) => {
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
        assertRequestAcceptsApplications(locked, now);
        const transactionReplay = await this.replay.readReplayFromTransaction({
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

        const existing = await this.applications.findDuplicateForContributor(
          {
            contributionRequestId: input.contributionRequestId,
            contributorId: input.actor.id,
          },
          transaction,
        );
        if (existing) throw alreadyApplied();

        // THE GATE (DEC-078, ADR 0015).
        //
        // Here, not before the transaction: it must run against the same locked
        // rows the Application is about to be written from. A verdict computed
        // earlier — including one `GET /tasks/:id/eligibility` returned a second
        // ago — can be stale by now, and trusting it is the TOCTOU the gate
        // would otherwise have.
        //
        // Before `dailyQuota.reserve` and after the duplicate check, so a
        // blocked attempt costs no daily slot (DEC-079) and someone who already
        // applied gets the accurate duplicate error rather than a skill block.
        const verdict = await this.eligibility.evaluateForRequest({
          contributorId: input.actor.id,
          contributionRequestId: input.contributionRequestId,
          requiredSkills: locked!.skillRequirements,
          transaction,
        });
        if (verdict.outcome === 'blocked') {
          // Throwing here is what makes "no Application row exists" true: the
          // block happens before the Application is written, so no new status
          // is needed and the state machine is untouched. Every superseded
          // AI-gate status stays deleted.
          //
          // Carried out as a marker so the refusal can be recorded *after* this
          // transaction rolls back — a row written inside it would vanish with
          // everything else, and the evaluation is the artefact a dispute is
          // argued from.
          throw new ApplicationBlockedBySkillGap(verdict.blockingSkills);
        }

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
        await this.applications.createRequirementSnapshot(
          {
            requirementSnapshotId,
            contributionRequestId: input.contributionRequestId,
            sourceRequestUpdatedAt: locked!.updatedAt,
            requirements: locked!.requirements.map((requirement) => ({
              id: requirement.id,
              kind: requirement.kind,
              position: requirement.position,
              text: requirement.text,
            })) as unknown as Prisma.InputJsonValue,
            // The level bar as it stood at this instant (DEC-078, ADR 0015).
            // Snapshotting it is what makes a refusal reproducible: the owner
            // can never publish an edit that retroactively changes why an
            // earlier contributor was blocked, because the evaluation reads
            // this frozen copy rather than the live rows. Both `required` and
            // `preferred` rows are recorded — the snapshot is the historical
            // record of what was asked, and it is the evaluation that ignores
            // `preferred`.
            skillRequirements: locked!.skillRequirements.map((skill) => ({
              id: skill.id,
              skillName: skill.skillName,
              skillNameNormalized: skill.skillNameNormalized,
              requiredLevel: skill.requiredLevel,
              kind: skill.kind,
              position: skill.position,
            })) as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        await this.applications.createEvidenceSnapshot(
          {
            evidenceSnapshotId,
            contributorId: input.actor.id,
            contributorContext:
              contributorContext as unknown as Prisma.InputJsonValue,
            evidence: approvedSkills.map((skill) => ({
              ...skill,
              evidenceSources: toJsonObject(skill.evidenceSources),
            })) as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        const created = await this.applications.createSubmittedApplication(
          {
            applicationId,
            contributionRequestId: input.contributionRequestId,
            contributorId: input.actor.id,
            contributionApproach: input.contributionApproach,
            proposedDeliveryDurationDays: input.proposedDeliveryDurationDays,
            requirementSnapshotId,
            evidenceSnapshotId,
            submittedAt: now,
            reviewDueAt: addDays(now, APPLICATION_REVIEW_REMINDER_DAYS),
            expiresAt: addDays(now, APPLICATION_REVIEW_EXPIRY_DAYS),
          },
          transaction,
        );
        await this.applications.createSubmittedAudit(
          {
            applicationId: created.id,
            actorId: input.actor.id,
            idempotencyKey,
            commandFingerprint: fingerprint,
          },
          transaction,
        );
        return created;
      });
    } catch (error) {
      if (error instanceof ApplicationBlockedBySkillGap) {
        // The transaction has rolled back, so nothing exists for this attempt:
        // no Application, no snapshot, no audit row, and no daily slot spent.
        // The refusal is recorded now, on a fresh connection, because it is the
        // artefact a dispute is argued from and the handle skill-gap guidance
        // will hang on.
        const eligibilityEvaluationId = await this.eligibility.recordBlocked({
          contributorId: input.actor.id,
          contributionRequestId: input.contributionRequestId,
          blockingSkills: error.blockingSkills,
        });
        // Returned to the caller, because guidance is scoped to the recorded
        // evaluation and this refusal is the only place its id exists. Without
        // it the UI can name the gap but never ask for the narrative, which is
        // the whole second half of P0-B05.
        throw this.eligibility.blockedError(
          'APPLICATION_BLOCKED_SKILL_GAP',
          error.blockingSkills,
          eligibilityEvaluationId,
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const lostRace = await this.replay.readReplay({
          actorId: input.actor.id,
          action: ApplicationAuditAction.submitted,
          idempotencyKey,
          fingerprint,
        });
        if (lostRace) application = lostRace;
        else throw alreadyApplied();
      } else {
        throw error;
      }
    }
    await this.notify(application, 'submitted');
    return toApplicationDto(application);
  }

  /**
   * The Contribution Requests this contributor has already applied to, in any
   * status. Exported so the matching module can exclude them without reading
   * Application rows.
   *
   * Every status counts, not only pending ones: a contributor who withdrew or
   * was not selected has already seen the Request and decided about it, so
   * re-surfacing it as a fresh match would be noise rather than a
   * recommendation.
   */
  async listAppliedContributionRequestIds(
    contributorId: string,
  ): Promise<string[]> {
    return this.applications.findAppliedContributionRequestIds(contributorId);
  }

  async listForOwner(
    actor: AuthenticatedUser,
    contributionRequestId: string,
  ): Promise<OwnerApplicationsDto> {
    assertActiveOwner(actor);
    await this.confirmOwnerDecisionActor({
      requestId: contributionRequestId,
      ownerId: actor.id,
    });
    const applications = await this.applications.findPendingForRequest(
      contributionRequestId,
    );
    return {
      applications: applications.map((application) =>
        toApplicationDto(application),
      ),
    };
  }

  async getForActor(
    actor: AuthenticatedUser,
    applicationId: string,
  ): Promise<ApplicationDto> {
    assertActiveApplicationActor(actor);
    const application = await this.applications.findById(applicationId);
    if (!application) throw applicationNotFound();
    if (application.contributor_id !== actor.id) {
      if (actor.role !== 'owner') throw applicationNotFound();
      await this.confirmOwnerDecisionActor({
        requestId: application.contribution_request_id,
        ownerId: actor.id,
      });
    }
    return toApplicationDto(application);
  }

  async withdraw(input: {
    actor: AuthenticatedUser;
    applicationId: string;
    idempotencyKey?: string;
  }): Promise<ApplicationDto> {
    assertActiveContributor(input.actor);
    const idempotencyKey = input.idempotencyKey
      ? normalizeIdempotencyKey(input.idempotencyKey)
      : null;
    const fingerprint = applicationCommandFingerprint({
      action: ApplicationAuditAction.withdrawn,
      applicationId: input.applicationId,
    });
    const replay = await this.replay.readReplay({
      actorId: input.actor.id,
      action: ApplicationAuditAction.withdrawn,
      idempotencyKey,
      fingerprint,
    });
    if (replay) {
      await this.notify(replay, 'withdrawn');
      return toApplicationDto(replay);
    }

    let application: ApplicationWithSnapshots;
    try {
      application = await this.applications.inTransaction(async (transaction) => {
        const current = await this.applications.findOwnedApplication(
          { applicationId: input.applicationId, contributorId: input.actor.id },
          transaction,
        );
        if (!current) throw applicationNotFound();
        if (current.status === ApplicationStatus.withdrawn) return current;
        if (current.status !== ApplicationStatus.pending_owner_review) {
          throw new ConflictApplicationError(
            'Only a pending Application can be withdrawn',
            'APPLICATION_TERMINAL',
            { status: current.status },
          );
        }
        const updated = await this.applications.markWithdrawn(
          { applicationId: input.applicationId, contributorId: input.actor.id },
          transaction,
        );
        if (updated.count !== 1) {
          throw new ConflictApplicationError(
            'Application changed during withdrawal',
            'APPLICATION_CONCURRENT_MODIFICATION',
          );
        }
        await this.applications.createWithdrawnAudit(
          {
            applicationId: input.applicationId,
            actorId: input.actor.id,
            idempotencyKey,
            commandFingerprint: fingerprint,
          },
          transaction,
        );
        return this.applications.findByIdOrThrow(
          input.applicationId,
          transaction,
        );
      });
    } catch (error) {
      const mayHaveLostRetryRace =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code === 'P2002'
          : error instanceof ConflictApplicationError &&
            error.code === 'APPLICATION_CONCURRENT_MODIFICATION';
      if (idempotencyKey && mayHaveLostRetryRace) {
        const lostRace = await this.replay.readReplay({
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
    return toApplicationDto(application);
  }

  async accept(_input: {
    actor: AuthenticatedUser;
    applicationId: string;
    idempotencyKey?: string;
  }): Promise<OwnerDecisionResultDto> {
    assertActiveOwner(_input.actor);
    const idempotencyKey = normalizeRequiredIdempotencyKey(
      _input.idempotencyKey,
    );
    const fingerprint = applicationCommandFingerprint({
      action: OwnerDecisionType.accepted,
      applicationId: _input.applicationId,
    });
    let decision: OwnerDecisionWithResult;
    let notificationsToEmit: Parameters<
      NotificationsService['emitApplicationNotifications']
    >[0] = [];
    try {
      const result = await this.applications.inTransaction(async (transaction) => {
        const current = await this.applications.findFirstById(
          _input.applicationId,
          transaction,
        );
        if (!current) throw applicationNotFound();
        await this.reconfirmOwnerDecisionActor({
          requestId: current.contribution_request_id,
          ownerId: _input.actor.id,
          transaction,
        });
        const transactionReplay =
          await this.replay.readOwnerDecisionReplayFromTransaction({
            transaction,
            ownerId: _input.actor.id,
            idempotencyKey,
            fingerprint,
          });
        if (transactionReplay) {
          return { decision: transactionReplay, notifications: [] };
        }
        assertPendingOwnerDecision(current.status);
        const now = new Date();
        assertOwnerDecisionWindowOpen(current.expires_at, now);
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

        const lockedPendingApplications =
          await this.applications.lockPendingApplicationsForUpdate(
            current.contribution_request_id,
            transaction,
          );
        if (
          !lockedPendingApplications.some(
            (application) => application.id === current.id,
          )
        ) {
          throw concurrentDecision();
        }
        const siblings = lockedPendingApplications.filter(
          (application) => application.id !== current.id,
        );

        await this.applications.createOwnerDecision(
          {
            decisionId,
            applicationId: current.id,
            contributionRequestId: current.contribution_request_id,
            ownerId: _input.actor.id,
            decisionType: OwnerDecisionType.accepted,
            feedback: null,
            idempotencyKey,
            commandFingerprint: fingerprint,
            decidedAt: now,
          },
          transaction,
        );
        const accepted = await this.applications.markAccepted(
          { applicationId: current.id, reviewedAt: now },
          transaction,
        );
        if (accepted.count !== 1) throw concurrentDecision();

        await this.applications.createAssignment(
          {
            assignmentId,
            contributionRequestId: current.contribution_request_id,
            applicationId: current.id,
            ownerDecisionId: decisionId,
            contributorId: current.contributor_id,
            agreedDeliveryDurationDays: current.proposed_delivery_duration_days,
            agreedDeliveryDueAt: addDays(
              now,
              current.proposed_delivery_duration_days,
            ),
            assignedAt: now,
          },
          transaction,
        );
        await this.assignmentConversations?.ensureForAssignment({
          assignmentId,
          transaction,
        });
        await this.applications.createAcceptedAudit(
          {
            applicationId: current.id,
            actorId: _input.actor.id,
            idempotencyKey,
            commandFingerprint: fingerprint,
            ownerDecisionId: decisionId,
            assignmentId,
          },
          transaction,
        );

        if (siblings.length > 0) {
          const closed = await this.applications.closeSiblingsForDecision(
            {
              contributionRequestId: current.contribution_request_id,
              exceptApplicationId: current.id,
            },
            transaction,
          );
          if (closed.count !== siblings.length) {
            throw concurrentDecision();
          }
          await this.applications.createNotSelectedAudits(
            {
              siblings,
              actorId: _input.actor.id,
              idempotencyKey,
              commandFingerprint: fingerprint,
              selectedApplicationId: current.id,
              ownerDecisionId: decisionId,
            },
            transaction,
          );
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
        const savedDecision = await this.applications.findDecisionByIdOrThrow(
          decisionId,
          transaction,
        );
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
      decision = await this.replay.resolveOwnerDecisionRaceOrThrow({
        error,
        ownerId: _input.actor.id,
        idempotencyKey,
        fingerprint,
      });
    }

    this.notifications.emitApplicationNotifications(notificationsToEmit);
    return toOwnerDecisionResultDto(decision);
  }

  async decline(_input: {
    actor: AuthenticatedUser;
    applicationId: string;
    feedback: string;
    idempotencyKey?: string;
  }): Promise<OwnerDecisionResultDto> {
    assertActiveOwner(_input.actor);
    const feedback = normalizeDeclineFeedback(_input.feedback);
    const idempotencyKey = normalizeRequiredIdempotencyKey(
      _input.idempotencyKey,
    );
    const fingerprint = applicationCommandFingerprint({
      action: OwnerDecisionType.declined,
      applicationId: _input.applicationId,
      feedback,
    });
    let decision: OwnerDecisionWithResult;
    let notificationsToEmit: Parameters<
      NotificationsService['emitApplicationNotifications']
    >[0] = [];
    try {
      const result = await this.applications.inTransaction(async (transaction) => {
        const current = await this.applications.findFirstById(
          _input.applicationId,
          transaction,
        );
        if (!current) throw applicationNotFound();
        await this.reconfirmOwnerDecisionActor({
          requestId: current.contribution_request_id,
          ownerId: _input.actor.id,
          transaction,
        });
        const transactionReplay =
          await this.replay.readOwnerDecisionReplayFromTransaction({
            transaction,
            ownerId: _input.actor.id,
            idempotencyKey,
            fingerprint,
          });
        if (transactionReplay) {
          return { decision: transactionReplay, notifications: [] };
        }
        assertPendingOwnerDecision(current.status);

        const now = new Date();
        assertOwnerDecisionWindowOpen(current.expires_at, now);
        const decisionId = randomUUID();
        await this.applications.createOwnerDecision(
          {
            decisionId,
            applicationId: current.id,
            contributionRequestId: current.contribution_request_id,
            ownerId: _input.actor.id,
            decisionType: OwnerDecisionType.declined,
            feedback,
            idempotencyKey,
            commandFingerprint: fingerprint,
            decidedAt: now,
          },
          transaction,
        );
        const updated = await this.applications.markDeclined(
          { applicationId: current.id, reviewedAt: now },
          transaction,
        );
        if (updated.count !== 1) throw concurrentDecision();
        await this.applications.createDeclinedAudit(
          {
            applicationId: current.id,
            actorId: _input.actor.id,
            idempotencyKey,
            commandFingerprint: fingerprint,
            ownerDecisionId: decisionId,
          },
          transaction,
        );
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
        const savedDecision = await this.applications.findDecisionByIdOrThrow(
          decisionId,
          transaction,
        );
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
      decision = await this.replay.resolveOwnerDecisionRaceOrThrow({
        error,
        ownerId: _input.actor.id,
        idempotencyKey,
        fingerprint,
      });
    }

    this.notifications.emitApplicationNotifications(notificationsToEmit);
    return toOwnerDecisionResultDto(decision);
  }

  async getOwnerDecisionReportContext(
    actor: AuthenticatedUser,
    ownerDecisionId: string,
  ): Promise<OwnerDecisionReportContextDto> {
    assertActiveContributor(actor);
    const decision = await this.applications.findDeclinedDecisionForContributor(
      ownerDecisionId,
      actor.id,
    );
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
      return toEmptyOwnerWorkspaceSummaryDto(input.requestScopes);
    const countsByRequestId =
      await this.applications.countPendingByContributionRequestIds(
        contributionRequestIds,
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
    const pending = await this.applications.lockPendingApplicationIdsForUpdate(
      input.contributionRequestId,
      input.transaction,
    );
    const cancelledApplicationIds = pending.map(
      (application) => application.id,
    );
    if (cancelledApplicationIds.length === 0) {
      return { cancelledApplicationIds };
    }

    const updated = await this.applications.markCancelledForRequest(
      { applicationIds: cancelledApplicationIds },
      input.transaction,
    );
    if (updated.count !== cancelledApplicationIds.length) {
      throw new ConflictApplicationError(
        'An Application changed during Contribution Request cancellation',
        'APPLICATION_CONCURRENT_MODIFICATION',
      );
    }
    await this.applications.createCancelledAudits(
      {
        applicationIds: cancelledApplicationIds,
        actorId: input.actorId,
        contributionRequestId: input.contributionRequestId,
        reason: input.reason,
        correlationId: input.correlationId,
        causationAuditId: input.causationAuditId,
      },
      input.transaction,
    );
    return { cancelledApplicationIds };
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
        throw applicationNotFound();
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
        throw applicationNotFound();
      }
      throw error;
    }
  }
}

/**
 * Internal marker for a submission refused by the eligibility gate.
 *
 * Not the HTTP error itself: it exists to carry the blocking skills out through
 * the transaction rollback, so the refusal can be recorded on a fresh
 * connection before the 403 is raised. Never escapes this module.
 */
class ApplicationBlockedBySkillGap extends Error {
  constructor(readonly blockingSkills: BlockingSkillDto[]) {
    super('Application blocked by a skill gap');
  }
}
