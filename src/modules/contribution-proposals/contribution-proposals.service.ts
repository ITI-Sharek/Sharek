import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  ContributionProposalAuditAction,
  ContributionProposalStatus,
  Prisma,
  ProjectStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  ApplicationError,
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { ContributionTasksService } from '../contribution-tasks/services/contribution-tasks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectsService } from '../projects/projects.service';
import { ContributionProposalPageQueryDto } from './dto/contribution-proposal-input.dto';
import {
  ContributionProposalDto,
  ContributionProposalListDto,
  ContributionProposalMisuseReportDto,
  ProposalIntakeDto,
} from './dto/contribution-proposal-response.dto';
import {
  ContributionProposalWithDetail,
  PROPOSAL_DETAIL_INCLUDE,
  PROPOSAL_SUMMARY_INCLUDE,
  toContributionProposalDto,
  toContributionProposalSummaryDto,
} from './mappers/contribution-proposal.mapper';

// Contributors acknowledge this disclosure version before submitting: accepted
// proposals grant attribution but never an Assignment or selection priority.
const PROPOSAL_DISCLOSURE_VERSION = '2026-07-attribution-assignment';
const PROPOSAL_DAILY_SUBMISSION_LIMIT = 10;

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProposalAuditWithProposal = Prisma.ContributionProposalAuditGetPayload<{
  include: { proposal: { include: typeof PROPOSAL_DETAIL_INCLUDE } };
}>;

