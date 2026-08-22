import { ApplicationStatus, OwnerDecisionType, Prisma } from '@prisma/client';

import { ApplicationRepository } from './application.repository';
import { APPLICATION_INCLUDE } from '../mappers/application.mapper';

describe('ApplicationRepository', () => {
  const database = {
    application: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      groupBy: jest.fn(),
      updateMany: jest.fn(),
    },
    applicationRequirementSnapshot: { create: jest.fn() },
    applicationEvidenceSnapshot: { create: jest.fn() },
    applicationAudit: { create: jest.fn(), createMany: jest.fn() },
    ownerDecision: { findFirst: jest.fn(), create: jest.fn() },
    assignment: { create: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  const repository = new ApplicationRepository(database as never);
  // A separate client standing in for the Prisma transaction, with its own
  // mocks so tests can prove which client a query went through.
  const transaction = {
    application: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      groupBy: jest.fn(),
      updateMany: jest.fn(),
    },
    applicationRequirementSnapshot: { create: jest.fn() },
    applicationEvidenceSnapshot: { create: jest.fn() },
    applicationAudit: { create: jest.fn(), createMany: jest.fn() },
    ownerDecision: { findFirst: jest.fn(), create: jest.fn() },
    assignment: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(() => jest.resetAllMocks());

  it('delegates transactions to DatabaseService.$transaction', async () => {
    const work = jest.fn().mockResolvedValue('result');
    database.$transaction.mockImplementation((run: () => unknown) => run());
    await expect(repository.inTransaction(work)).resolves.toBe('result');
    expect(database.$transaction).toHaveBeenCalledWith(work);
  });

  it('projects applied Contribution Request ids from the contributor rows', async () => {
    database.application.findMany.mockResolvedValue([
      { contribution_request_id: 'request-1' },
      { contribution_request_id: 'request-2' },
    ]);
    await expect(
      repository.findAppliedContributionRequestIds('contributor-1'),
    ).resolves.toEqual(['request-1', 'request-2']);
    expect(database.application.findMany).toHaveBeenCalledWith({
      where: { contributor_id: 'contributor-1' },
      select: { contribution_request_id: true },
    });
  });

  it('finds pending Applications for a Request, oldest submission first', async () => {
    database.application.findMany.mockResolvedValue([]);
    await repository.findPendingForRequest('request-1');
    expect(database.application.findMany).toHaveBeenCalledWith({
      where: {
        contribution_request_id: 'request-1',
        status: ApplicationStatus.pending_owner_review,
      },
      orderBy: [{ submitted_at: 'asc' }, { id: 'asc' }],
      include: APPLICATION_INCLUDE,
    });
  });

  it('uses the caller transaction for the duplicate check, not the base client', async () => {
    await repository.findDuplicateForContributor(
      { contributionRequestId: 'request-1', contributorId: 'contributor-1' },
      transaction as never,
    );
    expect(transaction.application.findUnique).toHaveBeenCalledWith({
      where: {
        contribution_request_id_contributor_id: {
          contribution_request_id: 'request-1',
          contributor_id: 'contributor-1',
        },
      },
      include: APPLICATION_INCLUDE,
    });
    expect(database.application.findUnique).not.toHaveBeenCalled();
  });

  it('turns the pending groupBy counts into a Map keyed by Request id', async () => {
    database.application.groupBy.mockResolvedValue([
      { contribution_request_id: 'request-1', _count: { _all: 2 } },
    ]);
    await expect(
      repository.countPendingByContributionRequestIds(['request-1', 'request-2']),
    ).resolves.toEqual(new Map([['request-1', 2]]));
    expect(database.application.groupBy).toHaveBeenCalledWith({
      by: ['contribution_request_id'],
      where: {
        contribution_request_id: { in: ['request-1', 'request-2'] },
        status: ApplicationStatus.pending_owner_review,
      },
      _count: { _all: true },
    });
  });

  it('locks pending siblings FOR UPDATE through raw SQL on the transaction', async () => {
    transaction.$queryRaw.mockResolvedValue([]);
    await repository.lockPendingApplicationsForUpdate(
      'request-1',
      transaction as never,
    );
    const query = transaction.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.values).toEqual(['request-1']);
    expect(query.strings.join('?')).toContain('FOR UPDATE');
    expect(query.strings.join('?')).toContain('"status" = \'pending_owner_review\'');
  });

  it('records the accepted decision with the decision type and decided_at', async () => {
    const decidedAt = new Date('2026-08-22T00:00:00.000Z');
    await repository.createOwnerDecision(
      {
        decisionId: 'decision-1',
        applicationId: 'application-1',
        contributionRequestId: 'request-1',
        ownerId: 'owner-1',
        decisionType: OwnerDecisionType.accepted,
        feedback: null,
        idempotencyKey: 'key-1',
        commandFingerprint: 'fingerprint-1',
        decidedAt,
      },
      transaction as never,
    );
    expect(transaction.ownerDecision.create).toHaveBeenCalledWith({
      data: {
        id: 'decision-1',
        application_id: 'application-1',
        contribution_request_id: 'request-1',
        owner_id: 'owner-1',
        decision_type: OwnerDecisionType.accepted,
        feedback: null,
        idempotency_key: 'key-1',
        command_fingerprint: 'fingerprint-1',
        decided_at: decidedAt,
      },
    });
  });

  it('suffices sibling ids onto the idempotency key in not_selected audits', async () => {
    await repository.createNotSelectedAudits(
      {
        siblings: [
          { id: 'sibling-1', contributor_id: 'contributor-1' },
          { id: 'sibling-2', contributor_id: 'contributor-2' },
        ],
        actorId: 'owner-1',
        idempotencyKey: 'key-1',
        commandFingerprint: 'fingerprint-1',
        selectedApplicationId: 'application-1',
        ownerDecisionId: 'decision-1',
      },
      transaction as never,
    );
    const { data } = transaction.applicationAudit.createMany.mock.calls[0][0];
    expect(data.map((row: { idempotency_key: string }) => row.idempotency_key)).toEqual([
      'key-1:sibling-1',
      'key-1:sibling-2',
    ]);
    expect(data[0].metadata).toEqual({
      payloadVersion: 1,
      selectedApplicationId: 'application-1',
      ownerDecisionId: 'decision-1',
    });
  });

  it('carries causation metadata when auditing request cancellation', async () => {
    await repository.createCancelledAudits(
      {
        applicationIds: ['application-1'],
        actorId: 'system',
        contributionRequestId: 'request-1',
        reason: 'withdrawn by owner',
        correlationId: 'correlation-1',
        causationAuditId: 'audit-1',
      },
      transaction as never,
    );
    const { data } = transaction.applicationAudit.createMany.mock.calls[0][0];
    expect(data).toEqual([
      {
        application_id: 'application-1',
        actor_id: 'system',
        action: 'request_cancelled',
        from_status: ApplicationStatus.pending_owner_review,
        to_status: ApplicationStatus.request_cancelled,
        metadata: {
          payloadVersion: 1,
          contributionRequestId: 'request-1',
          reason: 'withdrawn by owner',
          correlationId: 'correlation-1',
          causation: { type: 'contribution_request_audit', id: 'audit-1' },
        },
      },
    ]);
  });

  it('surfaces the updateMany count so callers can detect lost races', async () => {
    transaction.application.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      repository.markWithdrawn(
        { applicationId: 'application-1', contributorId: 'contributor-1' },
        transaction as never,
      ),
    ).resolves.toEqual({ count: 0 });
  });
});
