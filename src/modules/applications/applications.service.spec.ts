import { ApplicationStatus, ContributionRequestStatus } from '@prisma/client';

import { ApplicationsService } from './applications.service';

describe('ApplicationsService owner-workspace summary', () => {
  const database = {
    application: {
      groupBy: jest.fn(),
    },
  };
  const service = new ApplicationsService(
    database as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('counts only pending owner-review Applications inside trusted Request scopes', async () => {
    database.application.groupBy.mockResolvedValue([
      {
        contribution_request_id: 'request-1',
        _count: { _all: 2 },
      },
    ]);

    await expect(
      service.summarizePendingByContributionRequests({
        requestScopes: [
          { projectId: 'project-1', contributionRequestIds: ['request-1'] },
          { projectId: 'project-2', contributionRequestIds: ['request-2'] },
        ],
      }),
    ).resolves.toEqual({
      projects: [
        { projectId: 'project-1', pendingApplicationCount: 2 },
        { projectId: 'project-2', pendingApplicationCount: 0 },
      ],
    });
    expect(database.application.groupBy).toHaveBeenCalledWith({
      by: ['contribution_request_id'],
      where: {
        contribution_request_id: { in: ['request-1', 'request-2'] },
        status: ApplicationStatus.pending_owner_review,
      },
      _count: { _all: true },
    });
  });

  it('returns stable zero summaries without querying for empty Request scopes', async () => {
    await expect(
      service.summarizePendingByContributionRequests({
        requestScopes: [{ projectId: 'project-1', contributionRequestIds: [] }],
      }),
    ).resolves.toEqual({
      projects: [{ projectId: 'project-1', pendingApplicationCount: 0 }],
    });
    expect(database.application.groupBy).not.toHaveBeenCalled();
  });
});

describe('ApplicationsService submission and withdrawal', () => {
  const contributor = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'contributor@example.com',
    role: 'contributor' as const,
    status: 'active' as const,
  };
  const ownerId = '22222222-2222-4222-8222-222222222222';
  const requestId = '33333333-3333-4333-8333-333333333333';
  const applicationId = '44444444-4444-4444-8444-444444444444';
  const database = {
    application: {
      groupBy: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    applicationRequirementSnapshot: { create: jest.fn() },
    applicationEvidenceSnapshot: { create: jest.fn() },
    applicationAudit: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const contributionTasks = {
    getApplicationSubmissionContext: jest.fn(),
    lockApplicationSubmissionContext: jest.fn(),
  };
  const skillProfiles = { listApprovedSkillsForEligibility: jest.fn() };
  const identity = { getUserById: jest.fn() };
  const notifications = { createApplicationNotification: jest.fn() };
  const contributorProfiles = { getApplicationProfileContext: jest.fn() };
  const service = new ApplicationsService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
    identity as never,
    notifications as never,
    contributorProfiles as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    const requestContext = {
      id: requestId,
      ownerId,
      status: ContributionRequestStatus.published,
      applicationsCloseAt: new Date('2030-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-28T11:00:00.000Z'),
      requirements: [
        { id: 'required-1', kind: 'required', position: 0, text: 'NestJS' },
      ],
    };
    contributionTasks.getApplicationSubmissionContext.mockResolvedValue(
      requestContext,
    );
    contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(
      requestContext,
    );
    identity.getUserById.mockResolvedValue({
      id: contributor.id,
      username: 'contributor',
      first_name: 'Example',
      last_name: 'Contributor',
    });
    skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([
      {
        skillProfileId: 'skill-1',
        name: 'NestJS',
        skillKey: 'nestjs',
        proficiencyLevel: 'advanced',
        confidence: 0.9,
        evidenceSummary: 'Implemented tested NestJS APIs',
        evidenceSources: { evidenceIds: ['github:repo'], limitations: [] },
      },
    ]);
    contributorProfiles.getApplicationProfileContext.mockResolvedValue({
      bio: 'Backend contributor',
      availability: '10 hours/week',
      experienceLevel: {
        key: 'advanced',
        labelEn: 'Advanced',
        labelAr: 'Advanced',
      },
      fields: [{ key: 'backend', labelEn: 'Backend', labelAr: 'Backend' }],
      declaredSkills: ['NestJS'],
    });
    database.applicationAudit.findFirst.mockResolvedValue(null);
    database.application.findUnique.mockResolvedValue(null);
    database.applicationRequirementSnapshot.create.mockResolvedValue({});
    database.applicationEvidenceSnapshot.create.mockResolvedValue({});
    database.applicationAudit.create.mockResolvedValue({});
    database.application.create.mockResolvedValue(applicationRecord());
    database.application.findUniqueOrThrow.mockResolvedValue(
      applicationRecord(),
    );
    notifications.createApplicationNotification.mockResolvedValue({
      created: true,
    });
  });

  it('submits one immutable snapshotted Application directly to owner review without AI or quota work', async () => {
    const result = await service.submit({
      actor: contributor,
      contributionRequestId: requestId,
      contributionApproach: 'I will implement and test the NestJS workflow.',
      proposedDeliveryDurationDays: 5,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });

    expect(database.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contribution_request_id: requestId,
          contributor_id: contributor.id,
          contribution_approach:
            'I will implement and test the NestJS workflow.',
          proposed_delivery_duration_days: 5,
          status: ApplicationStatus.pending_owner_review,
        }),
      }),
    );
    expect(database.applicationRequirementSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requirements: [
            expect.objectContaining({ id: 'required-1', kind: 'required' }),
          ],
        }),
      }),
    );
    expect(database.applicationEvidenceSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: [expect.objectContaining({ skillProfileId: 'skill-1' })],
          contributor_context: expect.objectContaining({
            profile: expect.objectContaining({ bio: 'Backend contributor' }),
          }),
        }),
      }),
    );
    expect(database.applicationAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'submitted' }),
      }),
    );
    expect(notifications.createApplicationNotification).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'submitted', userId: ownerId }),
    );
    expect(result.status).toBe('PENDING_OWNER_REVIEW');
    expect(result.profileContext).toEqual(
      expect.objectContaining({ bio: 'Backend contributor' }),
    );
  });

  it.each([
    [ContributionRequestStatus.cancelled, 'REQUEST_CANCELLED'],
    [ContributionRequestStatus.assigned, 'REQUEST_TERMINAL'],
  ])(
    'returns a distinct stable error for %s Requests',
    async (status, code) => {
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue({
        id: requestId,
        ownerId,
        status,
        applicationsCloseAt: new Date('2030-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-28T11:00:00.000Z'),
        requirements: [],
      });

      await expect(
        service.submit({
          actor: contributor,
          contributionRequestId: requestId,
          contributionApproach: 'I will deliver this request safely.',
          proposedDeliveryDurationDays: 5,
          idempotencyKey: '55555555-5555-4555-8555-555555555555',
        }),
      ).rejects.toMatchObject({ code });
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );

  it('returns stable closed, unauthorized, and duplicate submission errors', async () => {
    contributionTasks.getApplicationSubmissionContext.mockResolvedValueOnce({
      id: requestId,
      ownerId,
      status: ContributionRequestStatus.published,
      applicationsCloseAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      requirements: [],
    });
    await expect(
      service.submit({
        actor: contributor,
        contributionRequestId: requestId,
        contributionApproach: 'I will deliver this request safely.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATIONS_CLOSED' });

    await expect(
      service.submit({
        actor: { ...contributor, role: 'owner' },
        contributionRequestId: requestId,
        contributionApproach: 'I will deliver this request safely.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_AUTHORIZED' });

    database.application.findUnique.mockResolvedValueOnce(applicationRecord());
    await expect(
      service.submit({
        actor: contributor,
        contributionRequestId: requestId,
        contributionApproach: 'I will deliver this request safely.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_APPLIED' });
  });

  it('replays the same submission without creating snapshots, audit, or duplicate notifications', async () => {
    const input = {
      actor: contributor,
      contributionRequestId: requestId,
      contributionApproach: 'I will implement and test the NestJS workflow.',
      proposedDeliveryDurationDays: 5,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    };
    await service.submit(input);
    const fingerprint = database.applicationAudit.create.mock.calls[0][0].data
      .command_fingerprint as string;
    jest.clearAllMocks();
    database.applicationAudit.findFirst.mockResolvedValue({
      command_fingerprint: fingerprint,
      application: applicationRecord(),
    });
    notifications.createApplicationNotification.mockResolvedValue({
      created: false,
    });

    await expect(service.submit(input)).resolves.toMatchObject({
      id: applicationId,
      status: 'PENDING_OWNER_REVIEW',
    });
    expect(database.applicationAudit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actor_id: contributor.id,
          action: 'submitted',
          idempotency_key: input.idempotencyKey,
        },
      }),
    );
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(
      database.applicationRequirementSnapshot.create,
    ).not.toHaveBeenCalled();
    expect(database.applicationAudit.create).not.toHaveBeenCalled();
  });

  it('withdraws only the contributor-owned pending Application and appends one audit', async () => {
    database.application.findFirst.mockResolvedValue(applicationRecord());
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.application.findUniqueOrThrow.mockResolvedValue(
      applicationRecord({ status: ApplicationStatus.withdrawn }),
    );

    const result = await service.withdraw({
      actor: contributor,
      applicationId,
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    });

    expect(database.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: applicationId,
        contributor_id: contributor.id,
        status: ApplicationStatus.pending_owner_review,
      },
      data: { status: ApplicationStatus.withdrawn },
    });
    expect(database.applicationAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'withdrawn' }),
      }),
    );
    expect(notifications.createApplicationNotification).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'withdrawn', userId: ownerId }),
    );
    expect(result.status).toBe('WITHDRAWN');
  });

  it('does not allow withdrawal after an owner or system terminal outcome', async () => {
    database.application.findFirst.mockResolvedValue(
      applicationRecord({ status: ApplicationStatus.accepted }),
    );
    await expect(
      service.withdraw({ actor: contributor, applicationId }),
    ).rejects.toMatchObject({ code: 'APPLICATION_TERMINAL' });
    expect(database.application.updateMany).not.toHaveBeenCalled();
  });

  function applicationRecord(overrides: Record<string, unknown> = {}) {
    const submittedAt = new Date('2026-07-28T12:00:00.000Z');
    return {
      id: applicationId,
      contribution_request_id: requestId,
      contributor_id: contributor.id,
      contribution_approach: 'I will implement and test the NestJS workflow.',
      proposed_delivery_duration_days: 5,
      status: ApplicationStatus.pending_owner_review,
      submitted_at: submittedAt,
      review_due_at: new Date('2026-07-31T12:00:00.000Z'),
      expires_at: new Date('2026-08-04T12:00:00.000Z'),
      expired_at: null,
      requirementSnapshot: {
        requirements: [
          { id: 'required-1', kind: 'required', position: 0, text: 'NestJS' },
        ],
      },
      evidenceSnapshot: {
        contributor_context: {
          id: contributor.id,
          username: 'contributor',
          displayName: 'Example Contributor',
          profile: {
            bio: 'Backend contributor',
            availability: '10 hours/week',
            experienceLevel: {
              key: 'advanced',
              labelEn: 'Advanced',
              labelAr: 'Advanced',
            },
            fields: [
              { key: 'backend', labelEn: 'Backend', labelAr: 'Backend' },
            ],
            declaredSkills: ['NestJS'],
          },
        },
        evidence: [],
      },
      contributionRequest: { owner_id: ownerId },
      ...overrides,
    };
  }
});
