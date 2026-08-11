import {
  ApplicationAuditAction,
  ApplicationStatus,
  ContributionRequestStatus,
  OwnerDecisionType,
  Prisma,
} from '@prisma/client';

import {
  ConflictApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
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
  const owner = {
    id: ownerId,
    email: 'owner@example.com',
    role: 'owner' as const,
    status: 'active' as const,
  };
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
    applicationAudit: {
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    ownerDecision: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
    assignment: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  const contributionTasks = {
    getApplicationSubmissionContext: jest.fn(),
    lockApplicationSubmissionContext: jest.fn(),
    confirmOwnerDecisionActor: jest.fn(),
    reconfirmOwnerDecisionActor: jest.fn(),
    assignFromOwnerDecision: jest.fn(),
  };
  const skillProfiles = {
    listAuthorizedSkillsForApplicationSnapshot: jest.fn(),
  };
  const identity = { getUserById: jest.fn() };
  const notifications = {
    createApplicationNotification: jest.fn(),
    emitApplicationNotifications: jest.fn(),
  };
  const contributorProfiles = { getApplicationProfileContext: jest.fn() };
  const assignmentConversations = {
    ensureForAssignment: jest.fn().mockResolvedValue({
      conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    }),
  };
  const service = new ApplicationsService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
    identity as never,
    notifications as never,
    contributorProfiles as never,
    assignmentConversations as never,
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
    contributionTasks.confirmOwnerDecisionActor.mockResolvedValue(undefined);
    contributionTasks.reconfirmOwnerDecisionActor.mockResolvedValue(undefined);
    identity.getUserById.mockResolvedValue({
      id: contributor.id,
      username: 'contributor',
      first_name: 'Example',
      last_name: 'Contributor',
    });
    skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue([
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
    database.ownerDecision.findUnique.mockResolvedValue(null);
    database.assignment.findUnique.mockResolvedValue(null);
    database.application.findUnique.mockResolvedValue(null);
    database.applicationRequirementSnapshot.create.mockResolvedValue({});
    database.applicationEvidenceSnapshot.create.mockResolvedValue({});
    database.applicationAudit.create.mockResolvedValue({});
    database.applicationAudit.createMany.mockResolvedValue({ count: 0 });
    database.$queryRaw.mockResolvedValue([]);
    database.application.create.mockResolvedValue(applicationRecord());
    database.application.findUniqueOrThrow.mockResolvedValue(
      applicationRecord(),
    );
    notifications.createApplicationNotification.mockResolvedValue({
      created: true,
      notification: { notificationId: 'notification-1' },
    });
  });

  // Several tests below pin the clock with jest.useFakeTimers() before their
  // mock setup, outside the try/finally that restores it. If any of that setup
  // throws, the finally never runs and fake timers leak into every later test
  // in this file — and with setTimeout faked, async tests hang rather than
  // fail. restoreAllMocks does not restore timers, so do it here: afterEach
  // runs whatever the outcome, which is the only placement that actually
  // closes the hole.
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
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
    expect(
      skillProfiles.listAuthorizedSkillsForApplicationSnapshot,
    ).toHaveBeenCalledWith(contributor.id, database);
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

    contributionTasks.getApplicationSubmissionContext.mockResolvedValueOnce(
      null,
    );
    await expect(
      service.submit({
        actor: contributor,
        contributionRequestId: requestId,
        contributionApproach: 'I will deliver this request safely.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_AUTHORIZED' });

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
    ).rejects.toMatchObject({
      code: 'APPLICATION_TERMINAL',
    });
    expect(database.application.updateMany).not.toHaveBeenCalled();
  });

  it.each([undefined, 'pending', 'failed'])(
    'keeps pending Applications visible and decidable regardless of AI assessment state %j',
    async (assessmentStatus) => {
      database.application.findMany.mockResolvedValue([
        applicationRecord({ assessmentStatus }),
      ]);

      await expect(service.listForOwner(owner, requestId)).resolves.toMatchObject(
        { applications: [{ id: applicationId, status: 'PENDING_OWNER_REVIEW' }] },
      );
      expect(database.application.findMany).toHaveBeenCalledWith({
        where: {
          contribution_request_id: requestId,
          status: ApplicationStatus.pending_owner_review,
        },
        orderBy: [
          { is_priority: 'desc' },
          { submitted_at: 'asc' },
          { id: 'asc' },
        ],
        include: expect.any(Object),
      });
      expect(contributionTasks.confirmOwnerDecisionActor).toHaveBeenCalledWith({
        requestId,
        ownerId,
      });
    },
  );

  it('conceals an unknown Request or former owner when listing the decision queue', async () => {
    contributionTasks.confirmOwnerDecisionActor.mockRejectedValue(
      new NotFoundApplicationError(
        'Project was not found',
        'CONTRIBUTION_REQUEST_PROJECT_NOT_FOUND',
      ),
    );

    await expect(service.listForOwner(owner, requestId)).rejects.toMatchObject({
      code: 'APPLICATION_NOT_FOUND',
      statusCode: 404,
    });
    expect(database.application.findMany).not.toHaveBeenCalled();
  });

  it('returns the declined decision and feedback in contributor-visible Application detail', async () => {
    const decisionId = '88888888-8888-4888-8888-888888888888';
    database.application.findUnique.mockResolvedValue(
      applicationRecord({
        status: ApplicationStatus.declined_by_owner,
        ownerDecision: {
          id: decisionId,
          application_id: applicationId,
          contribution_request_id: requestId,
          owner_id: ownerId,
          decision_type: OwnerDecisionType.declined,
          feedback: 'The test strategy needs more detail.',
          idempotency_key: '77777777-7777-4777-8777-777777777777',
          command_fingerprint: 'fingerprint',
          decided_at: new Date('2026-07-29T12:00:00.000Z'),
        },
      }),
    );

    await expect(service.getForActor(contributor, applicationId)).resolves.toMatchObject({
      status: 'DECLINED_BY_OWNER',
      ownerDecision: {
        id: decisionId,
        decisionType: 'DECLINED',
        feedback: 'The test strategy needs more detail.',
      },
      assignment: null,
    });
  });

  it('authorizes owner detail through current Project ownership instead of the denormalized Request owner', async () => {
    database.application.findUnique.mockResolvedValue(
      applicationRecord({
        contributionRequest: {
          owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
      }),
    );

    await expect(service.getForActor(owner, applicationId)).resolves.toMatchObject({
      id: applicationId,
    });
    expect(contributionTasks.confirmOwnerDecisionActor).toHaveBeenCalledWith({
      requestId,
      ownerId,
    });
  });

  it('presents the inclusive day-5 overdue boundary only while review is pending', async () => {
    const dayFive = new Date('2026-08-02T12:00:00.000Z');
    const dateNow = jest.spyOn(Date, 'now');
    database.application.findUnique.mockResolvedValue(applicationRecord());

    dateNow.mockReturnValue(dayFive.getTime() - 1);
    await expect(service.getForActor(contributor, applicationId)).resolves.toMatchObject({
      overdue: false,
      expiredAt: null,
    });

    dateNow.mockReturnValue(dayFive.getTime());
    await expect(service.getForActor(contributor, applicationId)).resolves.toMatchObject({
      overdue: true,
      reviewDueAt: new Date('2026-07-31T12:00:00.000Z'),
      expiresAt: new Date('2026-08-04T12:00:00.000Z'),
      expiredAt: null,
    });

    dateNow.mockReturnValue(dayFive.getTime() + 1);
    await expect(service.getForActor(contributor, applicationId)).resolves.toMatchObject({
      overdue: true,
      expiredAt: null,
    });

    database.application.findUnique.mockResolvedValue(
      applicationRecord({
        status: ApplicationStatus.expired,
        expired_at: new Date('2026-08-04T12:00:00.000Z'),
      }),
    );
    dateNow.mockReturnValue(new Date('2026-08-05T12:00:00.000Z').getTime());
    await expect(service.getForActor(contributor, applicationId)).resolves.toMatchObject({
      status: 'EXPIRED',
      overdue: false,
      expiresAt: new Date('2026-08-04T12:00:00.000Z'),
      expiredAt: new Date('2026-08-04T12:00:00.000Z'),
    });
    expect(database.application.updateMany).not.toHaveBeenCalled();
    expect(database.applicationAudit.create).not.toHaveBeenCalled();
    expect(database.ownerDecision.create).not.toHaveBeenCalled();
    expect(database.assignment.create).not.toHaveBeenCalled();
    expect(notifications.createApplicationNotification).not.toHaveBeenCalled();
    expect(notifications.emitApplicationNotifications).not.toHaveBeenCalled();
    dateNow.mockRestore();
  });

  it.each(['', '   '])(
    'rejects blank owner-decline feedback before opening a transaction: %j',
    async (feedback) => {
      await expect(
        service.decline({
          actor: owner,
          applicationId,
          feedback,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
      ).rejects.toMatchObject({
        code: 'APPLICATION_DECISION_FEEDBACK_REQUIRED',
      });
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, 42])(
    'rejects missing or non-string owner-decline feedback at the service seam before opening a transaction: %j',
    async (feedback) => {
      await expect(
        service.decline({
          actor: owner,
          applicationId,
          feedback: feedback as never,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
      ).rejects.toMatchObject({
        code: 'APPLICATION_DECISION_FEEDBACK_REQUIRED',
      });
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );

  it('declines one pending Application with trimmed feedback and no cross-Application effect', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
    database.application.findFirst.mockResolvedValue(applicationRecord());
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.ownerDecision.create.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'declined',
      feedback: 'The proposed approach does not address testing.',
      decided_at: new Date('2026-07-29T12:00:00.000Z'),
    });
    database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'declined',
      feedback: 'The proposed approach does not address testing.',
      idempotency_key: '77777777-7777-4777-8777-777777777777',
      command_fingerprint: 'fingerprint',
      decided_at: new Date('2026-07-29T12:00:00.000Z'),
      application: applicationRecord({
        status: ApplicationStatus.declined_by_owner,
      }),
      assignment: null,
    });
    database.application.findUniqueOrThrow.mockResolvedValue(
      applicationRecord({ status: ApplicationStatus.declined_by_owner }),
    );

    try {
      await expect(
        service.decline({
          actor: owner,
          applicationId,
          feedback: '  The proposed approach does not address testing.  ',
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
      ).resolves.toMatchObject({
        application: { status: 'DECLINED_BY_OWNER' },
        ownerDecision: {
          decisionType: 'DECLINED',
          feedback: 'The proposed approach does not address testing.',
        },
        assignment: null,
      });
    } finally {
      jest.useRealTimers();
    }

    expect(database.ownerDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        application_id: applicationId,
        decision_type: 'declined',
        feedback: 'The proposed approach does not address testing.',
      }),
    });
    expect(database.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: applicationId,
        status: ApplicationStatus.pending_owner_review,
      },
      data: {
        status: ApplicationStatus.declined_by_owner,
        owner_reviewed_at: expect.any(Date),
      },
    });
    expect(contributionTasks.assignFromOwnerDecision).not.toHaveBeenCalled();
    expect(contributionTasks.reconfirmOwnerDecisionActor).toHaveBeenCalledWith({
      requestId,
      ownerId,
      transaction: database,
    });
    expect(database.assignment.create).not.toHaveBeenCalled();
    expect(notifications.createApplicationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: contributor.id,
        applicationId,
        action: 'declined_by_owner',
      }),
      { transaction: database, emitRealtime: false },
    );
    expect(notifications.emitApplicationNotifications).toHaveBeenCalledWith([
      { notificationId: 'notification-1' },
    ]);
  });

  it('allows the owner to decline an overdue Application before expiry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
    database.application.findFirst.mockResolvedValue(applicationRecord());
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'declined',
      feedback: 'Another proposal is a stronger fit.',
      idempotency_key: '77777777-7777-4777-8777-777777777777',
      command_fingerprint: 'fingerprint',
      decided_at: new Date('2026-08-02T12:00:00.000Z'),
      application: applicationRecord({
        status: ApplicationStatus.declined_by_owner,
        owner_reviewed_at: new Date('2026-08-02T12:00:00.000Z'),
      }),
      assignment: null,
    });

    try {
      await expect(
        service.decline({
          actor: owner,
          applicationId,
          feedback: 'Another proposal is a stronger fit.',
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
      ).resolves.toMatchObject({
        application: { status: 'DECLINED_BY_OWNER' },
        ownerDecision: { decisionType: 'DECLINED' },
      });
      expect(database.application.updateMany).toHaveBeenCalledWith({
        where: {
          id: applicationId,
          status: ApplicationStatus.pending_owner_review,
        },
        data: {
          status: ApplicationStatus.declined_by_owner,
          owner_reviewed_at: new Date('2026-08-02T12:00:00.000Z'),
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('exposes only the contributor own declined decision as report context without changing Application state', async () => {
    const decisionId = '88888888-8888-4888-8888-888888888888';
    database.ownerDecision.findFirst.mockResolvedValue({
      id: decisionId,
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      feedback: 'The proposed approach does not address testing.',
      application: { contributor_id: contributor.id },
    });

    await expect(
      service.getOwnerDecisionReportContext(contributor, decisionId),
    ).resolves.toEqual({
      ownerDecisionId: decisionId,
      applicationId,
      contributionRequestId: requestId,
      contributorId: contributor.id,
      ownerId,
      feedback: 'The proposed approach does not address testing.',
    });

    expect(database.ownerDecision.findFirst).toHaveBeenCalledWith({
      where: {
        id: decisionId,
        decision_type: 'declined',
        application: { contributor_id: contributor.id },
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
    expect(database.application.updateMany).not.toHaveBeenCalled();
  });

  it('limits decision feedback reporting to an active affected contributor', async () => {
    await expect(
      service.getOwnerDecisionReportContext(owner, applicationId),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_AUTHORIZED' });
    expect(database.ownerDecision.findFirst).not.toHaveBeenCalled();

    database.ownerDecision.findFirst.mockResolvedValue(null);
    await expect(
      service.getOwnerDecisionReportContext(contributor, applicationId),
    ).rejects.toMatchObject({ code: 'OWNER_DECISION_NOT_FOUND' });
  });

  it.each([undefined, 'pending', 'failed'])(
    'accepts exactly one pending Application with AI assessment state %j, assigns its Request, and closes pending siblings without feedback',
    async (assessmentStatus) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
    const siblingId = '99999999-9999-4999-8999-999999999999';
    const siblingContributorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const decisionId = '88888888-8888-4888-8888-888888888888';
    const assignmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const acceptedApplication = applicationRecord({
      status: ApplicationStatus.accepted,
      owner_reviewed_at: new Date('2026-07-29T12:00:00.000Z'),
    });
    const assignment = {
      id: assignmentId,
      contribution_request_id: requestId,
      application_id: applicationId,
      owner_decision_id: decisionId,
      contributor_id: contributor.id,
      agreed_delivery_duration_days: 5,
      agreed_delivery_due_at: new Date('2026-08-03T12:00:00.000Z'),
      assigned_at: new Date('2026-07-29T12:00:00.000Z'),
    };
    database.application.findFirst.mockResolvedValue(
      applicationRecord({ assessmentStatus }),
    );
    database.$queryRaw.mockResolvedValue([
      { id: applicationId, contributor_id: contributor.id },
      { id: siblingId, contributor_id: siblingContributorId },
    ]);
    database.application.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    database.application.findMany.mockResolvedValue([
      { id: siblingId, contributor_id: siblingContributorId },
    ]);
    database.assignment.create.mockResolvedValue(assignment);
    database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
      id: decisionId,
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'accepted',
      feedback: null,
      idempotency_key: '77777777-7777-4777-8777-777777777777',
      command_fingerprint: 'fingerprint',
      decided_at: new Date('2026-07-29T12:00:00.000Z'),
      application: acceptedApplication,
      assignment,
    });
    contributionTasks.assignFromOwnerDecision.mockResolvedValue(undefined);

    try {
      await expect(
        service.accept({
          actor: owner,
          applicationId,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
      ).resolves.toMatchObject({
        application: { status: 'ACCEPTED' },
        ownerDecision: { decisionType: 'ACCEPTED', feedback: null },
        assignment: {
          applicationId,
          agreedDeliveryDurationDays: 5,
          agreedDeliveryDueDate: new Date('2026-08-03T12:00:00.000Z'),
        },
      });

      expect(contributionTasks.assignFromOwnerDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId,
          ownerId,
          ownerDecisionId: expect.any(String),
          transaction: database,
        }),
      );
      expect(contributionTasks.reconfirmOwnerDecisionActor).toHaveBeenCalledWith({
        requestId,
        ownerId,
        transaction: database,
      });
      expect(database.ownerDecision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.any(String),
          decision_type: 'accepted',
          feedback: null,
        }),
      });
      expect(database.assignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contribution_request_id: requestId,
          application_id: applicationId,
          owner_decision_id: expect.any(String),
          contributor_id: contributor.id,
          agreed_delivery_duration_days: 5,
          agreed_delivery_due_at: new Date('2026-08-03T12:00:00.000Z'),
        }),
      });
      expect(assignmentConversations.ensureForAssignment).toHaveBeenCalledWith({
        assignmentId: expect.any(String),
        transaction: database,
      });
      expect(database.application.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          contribution_request_id: requestId,
          id: { not: applicationId },
          status: ApplicationStatus.pending_owner_review,
        },
        data: { status: ApplicationStatus.not_selected },
      });
      expect(database.applicationAudit.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            application_id: siblingId,
            action: ApplicationAuditAction.not_selected,
            to_status: ApplicationStatus.not_selected,
          }),
        ],
      });
      expect(notifications.createApplicationNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: siblingContributorId,
          action: 'not_selected',
        }),
        { transaction: database, emitRealtime: false },
      );
      expect(notifications.emitApplicationNotifications).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
    },
  );

  it('allows the owner to accept an overdue Application before expiry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
    const decisionId = '88888888-8888-4888-8888-888888888888';
    const assignmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const assignment = {
      id: assignmentId,
      contribution_request_id: requestId,
      application_id: applicationId,
      owner_decision_id: decisionId,
      contributor_id: contributor.id,
      agreed_delivery_duration_days: 5,
      agreed_delivery_due_at: new Date('2026-08-07T12:00:00.000Z'),
      assigned_at: new Date('2026-08-02T12:00:00.000Z'),
    };
    database.application.findFirst.mockResolvedValue(applicationRecord());
    database.$queryRaw.mockResolvedValue([
      { id: applicationId, contributor_id: contributor.id },
    ]);
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.application.findMany.mockResolvedValue([]);
    database.assignment.create.mockResolvedValue(assignment);
    database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
      id: decisionId,
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'accepted',
      feedback: null,
      idempotency_key: '77777777-7777-4777-8777-777777777777',
      command_fingerprint: 'fingerprint',
      decided_at: new Date('2026-08-02T12:00:00.000Z'),
      application: applicationRecord({
        status: ApplicationStatus.accepted,
        owner_reviewed_at: new Date('2026-08-02T12:00:00.000Z'),
      }),
      assignment,
    });
    contributionTasks.assignFromOwnerDecision.mockResolvedValue(undefined);

    try {
      await expect(
        service.accept({
          actor: owner,
          applicationId,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
      ).resolves.toMatchObject({
        application: { status: 'ACCEPTED' },
        ownerDecision: { decisionType: 'ACCEPTED', feedback: null },
        assignment: {
          id: assignmentId,
          agreedDeliveryDueDate: new Date('2026-08-07T12:00:00.000Z'),
        },
      });
      expect(database.application.updateMany).toHaveBeenCalledWith({
        where: {
          id: applicationId,
          status: ApplicationStatus.pending_owner_review,
        },
        data: {
          status: ApplicationStatus.accepted,
          owner_reviewed_at: new Date('2026-08-02T12:00:00.000Z'),
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects an accept command for a non-pending Application with a stable error', async () => {
    database.application.findFirst.mockResolvedValue(
      applicationRecord({ status: ApplicationStatus.declined_by_owner }),
    );

    await expect(
      service.accept({
        actor: owner,
        applicationId,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATION_TERMINAL' });
    expect(contributionTasks.assignFromOwnerDecision).not.toHaveBeenCalled();
    expect(database.assignment.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      command: 'accept',
      decide: () =>
        service.accept({
          actor: owner,
          applicationId,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
    },
    {
      command: 'decline',
      decide: () =>
        service.decline({
          actor: owner,
          applicationId,
          feedback: 'Another proposal is a stronger fit.',
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
    },
  ])(
    'returns the stable terminal conflict with no stale effects when expiry wins before $command',
    async ({ decide }) => {
      database.application.findFirst.mockResolvedValue(
        applicationRecord({
          status: ApplicationStatus.expired,
          expired_at: new Date('2026-08-04T12:00:00.000Z'),
        }),
      );

      await expect(decide()).rejects.toMatchObject({
        code: 'APPLICATION_TERMINAL',
        metadata: { status: ApplicationStatus.expired },
      });
      expect(database.ownerDecision.create).not.toHaveBeenCalled();
      expect(database.assignment.create).not.toHaveBeenCalled();
      expect(database.application.updateMany).not.toHaveBeenCalled();
      expect(database.applicationAudit.create).not.toHaveBeenCalled();
      expect(
        notifications.createApplicationNotification,
      ).not.toHaveBeenCalled();
      expect(notifications.emitApplicationNotifications).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      command: 'accept',
      decide: () =>
        service.accept({
          actor: owner,
          applicationId,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
    },
    {
      command: 'decline',
      decide: () =>
        service.decline({
          actor: owner,
          applicationId,
          feedback: 'Another proposal is a stronger fit.',
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
    },
  ])(
    'rejects $command at the day-7 boundary even when the expiry sweep is late',
    async ({ decide }) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
      database.application.findFirst.mockResolvedValue(applicationRecord());

      try {
        await expect(decide()).rejects.toMatchObject({
          code: 'APPLICATION_TERMINAL',
          metadata: { status: ApplicationStatus.expired },
        });
        expect(
          contributionTasks.assignFromOwnerDecision,
        ).not.toHaveBeenCalled();
        expect(database.ownerDecision.create).not.toHaveBeenCalled();
        expect(database.assignment.create).not.toHaveBeenCalled();
        expect(database.application.updateMany).not.toHaveBeenCalled();
        expect(database.applicationAudit.create).not.toHaveBeenCalled();
        expect(
          notifications.createApplicationNotification,
        ).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it.each([
    { ...contributor, label: 'active contributor' },
    { ...owner, status: 'pending' as const, label: 'inactive owner' },
  ])('rejects $label before opening an Owner Decision transaction', async ({ label: _label, ...actor }) => {
    await expect(
      service.accept({
        actor,
        applicationId,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_AUTHORIZED' });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('reconfirms current Project ownership inside the transaction and conceals a former owner', async () => {
    database.application.findFirst.mockResolvedValue(applicationRecord());
    contributionTasks.reconfirmOwnerDecisionActor.mockRejectedValue(
      new NotFoundApplicationError(
        'Application was not found',
        'APPLICATION_NOT_FOUND',
      ),
    );

    await expect(
      service.decline({
        actor: owner,
        applicationId,
        feedback: 'The test strategy is incomplete.',
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_FOUND' });
    expect(contributionTasks.reconfirmOwnerDecisionActor).toHaveBeenCalledWith({
      requestId,
      ownerId,
      transaction: database,
    });
    expect(database.ownerDecision.create).not.toHaveBeenCalled();
  });

  it('maps a different-command Owner Decision uniqueness race to a stable conflict', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
    database.application.findFirst.mockResolvedValue(applicationRecord());
    database.ownerDecision.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    database.ownerDecision.findUnique.mockResolvedValue(null);

    try {
      await expect(
        service.decline({
          actor: owner,
          applicationId,
          feedback: 'The test strategy is incomplete.',
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
      ).rejects.toMatchObject({
        code: 'APPLICATION_CONCURRENT_MODIFICATION',
        statusCode: 409,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('exposes the complete Application progression for the contributor Delivery lifecycle', async () => {
    const assignedAt = new Date('2026-08-11T10:00:00.000Z');
    const deliveryDueAt = new Date('2026-08-25T10:00:00.000Z');
    database.application.findMany.mockResolvedValue([
      {
        id: applicationId,
        contribution_request_id: requestId,
        contributor_id: contributor.id,
        status: ApplicationStatus.accepted,
        contributionRequest: { title: 'Add JWT authentication' },
        contributor: {
          id: contributor.id,
          username: 'contributor',
          first_name: 'Example',
          last_name: 'Contributor',
          avatar_url: null,
        },
        assignment: {
          agreed_delivery_due_at: deliveryDueAt,
          assigned_at: assignedAt,
        },
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        contribution_request_id: requestId,
        contributor_id: contributor.id,
        status: ApplicationStatus.pending_owner_review,
        contributionRequest: { title: 'Incomplete legacy acceptance' },
        contributor: {
          id: contributor.id,
          username: 'contributor',
          first_name: 'Example',
          last_name: 'Contributor',
          avatar_url: null,
        },
        assignment: null,
      },
    ]);

    await expect(
      service.listDeliveryLifecycleContextsForContributor(contributor.id),
    ).resolves.toEqual([
      {
        applicationId,
        contributionRequestId: requestId,
        contributionRequestTitle: 'Add JWT authentication',
        contributorId: contributor.id,
        contributor: {
          id: contributor.id,
          username: 'contributor',
          displayName: 'Example Contributor',
          avatarUrl: null,
        },
        applicationStatus: 'ACCEPTED',
        deliveryDueAt,
        assignedAt,
      },
      {
        applicationId: '55555555-5555-4555-8555-555555555555',
        contributionRequestId: requestId,
        contributionRequestTitle: 'Incomplete legacy acceptance',
        contributorId: contributor.id,
        contributor: {
          id: contributor.id,
          username: 'contributor',
          displayName: 'Example Contributor',
          avatarUrl: null,
        },
        applicationStatus: 'PENDING_OWNER_REVIEW',
        deliveryDueAt: null,
        assignedAt: null,
      },
    ]);
    expect(database.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          contributor_id: contributor.id,
        },
      }),
    );
  });

  it('returns every pending Application as REQUEST_CANCELLED with immutable audits', async () => {
    const secondApplicationId = '55555555-5555-4555-8555-555555555555';
    database.$queryRaw.mockResolvedValue([
      { id: applicationId },
      { id: secondApplicationId },
    ]);
    database.application.updateMany.mockResolvedValue({ count: 2 });
    database.applicationAudit.createMany.mockResolvedValue({ count: 2 });

    await expect(
      service.cancelPendingForRequest({
        contributionRequestId: requestId,
        actorId: ownerId,
        reason: 'Project priorities changed',
        correlationId: '77777777-7777-4777-8777-777777777777',
        causationAuditId: '88888888-8888-4888-8888-888888888888',
        transaction: database as never,
      }),
    ).resolves.toEqual({
      cancelledApplicationIds: [applicationId, secondApplicationId],
    });

    expect(database.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [applicationId, secondApplicationId] },
        status: ApplicationStatus.pending_owner_review,
      },
      data: { status: ApplicationStatus.request_cancelled },
    });
    expect(database.applicationAudit.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          application_id: applicationId,
          actor_id: ownerId,
          action: 'request_cancelled',
          from_status: ApplicationStatus.pending_owner_review,
          to_status: ApplicationStatus.request_cancelled,
          metadata: {
            payloadVersion: 1,
            contributionRequestId: requestId,
            reason: 'Project priorities changed',
            correlationId: '77777777-7777-4777-8777-777777777777',
            causation: {
              type: 'contribution_request_audit',
              id: '88888888-8888-4888-8888-888888888888',
            },
          },
        }),
        expect.objectContaining({ application_id: secondApplicationId }),
      ],
    });
  });

  it('aborts cancellation when the locked pending set changes concurrently', async () => {
    database.$queryRaw.mockResolvedValue([
      { id: applicationId },
      { id: '55555555-5555-4555-8555-555555555555' },
    ]);
    database.application.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.cancelPendingForRequest({
        contributionRequestId: requestId,
        actorId: ownerId,
        reason: null,
        correlationId: '77777777-7777-4777-8777-777777777777',
        causationAuditId: '88888888-8888-4888-8888-888888888888',
        transaction: database as never,
      }),
    ).rejects.toMatchObject({
      code: 'APPLICATION_CONCURRENT_MODIFICATION',
      statusCode: 409,
    });
    expect(database.applicationAudit.createMany).not.toHaveBeenCalled();
  });

  it('returns the original accept result when the same idempotency key is retried', async () => {
    const decisionId = '88888888-8888-4888-8888-888888888888';
    const replay = {
      id: decisionId,
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'accepted',
      feedback: null,
      idempotency_key: '77777777-7777-4777-8777-777777777777',
      command_fingerprint:
        '1c791cc6af222de04a0d4121cc415e33d97daf0bbe541637c3cc6e4d3ac6ad08',
      decided_at: new Date('2026-07-29T12:00:00.000Z'),
      application: applicationRecord({ status: ApplicationStatus.accepted }),
      assignment: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        contribution_request_id: requestId,
        application_id: applicationId,
        owner_decision_id: decisionId,
        contributor_id: contributor.id,
        agreed_delivery_duration_days: 5,
        agreed_delivery_due_at: new Date('2026-08-03T12:00:00.000Z'),
        assigned_at: new Date('2026-07-29T12:00:00.000Z'),
      },
    };
    database.ownerDecision.findUnique.mockResolvedValue(replay);
    database.application.findFirst.mockResolvedValue(replay.application);
    database.application.findMany.mockResolvedValue([]);

    const result = await service.accept({
      actor: owner,
      applicationId,
      idempotencyKey: '77777777-7777-4777-8777-777777777777',
    });

    expect(result).toMatchObject({
      ownerDecision: { id: decisionId, decisionType: 'ACCEPTED' },
      assignment: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    });
    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(contributionTasks.reconfirmOwnerDecisionActor).toHaveBeenCalled();
    expect(database.ownerDecision.create).not.toHaveBeenCalled();
    expect(database.assignment.create).not.toHaveBeenCalled();
  });

  it('returns the original accept result when a same-key concurrent retry observes the Request after assignment', async () => {
    const decisionId = '88888888-8888-4888-8888-888888888888';
    const replay = {
      id: decisionId,
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'accepted',
      feedback: null,
      idempotency_key: '77777777-7777-4777-8777-777777777777',
      command_fingerprint:
        '1c791cc6af222de04a0d4121cc415e33d97daf0bbe541637c3cc6e4d3ac6ad08',
      decided_at: new Date('2026-07-29T12:00:00.000Z'),
      application: applicationRecord({ status: ApplicationStatus.accepted }),
      assignment: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        contribution_request_id: requestId,
        application_id: applicationId,
        owner_decision_id: decisionId,
        contributor_id: contributor.id,
        agreed_delivery_duration_days: 5,
        agreed_delivery_due_at: new Date('2026-08-03T12:00:00.000Z'),
        assigned_at: new Date('2026-07-29T12:00:00.000Z'),
      },
    };
    database.ownerDecision.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(replay);
    database.application.findFirst.mockResolvedValue(applicationRecord());
    database.application.findMany.mockResolvedValue([]);
    contributionTasks.assignFromOwnerDecision.mockRejectedValue(
      new ConflictApplicationError(
        'The Contribution Request can no longer be assigned',
        'REQUEST_TERMINAL',
      ),
    );

    await expect(
      service.accept({
        actor: owner,
        applicationId,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).resolves.toMatchObject({
      ownerDecision: { id: decisionId, decisionType: 'ACCEPTED' },
      assignment: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    });
    expect(database.ownerDecision.findUnique).toHaveBeenCalledTimes(2);
    expect(database.ownerDecision.create).not.toHaveBeenCalled();
    expect(database.assignment.create).not.toHaveBeenCalled();
  });

  it('returns the original decline result when the same idempotency key is retried', async () => {
    const decisionId = '88888888-8888-4888-8888-888888888888';
    database.ownerDecision.findUnique.mockResolvedValue({
      id: decisionId,
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'declined',
      feedback: 'Not enough testing detail.',
      idempotency_key: '77777777-7777-4777-8777-777777777777',
      command_fingerprint:
        'bda7148e4d11ad6005684ddab40b1ad4c3586fe716ef603f55bdfa651d9077eb',
      decided_at: new Date('2026-07-29T12:00:00.000Z'),
      application: applicationRecord({
        status: ApplicationStatus.declined_by_owner,
      }),
      assignment: null,
    });
    database.application.findFirst.mockResolvedValue(
      applicationRecord({ status: ApplicationStatus.declined_by_owner }),
    );

    const result = await service.decline({
      actor: owner,
      applicationId,
      feedback: 'Not enough testing detail.',
      idempotencyKey: '77777777-7777-4777-8777-777777777777',
    });

    expect(result).toMatchObject({
      ownerDecision: { id: decisionId, decisionType: 'DECLINED' },
      assignment: null,
    });
    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(contributionTasks.reconfirmOwnerDecisionActor).toHaveBeenCalled();
    expect(database.ownerDecision.create).not.toHaveBeenCalled();
  });

  it('serializes concurrent accepts for sibling Applications so only one Assignment succeeds', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
    const siblingId = '99999999-9999-4999-8999-999999999999';
    const siblingContributorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const decisionId = '88888888-8888-4888-8888-888888888888';
    let requestAssigned = false;
    database.application.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(
        applicationRecord(
          where.id === siblingId
            ? { id: siblingId, contributor_id: siblingContributorId }
            : {},
        ),
      ),
    );
    database.$queryRaw.mockResolvedValue([
      { id: applicationId, contributor_id: contributor.id },
      { id: siblingId, contributor_id: siblingContributorId },
    ]);
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.application.findMany.mockResolvedValue([
      { id: siblingId, contributor_id: siblingContributorId },
    ]);
    database.assignment.create.mockResolvedValue({});
    database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
      id: decisionId,
      application_id: applicationId,
      contribution_request_id: requestId,
      owner_id: ownerId,
      decision_type: 'accepted',
      feedback: null,
      idempotency_key: '77777777-7777-4777-8777-777777777777',
      command_fingerprint: 'fingerprint',
      decided_at: new Date('2026-07-29T12:00:00.000Z'),
      application: applicationRecord({ status: ApplicationStatus.accepted }),
      assignment: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        contribution_request_id: requestId,
        application_id: applicationId,
        owner_decision_id: decisionId,
        contributor_id: contributor.id,
        agreed_delivery_duration_days: 5,
        agreed_delivery_due_at: new Date('2026-08-03T12:00:00.000Z'),
        assigned_at: new Date('2026-07-29T12:00:00.000Z'),
      },
    });
    contributionTasks.assignFromOwnerDecision.mockImplementation(async () => {
      if (requestAssigned) {
        throw new ConflictApplicationError(
          'The Contribution Request no longer accepts an Assignment',
          'REQUEST_TERMINAL',
        );
      }
      requestAssigned = true;
    });

    let outcomes!: PromiseSettledResult<unknown>[];
    try {
      outcomes = await Promise.allSettled([
        service.accept({
          actor: owner,
          applicationId,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
        service.accept({
          actor: owner,
          applicationId: siblingId,
          idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        }),
      ]);
    } finally {
      jest.useRealTimers();
    }

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(database.assignment.create).toHaveBeenCalledTimes(1);
  });

  it('leaves accepted and withdrawn Applications and their audit history unchanged', async () => {
    const acceptedId = '55555555-5555-4555-8555-555555555555';
    const withdrawnId = '66666666-6666-4666-8666-666666666666';
    const storedApplications = [
      { id: applicationId, status: ApplicationStatus.pending_owner_review },
      { id: acceptedId, status: ApplicationStatus.accepted },
      { id: withdrawnId, status: ApplicationStatus.withdrawn },
    ];
    const storedAudits = [
      { applicationId: acceptedId, action: 'accepted' },
      { applicationId: withdrawnId, action: 'withdrawn' },
    ];
    database.$queryRaw.mockResolvedValue([{ id: applicationId }]);
    database.application.updateMany.mockImplementation(({ where, data }) => {
      const matching = storedApplications.filter(
        (application) =>
          where.id.in.includes(application.id) &&
          application.status === where.status,
      );
      matching.forEach((application) => {
        application.status = data.status;
      });
      return { count: matching.length };
    });
    database.applicationAudit.createMany.mockImplementation(({ data }) => {
      storedAudits.push(
        ...data.map((audit: { application_id: string; action: string }) => ({
          applicationId: audit.application_id,
          action: audit.action,
        })),
      );
      return { count: data.length };
    });

    await service.cancelPendingForRequest({
      contributionRequestId: requestId,
      actorId: ownerId,
      reason: null,
      correlationId: '77777777-7777-4777-8777-777777777777',
      causationAuditId: '88888888-8888-4888-8888-888888888888',
      transaction: database as never,
    });

    expect(storedApplications).toEqual([
      { id: applicationId, status: ApplicationStatus.request_cancelled },
      { id: acceptedId, status: ApplicationStatus.accepted },
      { id: withdrawnId, status: ApplicationStatus.withdrawn },
    ]);
    expect(storedAudits).toEqual([
      { applicationId: acceptedId, action: 'accepted' },
      { applicationId: withdrawnId, action: 'withdrawn' },
      { applicationId, action: 'request_cancelled' },
    ]);
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
      review_reminder_sent_at: null,
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
      ownerDecision: null,
      assignment: null,
      ...overrides,
    };
  }
});
