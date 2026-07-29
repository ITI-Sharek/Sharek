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
import { ProjectsService } from '../projects/projects.service';
import {
  ContributionProposalDto,
  ContributionProposalListDto,
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
  ) {}

  async submit(input: {
    actor: AuthenticatedUser;
    projectId: string;
    title: string;
    body: string;
    idempotencyKey: string;
  }): Promise<ContributionProposalDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionProposalAuditAction.submitted,
      projectId: input.projectId,
      title: input.title,
      body: input.body,
    });
    const replay = await this.readReplay({
      actorId: input.actor.id,
      action: ContributionProposalAuditAction.submitted,
      idempotencyKey,
      fingerprint,
    });
    if (replay) return toContributionProposalDto(replay);

    const project = await this.projects.getProposalProjectContext(
      input.projectId,
    );
    this.assertProjectAcceptsProposals(project, input.actor);
    await this.assertIntakeEnabled(input.projectId);
    await this.assertWithinDailySubmissionLimit(input.actor.id, new Date());
    await this.assertNoPendingProposal(input.projectId, input.actor.id);

    let proposal: ContributionProposalWithDetail;
    try {
      proposal = await this.database.$transaction(async (transaction) => {
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.actor.id,
          action: ContributionProposalAuditAction.submitted,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const existingPending = await transaction.contributionProposal.findFirst(
          {
            where: {
              project_id: input.projectId,
              proposer_id: input.actor.id,
              status: ContributionProposalStatus.pending,
            },
          },
        );
        if (existingPending) throw this.alreadyPending();

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
            body: input.body,
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
            metadata: { payloadVersion: 1 },
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
      else if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw this.alreadyPending();
      } else throw error;
    }
    return toContributionProposalDto(proposal);
  }

  async submitVersion(input: {
    actor: AuthenticatedUser;
    proposalId: string;
    title: string;
    body: string;
    idempotencyKey: string;
  }): Promise<ContributionProposalDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: ContributionProposalAuditAction.version_submitted,
      proposalId: input.proposalId,
      title: input.title,
      body: input.body,
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
          },
          data: { current_version: nextVersion, revision_requested_at: null },
        });
        if (updated.count !== 1) throw this.concurrentModification();
        await transaction.contributionProposalVersion.create({
          data: {
            proposal_id: input.proposalId,
            version: nextVersion,
            title: input.title,
            body: input.body,
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
            metadata: { payloadVersion: 1 },
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
      else if (error instanceof Prisma.PrismaClientKnownRequestError) {
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

    await this.assertProposalProjectOwner(input.proposalId, input.actor.id);

    let proposal: ContributionProposalWithDetail;
    try {
      proposal = await this.database.$transaction(async (transaction) => {
        const transactionReplay = await this.readReplayFromTransaction({
          transaction,
          actorId: input.actor.id,
          action: ContributionProposalAuditAction.revision_requested,
          idempotencyKey,
          fingerprint,
        });
        if (transactionReplay) return transactionReplay;

        const current = await transaction.contributionProposal.findUnique({
          where: { id: input.proposalId },
        });
        if (!current) throw this.proposalNotFound();
        this.assertPending(current.status);
        await transaction.contributionProposal.update({
          where: { id: input.proposalId },
          data: { revision_requested_at: new Date() },
        });
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
            metadata: { payloadVersion: 1 },
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
        action: ContributionProposalAuditAction.revision_requested,
        idempotencyKey,
        fingerprint,
      });
      if (lostRace) proposal = lostRace;
      else throw error;
    }
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

  async listMine(actor: AuthenticatedUser): Promise<ContributionProposalListDto> {
    this.assertActiveContributor(actor);
    const proposals = await this.database.contributionProposal.findMany({
      where: { proposer_id: actor.id },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      include: PROPOSAL_SUMMARY_INCLUDE,
    });
    return {
      proposals: proposals.map(toContributionProposalSummaryDto),
    };
  }

  async listForProject(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<ContributionProposalListDto> {
    this.assertActiveOwner(actor);
    const project = await this.projects.getProposalProjectContext(projectId);
    if (project.ownerId !== actor.id) throw this.proposalNotFound();
    const proposals = await this.database.contributionProposal.findMany({
      where: { project_id: projectId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      include: PROPOSAL_SUMMARY_INCLUDE,
    });
    return {
      proposals: proposals.map(toContributionProposalSummaryDto),
    };
  }

  async setIntake(
    actor: AuthenticatedUser,
    projectId: string,
    enabled: boolean,
  ): Promise<ProposalIntakeDto> {
    this.assertActiveOwner(actor);
    const project = await this.projects.getProposalProjectContext(projectId);
    if (project.ownerId !== actor.id) throw this.proposalNotFound();
    const intake = await this.database.projectProposalIntake.upsert({
      where: { project_id: projectId },
      create: { project_id: projectId, enabled, updated_by: actor.id },
      update: { enabled, updated_by: actor.id },
    });
    return { projectId: intake.project_id, enabled: intake.enabled };
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

  private async assertIntakeEnabled(projectId: string): Promise<void> {
    const intake = await this.database.projectProposalIntake.findUnique({
      where: { project_id: projectId },
    });
    if (intake && !intake.enabled) {
      throw new ConflictApplicationError(
        'Contribution Proposal intake is disabled for this Project',
        'PROPOSAL_INTAKE_DISABLED',
      );
    }
  }

  private async assertWithinDailySubmissionLimit(
    proposerId: string,
    now: Date,
  ): Promise<void> {
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const submittedToday = await this.database.contributionProposal.count({
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

  private async assertNoPendingProposal(
    projectId: string,
    proposerId: string,
  ): Promise<void> {
    const existingPending = await this.database.contributionProposal.findFirst({
      where: {
        project_id: projectId,
        proposer_id: proposerId,
        status: ContributionProposalStatus.pending,
      },
    });
    if (existingPending) throw this.alreadyPending();
  }

  private async assertProposalProjectOwner(
    proposalId: string,
    actorId: string,
  ): Promise<void> {
    const proposal = await this.database.contributionProposal.findUnique({
      where: { id: proposalId },
      select: { project_id: true },
    });
    if (!proposal) throw this.proposalNotFound();
    const project = await this.projects.getProposalProjectContext(
      proposal.project_id,
    );
    if (project.ownerId !== actorId) throw this.proposalNotFound();
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
    operation: 'revised' | 'withdrawn' = 'revised',
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

  private alreadyPending(): ConflictApplicationError {
    return new ConflictApplicationError(
      'A pending Contribution Proposal already exists for this Project',
      'PROPOSAL_ALREADY_PENDING',
    );
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

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
