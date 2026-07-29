import { createHash } from 'node:crypto';
import { ContributionProposalStatus, ProjectStatus } from '@prisma/client';

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
    projectProposalIntake: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  const projects = { getProposalProjectContext: jest.fn() };
  const service = new ContributionProposalsService(
    database as never,
    projects as never,
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
    database.contributionProposalAudit.findFirst.mockResolvedValue(null);
    database.contributionProposalAudit.create.mockResolvedValue({});
    database.contributionProposal.findFirst.mockResolvedValue(null);
    database.contributionProposal.count.mockResolvedValue(0);
    database.contributionProposal.create.mockResolvedValue({});
    database.contributionProposalVersion.create.mockResolvedValue({});
    database.projectProposalIntake.findUnique.mockResolvedValue(null);
    database.contributionProposal.findUniqueOrThrow.mockResolvedValue(
      proposalRecord(),
    );
  });

  describe('submit', () => {
    it('creates a pending proposal with an immutable first version and audit', async () => {
      const result = await service.submit({
        actor: contributor,
        projectId,
        title: 'Add caching layer',
        body: 'Introduce a Redis caching layer for the discovery feed.',
        idempotencyKey,
      });

      expect(result.status).toBe('PENDING');
      expect(result.currentVersion).toBe(1);
      expect(database.contributionProposalVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 1,
          title: 'Add caching layer',
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
      projects.getProposalProjectContext.mockResolvedValue({
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
      database.projectProposalIntake.findUnique.mockResolvedValue({
        project_id: projectId,
        enabled: false,
      });

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

    it('rejects a second pending proposal to the same Project', async () => {
      database.contributionProposal.findFirst.mockResolvedValue({
        id: proposalId,
      });

      await expect(submit()).rejects.toMatchObject({
        code: 'PROPOSAL_ALREADY_PENDING',
        statusCode: 409,
      } satisfies Partial<ApplicationError>);
    });

    it('replays an identical submission without creating a duplicate', async () => {
      database.contributionProposalAudit.findFirst.mockResolvedValue({
        command_fingerprint: fingerprintFor({
          action: 'submitted',
          projectId,
          title: 'Add caching layer',
          body: 'Introduce a Redis caching layer for the discovery feed.',
        }),
        proposal: proposalRecord(),
      });

      await service.submit({
        actor: contributor,
        projectId,
        title: 'Add caching layer',
        body: 'Introduce a Redis caching layer for the discovery feed.',
        idempotencyKey,
      });

      expect(database.contributionProposal.create).not.toHaveBeenCalled();
    });
  });

  describe('submitVersion', () => {
    it('appends a new contributor-authored version only after a revision request', async () => {
      database.contributionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        proposer_id: contributor.id,
        status: ContributionProposalStatus.pending,
        current_version: 1,
        revision_requested_at: new Date('2026-07-28T10:00:00.000Z'),
      });
      database.contributionProposal.updateMany.mockResolvedValue({ count: 1 });

      await service.submitVersion({
        actor: contributor,
        proposalId,
        title: 'Add caching layer v2',
        body: 'Revised: add cache invalidation on publish.',
        idempotencyKey,
      });

      expect(database.contributionProposalVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 2,
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
        revision_requested_at: null,
      });

      await expect(
        service.submitVersion({
          actor: contributor,
          proposalId,
          title: 'Unrequested revision',
          body: 'This should not be allowed without a revision request.',
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
          body: 'Another contributor must not answer this revision request.',
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND' });
    });
  });

  describe('requestRevision', () => {
    it('records an append-only revision request without mutating versions', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
        status: ContributionProposalStatus.pending,
        current_version: 1,
      });
      database.contributionProposal.update.mockResolvedValue({});

      await service.requestRevision({
        actor: owner,
        proposalId,
        reason: 'Please clarify the delivery scope.',
        idempotencyKey,
      });

      expect(database.contributionProposal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { revision_requested_at: expect.any(Date) },
        }),
      );
      expect(database.contributionProposalAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'revision_requested',
          reason: 'Please clarify the delivery scope.',
        }),
      });
      expect(database.contributionProposalVersion.create).not.toHaveBeenCalled();
    });

    it('hides proposals from owners of other Projects', async () => {
      database.contributionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        project_id: projectId,
      });
      projects.getProposalProjectContext.mockResolvedValue({
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

  function submit() {
    return service.submit({
      actor: contributor,
      projectId,
      title: 'Add caching layer',
      body: 'Introduce a Redis caching layer for the discovery feed.',
      idempotencyKey,
    });
  }
});

function proposalRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: proposalId,
    project_id: projectId,
    proposer_id: contributor.id,
    status: ContributionProposalStatus.pending,
    current_version: 1,
    disclosure_version: '2026-07-attribution-assignment',
    disclosure_acknowledged_at: new Date('2026-07-28T09:00:00.000Z'),
    revision_requested_at: null,
    created_at: new Date('2026-07-28T09:00:00.000Z'),
    updated_at: new Date('2026-07-28T09:00:00.000Z'),
    versions: [
      {
        version: 1,
        title: 'Add caching layer',
        body: 'Introduce a Redis caching layer for the discovery feed.',
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