@Injectable()
export class ContributionProposalsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly contributionTasks: ContributionTasksService,
    private readonly notifications: NotificationsService,
  ) {}

  async submit(input: {
    actor: AuthenticatedUser;
    projectId: string;
    title: string;
    problemOrOpportunity: string;
    proposedOutcome: string;
    projectBenefit: string;
    idempotencyKey: string;
  }): Promise<ContributionProposalDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionProposalAuditAction.submitted,
      projectId: input.projectId,
      title: input.title,
      problemOrOpportunity: input.problemOrOpportunity,
      proposedOutcome: input.proposedOutcome,
      projectBenefit: input.projectBenefit,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ContributionProposalAuditAction.submitted,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return toContributionProposalDto(replay);

    let proposal: ContributionProposalWithDetail;
    try {
      proposal = await this.database.$transaction(async (transaction) => {
        await this.lockContributorSubmissions(transaction, input.actor.id);
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.actor.id,
          action: ContributionProposalAuditAction.submitted,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const project = await this.projects.lockProposalProjectContext(
          input.projectId,
          transaction,
        );
        this.assertProjectAcceptsProposals(project, input.actor);
        await this.assertIntakeEnabled(input.projectId, transaction);
        await this.assertWithinDailySubmissionLimit(
          input.actor.id,
          new Date(),
          transaction,
        );

        const now = new Date();
        const proposalId = randomUUID();
        await transaction.contributionProposal.create({
          data: {
            id: proposalId,
            project_id: input.projectId,
            proposer_id: input.actor.id,
            status: ContributionProposalStatus.pending,
            current_version: 1,
            disclosure_version: PROPOSAL_DISCLOSURE_VERSION,
            disclosure_acknowledged_at: now,
          },
        });
        await transaction.contributionProposalVersion.create({
          data: {
            proposal_id: proposalId,
            version: 1,
            title: input.title,
            problem_or_opportunity: input.problemOrOpportunity,
            proposed_outcome: input.proposedOutcome,
            project_benefit: input.projectBenefit,
            authored_by: input.actor.id,
          },
        });
        await transaction.contributionProposalAudit.create({
          data: {
            proposal_id: proposalId,
            actor_id: input.actor.id,
            action: ContributionProposalAuditAction.submitted,
            to_status: ContributionProposalStatus.pending,
            proposal_version: 1,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: { payloadVersion: 2 },
          },
        });
        return transaction.contributionProposal.findUniqueOrThrow({
          where: { id: proposalId },
          include: PROPOSAL_DETAIL_INCLUDE,
        });
      });
    } catch (error) {
      const lostRace = await this.recoverFromIdempotencyRace({
        error,
        actorId: input.actor.id,
        action: ContributionProposalAuditAction.submitted,
        idempotencyKey,
        fingerprint,
      });
      if (lostRace) proposal = lostRace;
      else throw error;
    }
    return toContributionProposalDto(proposal);
  }

  async submitVersion(input: {
    actor: AuthenticatedUser;
    proposalId: string;
    title: string;
    problemOrOpportunity: string;
    proposedOutcome: string;
    projectBenefit: string;
    idempotencyKey: string;
  }): Promise<ContributionProposalDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionProposalAuditAction.version_submitted,
      proposalId: input.proposalId,
      title: input.title,
      problemOrOpportunity: input.problemOrOpportunity,
      proposedOutcome: input.proposedOutcome,
      projectBenefit: input.projectBenefit,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ContributionProposalAuditAction.version_submitted,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return toContributionProposalDto(replay);

    let proposal: ContributionProposalWithDetail;
    try {
      proposal = await this.database.$transaction(async (transaction) => {
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.actor.id,
          action: ContributionProposalAuditAction.version_submitted,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const current = await transaction.contributionProposal.findFirst({
          where: { id: input.proposalId, proposer_id: input.actor.id },
        });
        if (!current) throw this.proposalNotFound();
        this.assertPending(current.status);
        if (!current.revision_requested_at) {
          throw new ConflictApplicationError(
            'No revision has been requested for this Contribution Proposal',
            'PROPOSAL_NO_REVISION_REQUESTED',
          );
        }
        const nextVersion = current.current_version + 1;
        const updated = await transaction.contributionProposal.updateMany({
          where: {
            id: input.proposalId,
            proposer_id: input.actor.id,
            status: ContributionProposalStatus.pending,
            current_version: current.current_version,
            revision_request_sequence: current.revision_request_sequence,
          },
          data: { current_version: nextVersion, revision_requested_at: null },
        });
        if (updated.count !== 1) throw this.concurrentModification();
        await transaction.contributionProposalVersion.create({
          data: {
            proposal_id: input.proposalId,
            version: nextVersion,
            title: input.title,
            problem_or_opportunity: input.problemOrOpportunity,
            proposed_outcome: input.proposedOutcome,
            project_benefit: input.projectBenefit,
            authored_by: input.actor.id,
          },
        });
        await transaction.contributionProposalAudit.create({
          data: {
            proposal_id: input.proposalId,
            actor_id: input.actor.id,
            action: ContributionProposalAuditAction.version_submitted,
            from_status: ContributionProposalStatus.pending,
            to_status: ContributionProposalStatus.pending,
            proposal_version: nextVersion,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: {
              payloadVersion: 2,
              answeredRevisionRequestSequence:
                current.revision_request_sequence,
            },
          },
        });
        return transaction.contributionProposal.findUniqueOrThrow({
          where: { id: input.proposalId },
          include: PROPOSAL_DETAIL_INCLUDE,
        });
      });
    } catch (error) {
      const lostRace = await this.recoverFromIdempotencyRace({
        error,
        actorId: input.actor.id,
        action: ContributionProposalAuditAction.version_submitted,
        idempotencyKey,
        fingerprint,
      });
      if (lostRace) proposal = lostRace;
      else if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.concurrentModification();
      } else throw error;
    }
    return toContributionProposalDto(proposal);
  }

  async requestRevision(input: {
    actor: AuthenticatedUser;
    proposalId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<ContributionProposalDto> {
    this.assertActiveOwner(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionProposalAuditAction.revision_requested,
      proposalId: input.proposalId,
      reason: input.reason,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ContributionProposalAuditAction.revision_requested,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return toContributionProposalDto(replay);

    let proposal: ContributionProposalWithDetail;
    let notificationsToEmit: Parameters<
      NotificationsService['emitProposalNotifications']
    >[0] = [];
    try {
      const result = await this.database.$transaction(async (transaction) => {
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.actor.id,
          action: ContributionProposalAuditAction.revision_requested,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) {
          return { proposal: transactionReplay, notifications: [] };
        }

        const current = await transaction.contributionProposal.findUnique({
          where: { id: input.proposalId },
        });
        if (!current) throw this.proposalNotFound();
        this.assertPending(current.status);
        const project = await this.projects.lockProposalProjectContext(
          current.project_id,
          transaction,
        );
        if (project.ownerId !== input.actor.id) throw this.proposalNotFound();
        const nextRevisionRequestSequence =
          current.revision_request_sequence + 1;
        const updated = await transaction.contributionProposal.updateMany({
          where: {
            id: input.proposalId,
            status: ContributionProposalStatus.pending,
            current_version: current.current_version,
            revision_request_sequence: current.revision_request_sequence,
          },
          data: {
            revision_request_sequence: nextRevisionRequestSequence,
            revision_requested_at: new Date(),
          },
        });
        if (updated.count !== 1) throw this.concurrentModification();
        await transaction.contributionProposalAudit.create({
          data: {
            proposal_id: input.proposalId,
            actor_id: input.actor.id,
            action: ContributionProposalAuditAction.revision_requested,
            from_status: ContributionProposalStatus.pending,
            to_status: ContributionProposalStatus.pending,
            proposal_version: current.current_version,
            reason: input.reason,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: {
              payloadVersion: 1,
              revisionRequestSequence: nextRevisionRequestSequence,
            },
          },
        });
        const notification =
          await this.notifications.createProposalNotification(
            {
              userId: current.proposer_id,
              proposalId: current.id,
              projectId: current.project_id,
              action: 'revision_requested',
              revisionRequestSequence: nextRevisionRequestSequence,
            },
            { transaction, emitRealtime: false },
          );
        const savedProposal =
          await transaction.contributionProposal.findUniqueOrThrow({
          where: { id: input.proposalId },
          include: PROPOSAL_DETAIL_INCLUDE,
        });
        return {
          proposal: savedProposal,
          notifications: notification.created
            ? [notification.notification]
            : [],
        };
      });
      proposal = result.proposal;
      notificationsToEmit = result.notifications;
    } catch (error) {
      const lostRace = await this.recoverFromIdempotencyRace({
        error,
        actorId: input.actor.id,
        action: ContributionProposalAuditAction.revision_requested,
        idempotencyKey,
        fingerprint,
      });
      if (lostRace) proposal = lostRace;
      else throw error;
    }
    this.notifications.emitProposalNotifications(notificationsToEmit);
    return toContributionProposalDto(proposal);
  }

  async withdraw(input: {
    actor: AuthenticatedUser;
    proposalId: string;
    idempotencyKey?: string;
  }): Promise<ContributionProposalDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = input.idempotencyKey
      ? this.normalizeIdempotencyKey(input.idempotencyKey)
      : null;
    const fingerprint = this.fingerprint({
      action: ContributionProposalAuditAction.withdrawn,
      proposalId: input.proposalId,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ContributionProposalAuditAction.withdrawn,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return toContributionProposalDto(replay);

    let proposal: ContributionProposalWithDetail;
    try {
      proposal = await this.database.$transaction(async (transaction) => {
        const current = await transaction.contributionProposal.findFirst({
          where: { id: input.proposalId, proposer_id: input.actor.id },
          include: PROPOSAL_DETAIL_INCLUDE,
        });
        if (!current) throw this.proposalNotFound();
        if (current.status === ContributionProposalStatus.withdrawn) {
          return current;
        }
        this.assertPending(current.status, 'withdrawn');
        const updated = await transaction.contributionProposal.updateMany({
          where: {
            id: input.proposalId,
            proposer_id: input.actor.id,
            status: ContributionProposalStatus.pending,
          },
          data: {
            status: ContributionProposalStatus.withdrawn,
            withdrawn_at: new Date(),
          },
        });
        if (updated.count !== 1) throw this.concurrentModification();
        await transaction.contributionProposalAudit.create({
          data: {
            proposal_id: input.proposalId,
            actor_id: input.actor.id,
            action: ContributionProposalAuditAction.withdrawn,
            from_status: ContributionProposalStatus.pending,
            to_status: ContributionProposalStatus.withdrawn,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: { payloadVersion: 1 },
          },
        });
        return transaction.contributionProposal.findUniqueOrThrow({
          where: { id: input.proposalId },
          include: PROPOSAL_DETAIL_INCLUDE,
        });
      });
    } catch (error) {
      const recoverable =
        idempotencyKey &&
        (error instanceof Prisma.PrismaClientKnownRequestError ||
          (error instanceof ConflictApplicationError &&
            error.code === 'PROPOSAL_CONCURRENT_MODIFICATION'));
      const lostRace = recoverable
        ? await this.readReplay({
            actorId: input.actor.id,
            action: ContributionProposalAuditAction.withdrawn,
            idempotencyKey,
            fingerprint,
          })
        : null;
      if (lostRace) proposal = lostRace;
      else throw error;
    }
    return toContributionProposalDto(proposal);
  }

  async accept(input: {
    actor: AuthenticatedUser;
    proposalId: string;
    idempotencyKey: string;
  }): Promise<ContributionProposalDto> {
    this.assertActiveOwner(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionProposalAuditAction.accepted,
      proposalId: input.proposalId,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ContributionProposalAuditAction.accepted,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return toContributionProposalDto(replay);

    let proposal: ContributionProposalWithDetail;
    let notificationsToEmit: Parameters<
      NotificationsService['emitProposalNotifications']
    >[0] = [];
    try {
      const result = await this.database.$transaction(async (transaction) => {
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.actor.id,
          action: ContributionProposalAuditAction.accepted,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) {
          return { proposal: transactionReplay, notifications: [] };
        }

        const current = await transaction.contributionProposal.findUnique({
          where: { id: input.proposalId },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        });
        if (!current) throw this.proposalNotFound();
        this.assertPending(current.status, 'accepted');
        const project = await this.projects.lockProposalProjectContext(
          current.project_id,
          transaction,
        );
        if (project.ownerId !== input.actor.id) throw this.proposalNotFound();

        const updated = await transaction.contributionProposal.updateMany({
          where: {
            id: input.proposalId,
            status: ContributionProposalStatus.pending,
            current_version: current.current_version,
            revision_request_sequence: current.revision_request_sequence,
          },
          data: {
            status: ContributionProposalStatus.accepted,
            accepted_at: new Date(),
            revision_requested_at: null,
          },
        });
        if (updated.count !== 1) throw this.concurrentModification();

        const latest = current.versions[0];
        if (!latest) throw this.proposalNotFound();
        // Attribution stays immutable: the resulting draft records the proposer
        // and origin proposal but grants no Assignment or selection priority.
        const draft =
          await this.contributionTasks.createDraftFromAcceptedProposal({
            transaction,
            ownerId: input.actor.id,
            projectId: current.project_id,
            proposalId: input.proposalId,
            attributedContributorId: current.proposer_id,
            title: latest.title,
            description: this.composeRequestDescription(latest),
          });

        await transaction.contributionProposalAudit.create({
          data: {
            proposal_id: input.proposalId,
            actor_id: input.actor.id,
            action: ContributionProposalAuditAction.accepted,
            from_status: ContributionProposalStatus.pending,
            to_status: ContributionProposalStatus.accepted,
            proposal_version: current.current_version,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: {
              payloadVersion: 1,
              resultingContributionRequestId: draft.id,
            },
          },
        });
        const notification =
          await this.notifications.createProposalNotification(
            {
              userId: current.proposer_id,
              proposalId: current.id,
              projectId: current.project_id,
              action: 'accepted',
              resultingContributionRequestId: draft.id,
            },
            { transaction, emitRealtime: false },
          );
        const savedProposal =
          await transaction.contributionProposal.findUniqueOrThrow({
          where: { id: input.proposalId },
          include: PROPOSAL_DETAIL_INCLUDE,
        });
        return {
          proposal: savedProposal,
          notifications: notification.created
            ? [notification.notification]
            : [],
        };
      });
      proposal = result.proposal;
      notificationsToEmit = result.notifications;
    } catch (error) {
      const lostRace = await this.recoverFromIdempotencyRace({
        error,
        actorId: input.actor.id,
        action: ContributionProposalAuditAction.accepted,
        idempotencyKey,
        fingerprint,
      });
      if (lostRace) proposal = lostRace;
      else throw error;
    }
    this.notifications.emitProposalNotifications(notificationsToEmit);
    return toContributionProposalDto(proposal);
  }

  async decline(input: {
    actor: AuthenticatedUser;
    proposalId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<ContributionProposalDto> {
    this.assertActiveOwner(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionProposalAuditAction.declined,
      proposalId: input.proposalId,
      reason: input.reason,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ContributionProposalAuditAction.declined,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return toContributionProposalDto(replay);

    let proposal: ContributionProposalWithDetail;
    let notificationsToEmit: Parameters<
      NotificationsService['emitProposalNotifications']
    >[0] = [];
    try {
      const result = await this.database.$transaction(async (transaction) => {
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.actor.id,
          action: ContributionProposalAuditAction.declined,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) {
          return { proposal: transactionReplay, notifications: [] };
        }

        const current = await transaction.contributionProposal.findUnique({
          where: { id: input.proposalId },
        });
        if (!current) throw this.proposalNotFound();
        this.assertPending(current.status, 'declined');
        const project = await this.projects.lockProposalProjectContext(
          current.project_id,
          transaction,
        );
        if (project.ownerId !== input.actor.id) throw this.proposalNotFound();

        const updated = await transaction.contributionProposal.updateMany({
          where: {
            id: input.proposalId,
            status: ContributionProposalStatus.pending,
            current_version: current.current_version,
            revision_request_sequence: current.revision_request_sequence,
          },
          data: {
            status: ContributionProposalStatus.declined,
            declined_at: new Date(),
            decline_reason: input.reason,
            revision_requested_at: null,
          },
        });
        if (updated.count !== 1) throw this.concurrentModification();
        await transaction.contributionProposalAudit.create({
          data: {
            proposal_id: input.proposalId,
            actor_id: input.actor.id,
            action: ContributionProposalAuditAction.declined,
            from_status: ContributionProposalStatus.pending,
            to_status: ContributionProposalStatus.declined,
            proposal_version: current.current_version,
            reason: input.reason,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: { payloadVersion: 1 },
          },
        });
        const notification =
          await this.notifications.createProposalNotification(
            {
              userId: current.proposer_id,
              proposalId: current.id,
              projectId: current.project_id,
              action: 'declined',
            },
            { transaction, emitRealtime: false },
          );
        const savedProposal =
          await transaction.contributionProposal.findUniqueOrThrow({
          where: { id: input.proposalId },
          include: PROPOSAL_DETAIL_INCLUDE,
        });
        return {
          proposal: savedProposal,
          notifications: notification.created
            ? [notification.notification]
            : [],
        };
      });
      proposal = result.proposal;
      notificationsToEmit = result.notifications;
    } catch (error) {
      const lostRace = await this.recoverFromIdempotencyRace({
        error,
        actorId: input.actor.id,
        action: ContributionProposalAuditAction.declined,
        idempotencyKey,
        fingerprint,
      });
      if (lostRace) proposal = lostRace;
      else throw error;
    }
    this.notifications.emitProposalNotifications(notificationsToEmit);
    return toContributionProposalDto(proposal);
  }

  async reportMisuse(input: {
    actor: AuthenticatedUser;
    proposalId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<ContributionProposalMisuseReportDto> {
    this.assertActiveProposalActor(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const existing =
      await this.database.contributionProposalMisuseReport.findFirst({
        where: { reporter_id: input.actor.id, idempotency_key: idempotencyKey },
      });
    if (existing) return this.presentMisuseReport(existing);

    // Only participants (the proposer or the Project owner) can file a report.
    const proposal = await this.database.contributionProposal.findUnique({
      where: { id: input.proposalId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!proposal) throw this.proposalNotFound();
    if (proposal.proposer_id !== input.actor.id) {
      const project = await this.projects.getProposalProjectContext(
        proposal.project_id,
      );
      if (project.ownerId !== input.actor.id) throw this.proposalNotFound();
    }

    const latest = proposal.versions[0];
    // Preserve authorship evidence and timestamps for moderation. The platform
    // records the claim only; it makes no automatic copying, ownership, or legal
    // finding.
    const evidenceSnapshot = {
      proposalId: proposal.id,
      projectId: proposal.project_id,
      proposerId: proposal.proposer_id,
      reportedVersion: proposal.current_version,
      proposalCreatedAt: proposal.created_at.toISOString(),
      version: latest
        ? {
            version: latest.version,
            title: latest.title,
            problemOrOpportunity: latest.problem_or_opportunity,
            proposedOutcome: latest.proposed_outcome,
            projectBenefit: latest.project_benefit,
            authoredBy: latest.authored_by,
            createdAt: latest.created_at.toISOString(),
          }
        : null,
      capturedAt: new Date().toISOString(),
    };

    try {
      const report = await this.database.$transaction(async (transaction) => {
        const created =
          await transaction.contributionProposalMisuseReport.create({
            data: {
              proposal_id: proposal.id,
              reporter_id: input.actor.id,
              reported_version: proposal.current_version,
              reason: input.reason,
              evidence_snapshot: evidenceSnapshot as Prisma.InputJsonValue,
              idempotency_key: idempotencyKey,
            },
          });
        await transaction.contributionProposalAudit.create({
          data: {
            proposal_id: proposal.id,
            actor_id: input.actor.id,
            action: ContributionProposalAuditAction.misuse_reported,
            from_status: proposal.status,
            to_status: proposal.status,
            proposal_version: proposal.current_version,
            reason: input.reason,
            idempotency_key: idempotencyKey,
            command_fingerprint: this.fingerprint({
              action: ContributionProposalAuditAction.misuse_reported,
              proposalId: proposal.id,
              reason: input.reason,
            }),
            metadata: { payloadVersion: 1, misuseReportId: created.id },
          },
        });
        return created;
      });
      return this.presentMisuseReport(report);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced =
          await this.database.contributionProposalMisuseReport.findFirst({
            where: {
              reporter_id: input.actor.id,
              idempotency_key: idempotencyKey,
            },
          });
        if (raced) return this.presentMisuseReport(raced);
      }
      throw error;
    }
  }

  async getForActor(
    actor: AuthenticatedUser,
    proposalId: string,
  ): Promise<ContributionProposalDto> {
    this.assertActiveProposalActor(actor);
    const proposal = await this.database.contributionProposal.findUnique({
      where: { id: proposalId },
      include: PROPOSAL_DETAIL_INCLUDE,
    });
    if (!proposal) throw this.proposalNotFound();
    if (proposal.proposer_id !== actor.id) {
      const project = await this.projects.getProposalProjectContext(
        proposal.project_id,
      );
      if (project.ownerId !== actor.id) throw this.proposalNotFound();
    }
    return toContributionProposalDto(proposal);
  }

  async listMine(
    actor: AuthenticatedUser,
    query: ContributionProposalPageQueryDto = {},
  ): Promise<ContributionProposalListDto> {
    this.assertActiveContributor(actor);
    return this.listPage({ proposer_id: actor.id }, query);
  }

  async listForProject(
    actor: AuthenticatedUser,
    projectId: string,
    query: ContributionProposalPageQueryDto = {},
  ): Promise<ContributionProposalListDto> {
    this.assertActiveOwner(actor);
    const project = await this.projects.getProposalProjectContext(projectId);
    if (project.ownerId !== actor.id) throw this.proposalNotFound();
    return this.listPage({ project_id: projectId }, query);
  }

  /**
   * Reads whether a Project is accepting Contribution Proposals.
   *
   * A plain read on purpose. `assertIntakeEnabled` lazily upserts the row so it
   * can take a row lock during submission; copying that here would make a GET
   * write, which is the defect just removed from the assessment read. Absence
   * of a row means enabled, matching the column default.
   */
  async getIntake(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<ProposalIntakeDto> {
    this.assertActiveOwner(actor);
    const project = await this.projects.getProposalProjectContext(projectId);
    if (project.ownerId !== actor.id) throw this.proposalNotFound();
    const intake = await this.database.projectProposalIntake.findUnique({
      where: { project_id: projectId },
    });
    return { projectId, enabled: intake?.enabled ?? true };
  }

  async setIntake(
    actor: AuthenticatedUser,
    projectId: string,
    enabled: boolean,
  ): Promise<ProposalIntakeDto> {
    this.assertActiveOwner(actor);
    return this.database.$transaction(async (transaction) => {
      const project = await this.projects.lockProposalProjectContext(
        projectId,
        transaction,
      );
      if (project.ownerId !== actor.id) throw this.proposalNotFound();
      const intake = await transaction.projectProposalIntake.upsert({
        where: { project_id: projectId },
        create: { project_id: projectId, enabled, updated_by: actor.id },
        update: { enabled, updated_by: actor.id },
      });
      return { projectId: intake.project_id, enabled: intake.enabled };
    });
  }

  private assertProjectAcceptsProposals(
    project: { ownerId: string; status: ProjectStatus },
    actor: AuthenticatedUser,
  ): void {
    if (project.status !== ProjectStatus.published) {
      throw new ConflictApplicationError(
        'This Project is not open to Contribution Proposals',
        'PROPOSAL_PROJECT_NOT_PUBLISHED',
      );
    }
    if (project.ownerId === actor.id) {
      throw new ForbiddenApplicationError(
        'A Project owner cannot submit a Contribution Proposal to their own Project',
        'PROPOSAL_OWNER_CANNOT_PROPOSE',
      );
    }
  }

  private async assertIntakeEnabled(
    projectId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "ProjectProposalIntake" ("project_id", "enabled")
      VALUES (${projectId}::uuid, true)
      ON CONFLICT ("project_id") DO NOTHING
    `);
    const intakes = await transaction.$queryRaw<Array<{ enabled: boolean }>>(
      Prisma.sql`
        SELECT "enabled"
        FROM "ProjectProposalIntake"
        WHERE "project_id" = ${projectId}::uuid
        FOR SHARE
      `,
    );
    if (!intakes[0]?.enabled) {
      throw new ConflictApplicationError(
        'Contribution Proposal intake is disabled for this Project',
        'PROPOSAL_INTAKE_DISABLED',
      );
    }
  }

  private async assertWithinDailySubmissionLimit(
    proposerId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const submittedToday = await transaction.contributionProposal.count({
      where: { proposer_id: proposerId, created_at: { gte: dayStart } },
    });
    if (submittedToday >= PROPOSAL_DAILY_SUBMISSION_LIMIT) {
      throw new ApplicationError(
        'Daily Contribution Proposal submission limit reached',
        'PROPOSAL_RATE_LIMITED',
        429,
        { dailyLimit: PROPOSAL_DAILY_SUBMISSION_LIMIT },
      );
    }
  }

  private async lockContributorSubmissions(
    transaction: Prisma.TransactionClient,
    proposerId: string,
  ): Promise<void> {
    await transaction.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`contribution-proposals:${proposerId}`}, 0)
      )::text AS "lockResult"
    `);
  }

  private async listPage(
    baseWhere: Prisma.ContributionProposalWhereInput,
    query: ContributionProposalPageQueryDto,
  ): Promise<ContributionProposalListDto> {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const cursorWhere: Prisma.ContributionProposalWhereInput | undefined = cursor
      ? {
          OR: [
            { created_at: { lt: cursor.createdAt } },
            { created_at: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : undefined;
    const proposals = await this.database.contributionProposal.findMany({
      where: cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: PROPOSAL_SUMMARY_INCLUDE,
    });
    const hasNextPage = proposals.length > limit;
    const items = proposals.slice(0, limit);
    const last = items.at(-1);
    return {
      proposals: items.map(toContributionProposalSummaryDto),
      pageInfo: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? this.encodeCursor(last.created_at, last.id)
            : null,
      },
    };
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ createdAt: createdAt.toISOString(), id }),
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { createdAt?: unknown; id?: unknown };
      const createdAt = new Date(String(parsed.createdAt));
      if (
        typeof parsed.id !== 'string' ||
        !IDEMPOTENCY_KEY_PATTERN.test(parsed.id) ||
        Number.isNaN(createdAt.getTime())
      ) {
        throw new Error('invalid cursor');
      }
      return { createdAt, id: parsed.id };
    } catch {
      throw new ApplicationError(
        'Contribution Proposal cursor is invalid',
        'PROPOSAL_CURSOR_INVALID',
        400,
      );
    }
  }

  private async recoverFromIdempotencyRace(input: {
    error: unknown;
    actorId: string;
    action: ContributionProposalAuditAction;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<ContributionProposalWithDetail | null> {
    if (
      !(input.error instanceof Prisma.PrismaClientKnownRequestError) ||
      input.error.code !== 'P2002'
    ) {
      return null;
    }
    return this.readReplay({
      actorId: input.actorId,
      action: input.action,
      idempotencyKey: input.idempotencyKey,
      fingerprint: input.fingerprint,
    });
  }

  private async readReplay(input: {
    actorId: string;
    action: ContributionProposalAuditAction;
    idempotencyKey: string | null;
    fingerprint: string;
  }): Promise<ContributionProposalWithDetail | null> {
    if (!input.idempotencyKey) return null;
    const audit = await this.database.contributionProposalAudit.findFirst({
      where: {
        actor_id: input.actorId,
        action: input.action,
        idempotency_key: input.idempotencyKey,
      },
      include: { proposal: { include: PROPOSAL_DETAIL_INCLUDE } },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  private async readReplayFromTransaction(input: {
    transaction: Prisma.TransactionClient;
    actorId: string;
    action: ContributionProposalAuditAction;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<ContributionProposalWithDetail | null> {
    const audit = await input.transaction.contributionProposalAudit.findFirst({
      where: {
        actor_id: input.actorId,
        action: input.action,
        idempotency_key: input.idempotencyKey,
      },
      include: { proposal: { include: PROPOSAL_DETAIL_INCLUDE } },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  private presentReplay(
    audit: ProposalAuditWithProposal | null,
    fingerprint: string,
  ): ContributionProposalWithDetail | null {
    if (!audit) return null;
    if (audit.command_fingerprint !== fingerprint) {
      throw new ConflictApplicationError(
        'Idempotency key was already used for another Contribution Proposal command',
        'PROPOSAL_IDEMPOTENCY_CONFLICT',
      );
    }
    return audit.proposal;
  }

  private assertPending(
    status: ContributionProposalStatus,
    operation: 'revised' | 'withdrawn' | 'accepted' | 'declined' = 'revised',
  ): void {
    if (status !== ContributionProposalStatus.pending) {
      throw new ConflictApplicationError(
        `Only a pending Contribution Proposal can be ${operation}`,
        'PROPOSAL_TERMINAL',
        { status },
      );
    }
  }

  private assertActiveContributor(actor: AuthenticatedUser): void {
    if (actor.status !== 'active' || actor.role !== 'contributor') {
      throw new ForbiddenApplicationError(
        'An active contributor account is required',
        'PROPOSAL_NOT_AUTHORIZED',
      );
    }
  }

  private assertActiveOwner(actor: AuthenticatedUser): void {
    if (actor.status !== 'active' || actor.role !== 'owner') {
      throw new ForbiddenApplicationError(
        'An active Project owner account is required',
        'PROPOSAL_NOT_AUTHORIZED',
      );
    }
  }

  private assertActiveProposalActor(actor: AuthenticatedUser): void {
    if (
      actor.status !== 'active' ||
      (actor.role !== 'owner' && actor.role !== 'contributor')
    ) {
      throw new ForbiddenApplicationError(
        'Contribution Proposal access is not authorized',
        'PROPOSAL_NOT_AUTHORIZED',
      );
    }
  }

  private normalizeIdempotencyKey(value: string): string {
    const normalized = value.trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw new BadRequestApplicationError(
        'Contribution Proposal idempotency key must be a UUID',
        'PROPOSAL_IDEMPOTENCY_KEY_INVALID',
      );
    }
    return normalized;
  }

  private concurrentModification(): ConflictApplicationError {
    return new ConflictApplicationError(
      'Contribution Proposal changed during the command',
      'PROPOSAL_CONCURRENT_MODIFICATION',
    );
  }

  private proposalNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Contribution Proposal was not found',
      'PROPOSAL_NOT_FOUND',
    );
  }

  private composeRequestDescription(version: {
    problem_or_opportunity: string;
    proposed_outcome: string;
    project_benefit: string;
  }): string {
    return [
      `Problem or opportunity:\n${version.problem_or_opportunity}`,
      `Proposed outcome:\n${version.proposed_outcome}`,
      `Project benefit:\n${version.project_benefit}`,
    ].join('\n\n');
  }

  private presentMisuseReport(report: {
    id: string;
    proposal_id: string;
    reporter_id: string;
    reported_version: number;
    reason: string;
    created_at: Date;
  }): ContributionProposalMisuseReportDto {
    return {
      id: report.id,
      proposalId: report.proposal_id,
      reporterId: report.reporter_id,
      reportedVersion: report.reported_version,
      reason: report.reason,
      createdAt: report.created_at,
    };
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
