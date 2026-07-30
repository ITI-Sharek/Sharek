import { createHash } from 'node:crypto';
import {
  ContributionProposalStatus,
  Prisma,
  ProjectStatus,
} from '@prisma/client';

import { ApplicationError } from '../../shared/errors/application.error';
import { ContributionProposalsService } from './contribution-proposals.service';

const contributor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor' as const,
  status: 'active' as const,
};
const owner = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.com',
  role: 'owner' as const,
  status: 'active' as const,
};
const projectId = '33333333-3333-4333-8333-333333333333';
const proposalId = '44444444-4444-4444-8444-444444444444';
const idempotencyKey = '55555555-5555-4555-8555-555555555555';
const proposalContent = {
  problemOrOpportunity:
    'The discovery feed repeats expensive repository-derived lookups.',
  proposedOutcome:
    'Introduce a Redis cache with explicit invalidation on publication.',
  projectBenefit:
    'Owners and contributors receive faster, more reliable discovery results.',
};
const revisedProposalContent = {
  problemOrOpportunity:
    'The discovery feed still repeats expensive repository-derived lookups.',
  proposedOutcome:
    'Add cache invalidation whenever a published Project changes.',
  projectBenefit:
    'Discovery remains fast without presenting stale Project information.',
};

describe('ContributionProposalsService', () => {
  const database = {
    contributionProposal: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    contributionProposalVersion: { create: jest.fn() },
    contributionProposalAudit: { findFirst: jest.fn(), create: jest.fn() },
    contributionProposalMisuseReport: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    projectProposalIntake: { upsert: jest.fn() },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const projects = {
    getProposalProjectContext: jest.fn(),
    lockProposalProjectContext: jest.fn(),
  };
  const contributionTasks = {
    createDraftFromAcceptedProposal: jest.fn(),
  };
  const notifications = {
    createProposalNotification: jest.fn(),
    emitProposalNotifications: jest.fn(),
  };
  const service = new ContributionProposalsService(
    database as never,
    projects as never,
    contributionTasks as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    projects.getProposalProjectContext.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: ProjectStatus.published,
    });
    projects.lockProposalProjectContext.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: ProjectStatus.published,
    });
    database.$executeRaw.mockResolvedValue(1);
    database.$queryRaw.mockResolvedValue([{ enabled: true }]);
    database.contributionProposalAudit.findFirst.mockResolvedValue(null);
    database.contributionProposalAudit.create.mockResolvedValue({});
    database.contributionProposal.findFirst.mockResolvedValue(null);
    database.contributionProposal.count.mockResolvedValue(0);
    database.contributionProposal.create.mockResolvedValue({});
    database.contributionProposalVersion.create.mockResolvedValue({});
    database.contributionProposal.findMany.mockResolvedValue([]);
    database.contributionProposal.findUniqueOrThrow.mockResolvedValue(
      proposalRecord(),
    );
    database.contributionProposalMisuseReport.findFirst.mockResolvedValue(null);
    database.contributionProposalMisuseReport.create.mockResolvedValue(
      misuseReportRecord(),
    );
    contributionTasks.createDraftFromAcceptedProposal.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    notifications.createProposalNotification.mockResolvedValue({
      created: true,
      notification: { notificationId: 'notification-1' },
    });
  });

  describe('submit', () => {
    it('creates a pending proposal with an immutable first version and audit', async () => {
      const result = await service.submit({
        actor: contributor,
        projectId,
        title: 'Add caching layer',
        ...proposalContent,
        idempotencyKey,
      });

      expect(result.status).toBe('PENDING');
      expect(result.currentVersion).toBe(1);
      expect(database.contributionProposalVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 1,
          title: 'Add caching layer',
          problem_or_opportunity: proposalContent.problemOrOpportunity,
          proposed_outcome: proposalContent.proposedOutcome,
          project_benefit: proposalContent.projectBenefit,
          authored_by: contributor.id,
        }),
      });
      expect(database.contributionProposalAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actor_id: contributor.id,
          action: 'submitted',
          to_status: ContributionProposalStatus.pending,
          idempotency_key: idempotencyKey,
        }),
      });
    });

    it('rejects submission to an unpublished Project', async () => {
      projects.lockProposalProjectContext.mockResolvedValue({
        id: projectId,
        ownerId: owner.id,
        status: ProjectStatus.draft,
      });

      await expect(submit()).rejects.toMatchObject({
        code: 'PROPOSAL_PROJECT_NOT_PUBLISHED',
        statusCode: 409,
      } satisfies Partial<ApplicationError>);
      expect(database.contributionProposal.create).not.toHaveBeenCalled();
    });

    it('rejects submission when Proposal intake is disabled', async () => {
      database.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ enabled: false }]);

      await expect(submit()).rejects.toMatchObject({
        code: 'PROPOSAL_INTAKE_DISABLED',
        statusCode: 409,
      } satisfies Partial<ApplicationError>);
    });

    it('enforces the daily submission rate limit', async () => {
      database.contributionProposal.count.mockResolvedValue(10);

      await expect(submit()).rejects.toMatchObject({
        code: 'PROPOSAL_RATE_LIMITED',
        statusCode: 429,
      } satisfies Partial<ApplicationError>);
    });

    it('replays an identical submission without creating a duplicate', async () => {
      database.contributionProposalAudit.findFirst.mockResolvedValue({
        command_fingerprint: fingerprintFor({
          action: 'submitted',
          projectId,
          title: 'Add caching layer',
          ...proposalContent,
        }),
        proposal: proposalRecord(),
      });

      await service.submit({
        actor: contributor,
        projectId,
        title: 'Add caching layer',
        ...proposalContent,
        idempotencyKey,
      });

      expect(database.contributionProposal.create).not.toHaveBeenCalled();
    });

    it('does not disguise unrelated Prisma failures as an already-pending conflict', async () => {
      const databaseError = new Prisma.PrismaClientKnownRequestError(
        'project foreign key changed during submission',
        {
          code: 'P2003',
          clientVersion: '6.19.3',
        },
      );
      database.contributionProposal.create.mockRejectedValue(databaseError);

      await expect(submit()).rejects.toBe(databaseError);
    });

    it('revalidates Project, intake, and the daily rate limit inside the write transaction', async () => {
      await submit();

      expect(projects.lockProposalProjectContext).toHaveBeenCalledWith(
        projectId,
        database,
      );
      expect(database.$executeRaw).toHaveBeenCalledTimes(1);
      expect(database.contributionProposal.count).toHaveBeenCalledTimes(1);
      expect(database.contributionProposal.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('submitVersion', () => {
    it('appends a new contributor-authored version only after a revision request', async () => {
      database.contributionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_request_sequence: 1,
        revision_requested_at: new Date('2026-07-28T10:00:00.000Z'),
      });
      database.contributionProposal.updateMany.mockResolvedValue({ count: 1 });

      await service.submitVersion({
        actor: contributor,
        proposalId,
        title: 'Add caching layer v2',
        ...revisedProposalContent,
        idempotencyKey,
      });

      expect(database.contributionProposalVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 2,
          problem_or_opportunity:
            revisedProposalContent.problemOrOpportunity,
          proposed_outcome: revisedProposalContent.proposedOutcome,
          project_benefit: revisedProposalContent.projectBenefit,
          authored_by: contributor.id,
        }),
      });
      expect(database.contributionProposal.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { current_version: 2, revision_requested_at: null },
        }),
      );
      expect(database.contributionProposalAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'version_submitted' }),
      });
    });

    it('rejects a new version when no revision was requested', async () => {
      database.contributionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_request_sequence: 0,
        revision_requested_at: null,
      });

      await expect(
        service.submitVersion({
          actor: contributor,
          proposalId,
          title: 'Unrequested revision',
          ...revisedProposalContent,
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: 'PROPOSAL_NO_REVISION_REQUESTED' });
      expect(database.contributionProposalVersion.create).not.toHaveBeenCalled();
    });

    it('does not let a non-proposer author a version', async () => {
      database.contributionProposal.findFirst.mockResolvedValue(null);

      await expect(
        service.submitVersion({
          actor: contributor,
          proposalId,
          title: 'Foreign revision',
          ...revisedProposalContent,
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND' });
    });

    it('does not clear an owner revision request that races with version submission', async () => {
      database.contributionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_request_sequence: 2,
        revision_requested_at: new Date('2026-07-28T10:00:00.000Z'),
      });
      database.contributionProposal.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.submitVersion({
          actor: contributor,
          proposalId,
          title: 'Add caching layer v2',
          ...revisedProposalContent,
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: 'PROPOSAL_CONCURRENT_MODIFICATION' });
      expect(database.contributionProposalVersion.create).not.toHaveBeenCalled();
    });
  });

  describe('requestRevision', () => {
    it('records an append-only revision request without mutating versions', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_request_sequence: 0,
      });
      database.contributionProposal.updateMany.mockResolvedValue({ count: 1 });

      await service.requestRevision({
        actor: owner,
        proposalId,
        reason: 'Please clarify the delivery scope.',
        idempotencyKey,
      });

      expect(database.contributionProposal.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            revision_request_sequence: 1,
            revision_requested_at: expect.any(Date),
          },
        }),
      );
      expect(database.contributionProposalAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'revision_requested',
          reason: 'Please clarify the delivery scope.',
        }),
      });
      expect(database.contributionProposalVersion.create).not.toHaveBeenCalled();
      expect(notifications.createProposalNotification).toHaveBeenCalledWith(
        {
          userId: contributor.id,
          proposalId,
          projectId,
          action: 'revision_requested',
          revisionRequestSequence: 1,
        },
        { transaction: database, emitRealtime: false },
      );
      expect(notifications.emitProposalNotifications).toHaveBeenCalledWith([
        { notificationId: 'notification-1' },
      ]);
    });

    it('hides proposals from owners of other Projects', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_request_sequence: 0,
      });
      projects.lockProposalProjectContext.mockResolvedValue({
        id: projectId,
        ownerId: 'someone-else',
        status: ProjectStatus.published,
      });

      await expect(
        service.requestRevision({
          actor: owner,
          proposalId,
          reason: 'I should not be able to see this proposal.',
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND', statusCode: 404 });
    });
  });

  describe('withdraw', () => {
    it('withdraws a pending proposal by its proposer', async () => {
      database.contributionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
      });
      database.contributionProposal.updateMany.mockResolvedValue({ count: 1 });
      database.contributionProposal.findUniqueOrThrow.mockResolvedValue(
        proposalRecord({ status: ContributionProposalStatus.withdrawn }),
      );

      const result = await service.withdraw({
        actor: contributor,
        proposalId,
        idempotencyKey,
      });

      expect(result.status).toBe('WITHDRAWN');
      expect(database.contributionProposal.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: ContributionProposalStatus.withdrawn,
            withdrawn_at: expect.any(Date),
          },
        }),
      );
    });
  });

  describe('getForActor', () => {
    it('hides a proposal from contributors who are neither proposer nor owner', async () => {
      database.contributionProposal.findUnique.mockResolvedValue(
        proposalRecord({ proposer_id: 'another-contributor' }),
      );
      projects.getProposalProjectContext.mockResolvedValue({
        id: projectId,
        ownerId: owner.id,
        status: ProjectStatus.published,
      });

      await expect(
        service.getForActor(contributor, proposalId),
      ).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND' });
    });
  });

  describe('setIntake', () => {
    it('lets the Project owner toggle intake', async () => {
      database.projectProposalIntake.upsert.mockResolvedValue({
        project_id: projectId,
        enabled: false,
      });

      await expect(
        service.setIntake(owner, projectId, false),
      ).resolves.toEqual({ projectId, enabled: false });
      expect(database.projectProposalIntake.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { project_id: projectId },
          create: expect.objectContaining({ enabled: false }),
          update: expect.objectContaining({ enabled: false }),
        }),
      );
    });
  });

  describe('pagination', () => {
    it('returns a bounded cursor page for contributor and owner lists', async () => {
      database.contributionProposal.findMany.mockResolvedValue([
        proposalRecord({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          created_at: new Date('2026-07-29T12:00:00.000Z'),
        }),
        proposalRecord({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          created_at: new Date('2026-07-29T11:00:00.000Z'),
        }),
        proposalRecord({
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          created_at: new Date('2026-07-29T10:00:00.000Z'),
        }),
      ]);

      const result = await service.listMine(contributor, { limit: 2 });

      expect(result.proposals).toHaveLength(2);
      expect(result.pageInfo).toEqual({
        hasNextPage: true,
        nextCursor: expect.any(String),
      });
      expect(database.contributionProposal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });

    it('rejects malformed cursors with a stable public error', async () => {
      await expect(
        service.listForProject(owner, projectId, { cursor: 'not-a-cursor' }),
      ).rejects.toMatchObject({
        code: 'PROPOSAL_CURSOR_INVALID',
        statusCode: 400,
      });
    });

    it('rejects a decoded cursor containing a non-UUID database key', async () => {
      const cursor = Buffer.from(
        JSON.stringify({
          createdAt: '2026-07-29T12:00:00.000Z',
          id: 'not-a-uuid',
        }),
      ).toString('base64url');

      await expect(
        service.listMine(contributor, { cursor }),
      ).rejects.toMatchObject({
        code: 'PROPOSAL_CURSOR_INVALID',
        statusCode: 400,
      });
      expect(database.contributionProposal.findMany).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    it('accepts a pending proposal and creates one attributed draft Request', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_request_sequence: 0,
        versions: [
          {
            version: 1,
            title: 'Add caching layer',
            problem_or_opportunity: proposalContent.problemOrOpportunity,
            proposed_outcome: proposalContent.proposedOutcome,
            project_benefit: proposalContent.projectBenefit,
          },
        ],
      });
      database.contributionProposal.updateMany.mockResolvedValue({ count: 1 });
      database.contributionProposal.findUniqueOrThrow.mockResolvedValue(
        proposalRecord({
          status: ContributionProposalStatus.accepted,
          accepted_at: new Date('2026-07-29T09:00:00.000Z'),
          originatedRequest: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            status: 'draft',
          },
        }),
      );

      const result = await service.accept({
        actor: owner,
        proposalId,
        idempotencyKey,
      });

      expect(result.status).toBe('ACCEPTED');
      expect(result.resultingContributionRequestId).toBe(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      expect(result.resultingContributionRequestStatus).toBe('DRAFT');
      // Exactly one draft Request is created, attributed to the proposer.
      expect(
        contributionTasks.createDraftFromAcceptedProposal,
      ).toHaveBeenCalledTimes(1);
      expect(
        contributionTasks.createDraftFromAcceptedProposal,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: owner.id,
          projectId,
          proposalId,
          attributedContributorId: contributor.id,
          title: 'Add caching layer',
        }),
      );
      // Acceptance flips pending -> accepted under an optimistic guard.
      expect(database.contributionProposal.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ContributionProposalStatus.pending,
            current_version: 1,
            revision_request_sequence: 0,
          }),
          data: expect.objectContaining({
            status: ContributionProposalStatus.accepted,
          }),
        }),
      );
      expect(database.contributionProposalAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'accepted' }),
      });
      expect(notifications.createProposalNotification).toHaveBeenCalledWith(
        {
          userId: contributor.id,
          proposalId,
          projectId,
          action: 'accepted',
          resultingContributionRequestId:
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
        { transaction: database, emitRealtime: false },
      );
    });

    it('rejects acceptance by an owner of another Project', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_request_sequence: 0,
        versions: [{ version: 1, title: 'x' }],
      });
      projects.lockProposalProjectContext.mockResolvedValue({
        id: projectId,
        ownerId: 'someone-else',
        status: ProjectStatus.published,
      });

      await expect(
        service.accept({ actor: owner, proposalId, idempotencyKey }),
      ).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND' });
      expect(
        contributionTasks.createDraftFromAcceptedProposal,
      ).not.toHaveBeenCalled();
    });

    it('does not accept a terminal proposal', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.withdrawn,
        current_version: 1,
        revision_request_sequence: 0,
        versions: [{ version: 1, title: 'x' }],
      });

      await expect(
        service.accept({ actor: owner, proposalId, idempotencyKey }),
      ).rejects.toMatchObject({ code: 'PROPOSAL_TERMINAL', statusCode: 409 });
      expect(
        contributionTasks.createDraftFromAcceptedProposal,
      ).not.toHaveBeenCalled();
    });
  });

  describe('decline', () => {
    it('declines a pending proposal with a contributor-visible reason', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_request_sequence: 0,
      });
      database.contributionProposal.updateMany.mockResolvedValue({ count: 1 });
      database.contributionProposal.findUniqueOrThrow.mockResolvedValue(
        proposalRecord({
          status: ContributionProposalStatus.declined,
          declined_at: new Date('2026-07-29T09:00:00.000Z'),
          decline_reason: 'Out of scope for this Project right now.',
        }),
      );

      const result = await service.decline({
        actor: owner,
        proposalId,
        reason: 'Out of scope for this Project right now.',
        idempotencyKey,
      });

      expect(result.status).toBe('DECLINED');
      expect(result.declineReason).toBe(
        'Out of scope for this Project right now.',
      );
      expect(database.contributionProposal.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ContributionProposalStatus.declined,
            decline_reason: 'Out of scope for this Project right now.',
          }),
        }),
      );
      expect(
        contributionTasks.createDraftFromAcceptedProposal,
      ).not.toHaveBeenCalled();
      expect(notifications.createProposalNotification).toHaveBeenCalledWith(
        {
          userId: contributor.id,
          proposalId,
          projectId,
          action: 'declined',
        },
        { transaction: database, emitRealtime: false },
      );
    });
  });

  describe('reportMisuse', () => {
    it('preserves authorship evidence without any automatic finding', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        created_at: new Date('2026-07-28T09:00:00.000Z'),
        versions: [
          {
            version: 1,
            title: 'Add caching layer',
            problem_or_opportunity: proposalContent.problemOrOpportunity,
            proposed_outcome: proposalContent.proposedOutcome,
            project_benefit: proposalContent.projectBenefit,
            authored_by: contributor.id,
            created_at: new Date('2026-07-28T09:00:00.000Z'),
          },
        ],
      });

      const result = await service.reportMisuse({
        actor: owner,
        proposalId,
        reason: 'This proposal appears to copy another contributor’s work.',
        idempotencyKey,
      });

      expect(result).toMatchObject({ proposalId, reportedVersion: 1 });
      const createArg =
        database.contributionProposalMisuseReport.create.mock.calls[0][0];
      expect(createArg.data.evidence_snapshot).toMatchObject({
        proposalId,
        proposerId: contributor.id,
        reportedVersion: 1,
      });
    });

    it('replays an identical report instead of duplicating it', async () => {
      database.contributionProposalMisuseReport.findFirst.mockResolvedValue(
        misuseReportRecord(),
      );

      await service.reportMisuse({
        actor: contributor,
        proposalId,
        reason: 'Duplicate submission of the same report.',
        idempotencyKey,
      });

      expect(
        database.contributionProposalMisuseReport.create,
      ).not.toHaveBeenCalled();
    });

    it('hides the proposal from non-participants', async () => {
      database.contributionProposalMisuseReport.findFirst.mockResolvedValue(
        null,
      );
      database.contributionProposal.findUnique.mockResolvedValue(
        proposalRecord({ proposer_id: 'another-contributor' }),
      );
      projects.getProposalProjectContext.mockResolvedValue({
        id: projectId,
        ownerId: 'someone-else',
        status: ProjectStatus.published,
      });

      await expect(
        service.reportMisuse({
          actor: contributor,
          proposalId,
          reason: 'I should not be able to report this proposal.',
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND' });
    });
  });

  function submit() {
    return service.submit({
      actor: contributor,
      projectId,
      title: 'Add caching layer',
      ...proposalContent,
      idempotencyKey,
    });
  }
});

function misuseReportRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    proposal_id: proposalId,
    reporter_id: owner.id,
    reported_version: 1,
    reason: 'This proposal appears to copy another contributor’s work.',
    created_at: new Date('2026-07-29T09:00:00.000Z'),
    ...overrides,
  };
}

function proposalRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: proposalId,
    project_id: projectId,
    proposer_id: contributor.id,
    status: ContributionProposalStatus.pending,
    current_version: 1,
    revision_request_sequence: 0,
    disclosure_version: '2026-07-attribution-assignment',
    disclosure_acknowledged_at: new Date('2026-07-28T09:00:00.000Z'),
    revision_requested_at: null,
    accepted_at: null,
    declined_at: null,
    decline_reason: null,
    originatedRequest: null,
    created_at: new Date('2026-07-28T09:00:00.000Z'),
    updated_at: new Date('2026-07-28T09:00:00.000Z'),
    versions: [
      {
        version: 1,
        title: 'Add caching layer',
        problem_or_opportunity: proposalContent.problemOrOpportunity,
        proposed_outcome: proposalContent.proposedOutcome,
        project_benefit: proposalContent.projectBenefit,
        authored_by: contributor.id,
        created_at: new Date('2026-07-28T09:00:00.000Z'),
      },
    ],
    auditEvents: [],
    ...overrides,
  };
}

function fingerprintFor(value: unknown): string {
  // Mirrors the service's private fingerprint helper for replay assertions.
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
