/**
 * Characterization tests for ApplicationsService (REFACTOR_PLAYBOOK Prompt C).
 *
 * These tests lock what the service does TODAY, including behavior that looks
 * wrong (each such case is marked "preserved as-is"). They exist so the file
 * can be split along the five seams without silent behavior drift: if a moved
 * method changes error class, message, payload, status transition, emitted
 * notification, or DTO shape, a test here fails.
 *
 * Do NOT edit these tests to accommodate a refactor — a failing test here
 * means behavior changed.
 *
 * Baseline before this file (pnpm test:cov --collectCoverageFrom
 * 'src/modules/applications/**'): applications.service.ts 88.58% stmts /
 * 50.94% branch / 94.59% funcs / 92.5% lines.
 */
import {
  ApplicationAuditAction,
  ApplicationStatus,
  ContributionRequestStatus,
  OwnerDecisionType,
  Prisma,
} from '@prisma/client';

import {
  ApplicationError,
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { BlockingSkillDto } from '../eligibility/dto/eligibility.dto';
import { ApplicationsService } from './applications.service';
import { APPLICATION_INCLUDE } from './mappers/application.mapper';
import { ApplicationDailyQuotaService } from './services/application-daily-quota.service';
import {
  ApplicationReplayService,
  applicationCommandFingerprint,
} from './services/application-replay.service';

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
const admin = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  email: 'admin@example.com',
  role: 'admin' as const,
  status: 'active' as const,
};
const requestId = '33333333-3333-4333-8333-333333333333';
const applicationId = '44444444-4444-4444-8444-444444444444';
const siblingId = '99999999-9999-4999-8999-999999999999';
const siblingContributorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const decisionId = '88888888-8888-4888-8888-888888888888';
const assignmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_KEY = '77777777-7777-4777-8777-777777777777';

/**
 * Asserts the full observable error contract — class, message, code, status
 * code, and metadata payload — not just the code. Error identity is the thing
 * most easily lost in a move; every throwing branch gets this treatment.
 */
async function expectApplicationError(
  promise: Promise<unknown>,
  expected: {
    klass: new (...args: never[]) => ApplicationError;
    message: string;
    code: string;
    statusCode: number;
    metadata?: unknown;
  },
): Promise<void> {
  let caught: unknown;
  await promise.then(
    () => {
      throw new Error('expected the call to reject, but it resolved');
    },
    (error: unknown) => {
      caught = error;
    },
  );
  expect(caught).toBeInstanceOf(expected.klass);
  const error = caught as ApplicationError;
  expect(error.message).toBe(expected.message);
  expect(error.code).toBe(expected.code);
  expect(error.statusCode).toBe(expected.statusCode);
  if (expected.metadata !== undefined) {
    expect(error.metadata).toEqual(expected.metadata);
  }
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

describe('ApplicationsService characterization', () => {
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
    usageTracker: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    subscription: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
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
  const eligibility = {
    evaluateForRequest: jest.fn(),
    recordBlocked: jest.fn(),
    blockedError: jest.fn(),
  };
  // The real quota service over the same mocked client, matching the main
  // spec's harness, so submission paths exercise the real lock/tally code.
  const dailyQuota = new ApplicationDailyQuotaService(
    new EntitlementsService(database as never),
    database as never,
  );
  const service = new ApplicationsService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
    eligibility as never,
    identity as never,
    notifications as never,
    contributorProfiles as never,
    dailyQuota,
    new ApplicationReplayService(database as never),
    assignmentConversations as never,
  );

  function requestContext(overrides: Record<string, unknown> = {}) {
    return {
      id: requestId,
      ownerId,
      status: ContributionRequestStatus.published,
      applicationsCloseAt: new Date('2030-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-28T11:00:00.000Z'),
      requirements: [
        { id: 'required-1', kind: 'required', position: 0, text: 'NestJS' },
      ],
      skillRequirements: [
        {
          id: 'skill-required-1',
          skillName: 'NestJS',
          skillNameNormalized: 'nestjs',
          requiredLevel: 'intermediate',
          kind: 'required',
          position: 0,
        },
      ],
      ...overrides,
    };
  }

  function applicationRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: applicationId,
      contribution_request_id: requestId,
      contributor_id: contributor.id,
      contribution_approach: 'I will implement and test the NestJS workflow.',
      proposed_delivery_duration_days: 5,
      status: ApplicationStatus.pending_owner_review,
      submitted_at: new Date('2026-07-28T12:00:00.000Z'),
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

  const expectedApplicationDto = (
    overrides: Record<string, unknown> = {},
  ) => ({
    id: applicationId,
    contributionRequestId: requestId,
    contributor: {
      id: contributor.id,
      username: 'contributor',
      displayName: 'Example Contributor',
    },
    profileContext: {
      bio: 'Backend contributor',
      availability: '10 hours/week',
      experienceLevel: {
        key: 'advanced',
        labelEn: 'Advanced',
        labelAr: 'Advanced',
      },
      fields: [{ key: 'backend', labelEn: 'Backend', labelAr: 'Backend' }],
      declaredSkills: ['NestJS'],
    },
    contributionApproach: 'I will implement and test the NestJS workflow.',
    proposedDeliveryDurationDays: 5,
    status: 'PENDING_OWNER_REVIEW',
    requirementSnapshot: {
      required: [{ id: 'required-1', position: 0, text: 'NestJS' }],
      preferred: [],
    },
    evidenceSummary: [],
    submittedAt: new Date('2026-07-28T12:00:00.000Z'),
    reviewDueAt: new Date('2026-07-31T12:00:00.000Z'),
    expiresAt: new Date('2026-08-04T12:00:00.000Z'),
    expiredAt: null,
    overdue: false,
    ownerDecision: null,
    assignment: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    eligibility.evaluateForRequest.mockResolvedValue({
      outcome: 'eligible',
      blockingSkills: [],
    });
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    contributionTasks.getApplicationSubmissionContext.mockResolvedValue(
      requestContext(),
    );
    contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(
      requestContext(),
    );
    contributionTasks.confirmOwnerDecisionActor.mockResolvedValue(undefined);
    contributionTasks.reconfirmOwnerDecisionActor.mockResolvedValue(undefined);
    contributionTasks.assignFromOwnerDecision.mockResolvedValue(undefined);
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
    database.application.findUnique.mockResolvedValue(null);
    database.application.findFirst.mockResolvedValue(null);
    database.application.findMany.mockResolvedValue([]);
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.application.create.mockResolvedValue(applicationRecord());
    database.application.findUniqueOrThrow.mockResolvedValue(
      applicationRecord(),
    );
    database.applicationRequirementSnapshot.create.mockResolvedValue({});
    database.applicationEvidenceSnapshot.create.mockResolvedValue({});
    database.applicationAudit.create.mockResolvedValue({});
    database.applicationAudit.createMany.mockResolvedValue({ count: 0 });
    database.$queryRaw.mockResolvedValue([]);
    database.$executeRaw.mockResolvedValue(1);
    // Free contributor with nothing spent: one Application available today.
    database.subscription.findFirst.mockResolvedValue(null);
    database.usageTracker.upsert.mockResolvedValue({ count: 0 });
    database.usageTracker.update.mockResolvedValue({ count: 1 });
    database.usageTracker.findUnique.mockResolvedValue(null);
    notifications.createApplicationNotification.mockResolvedValue({
      created: true,
      notification: { notificationId: 'notification-1' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('actor guards (every entry-point guard, exact error contract)', () => {
    it.each([
      {
        label: 'submit with an owner-role actor (role branch)',
        invoke: () =>
          service.submit({
            actor: owner,
            contributionRequestId: requestId,
            contributionApproach: 'I will deliver this request safely.',
            proposedDeliveryDurationDays: 5,
            idempotencyKey: VALID_KEY,
          }),
        message: 'An active contributor account is required',
      },
      {
        label: 'withdraw with a non-active contributor (status branch)',
        invoke: () =>
          service.withdraw({
            actor: { ...contributor, status: 'pending' },
            applicationId,
            idempotencyKey: VALID_KEY,
          }),
        message: 'An active contributor account is required',
      },
      {
        label: 'listForOwner with a contributor actor',
        invoke: () => service.listForOwner(contributor, requestId),
        message: 'An active Project owner account is required',
      },
      {
        label: 'accept with a contributor actor',
        invoke: () =>
          service.accept({
            actor: contributor,
            applicationId,
            idempotencyKey: VALID_KEY,
          }),
        message: 'An active Project owner account is required',
      },
      {
        label: 'decline with a contributor actor',
        invoke: () =>
          service.decline({
            actor: contributor,
            applicationId,
            feedback: 'The test strategy is incomplete.',
            idempotencyKey: VALID_KEY,
          }),
        message: 'An active Project owner account is required',
      },
      {
        label: 'getForActor with an admin actor',
        invoke: () => service.getForActor(admin, applicationId),
        message: 'Application access is not authorized',
      },
      {
        label: 'getOwnerDecisionReportContext with an owner actor',
        invoke: () => service.getOwnerDecisionReportContext(owner, decisionId),
        message: 'An active contributor account is required',
      },
    ])('rejects $label before any data access', async ({ invoke, message }) => {
      await expectApplicationError(invoke(), {
        klass: ForbiddenApplicationError,
        message,
        code: 'APPLICATION_NOT_AUTHORIZED',
        statusCode: 403,
      });
      expect(database.$transaction).not.toHaveBeenCalled();
      expect(database.application.findUnique).not.toHaveBeenCalled();
      expect(database.application.findFirst).not.toHaveBeenCalled();
      expect(database.application.findMany).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it.each(['not-a-uuid', '11111111-1111-1111-1111-111111111111'])(
      'rejects a malformed idempotency key %j before any transaction',
      async (idempotencyKey) => {
        await expectApplicationError(
          service.submit({
            actor: contributor,
            contributionRequestId: requestId,
            contributionApproach: 'I will deliver this request safely.',
            proposedDeliveryDurationDays: 5,
            idempotencyKey,
          }),
          {
            klass: BadRequestApplicationError,
            message: 'Application idempotency key must be a UUID',
            code: 'APPLICATION_IDEMPOTENCY_KEY_INVALID',
            statusCode: 400,
          },
        );
        expect(database.$transaction).not.toHaveBeenCalled();
        expect(database.application.create).not.toHaveBeenCalled();
      },
    );

    it('normalizes a whitespace-wrapped mixed-case key by trimming, preserving case', async () => {
      await service.submit({
        actor: contributor,
        contributionRequestId: requestId,
        contributionApproach: 'I will deliver this request safely.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey: '  AbCdEf01-2345-4cDe-8f90-AbCdEfAbCdEf ',
      });
      expect(database.applicationAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            idempotency_key: 'AbCdEf01-2345-4cDe-8f90-AbCdEfAbCdEf',
          }),
        }),
      );
    });

    it('records the refusal outside the rolled-back transaction and throws the eligibility error verbatim when the skill gate blocks', async () => {
      const blockingSkills = [
        { skillName: 'NestJS', requiredLevel: 'intermediate' },
      ] as BlockingSkillDto[];
      eligibility.evaluateForRequest.mockResolvedValue({
        outcome: 'blocked',
        blockingSkills,
      });
      eligibility.recordBlocked.mockResolvedValue('eligibility-evaluation-1');
      const httpError = new ForbiddenApplicationError(
        'Application cannot be submitted: skill gap',
        'APPLICATION_BLOCKED_SKILL_GAP',
      );
      eligibility.blockedError.mockReturnValue(httpError);

      await expectApplicationError(
        service.submit({
          actor: contributor,
          contributionRequestId: requestId,
          contributionApproach: 'I will deliver this request safely.',
          proposedDeliveryDurationDays: 5,
          idempotencyKey: VALID_KEY,
        }),
        {
          klass: ForbiddenApplicationError,
          message: 'Application cannot be submitted: skill gap',
          code: 'APPLICATION_BLOCKED_SKILL_GAP',
          statusCode: 403,
        },
      );

      // THE GATE runs inside the transaction against the locked context.
      expect(eligibility.evaluateForRequest).toHaveBeenCalledWith({
        contributorId: contributor.id,
        contributionRequestId: requestId,
        requiredSkills: requestContext().skillRequirements,
        transaction: database,
      });
      // The refusal is recorded on a fresh connection after the rollback...
      expect(eligibility.recordBlocked).toHaveBeenCalledWith({
        contributorId: contributor.id,
        contributionRequestId: requestId,
        blockingSkills,
      });
      // ...and the recorded evaluation id is attached to the HTTP error.
      expect(eligibility.blockedError).toHaveBeenCalledWith(
        'APPLICATION_BLOCKED_SKILL_GAP',
        blockingSkills,
        'eligibility-evaluation-1',
      );
      expect(
        eligibility.recordBlocked.mock.invocationCallOrder[0],
      ).toBeLessThan(eligibility.blockedError.mock.invocationCallOrder[0]);
      // A blocked attempt writes nothing and costs no daily slot (DEC-079).
      expect(database.application.create).not.toHaveBeenCalled();
      expect(
        database.applicationRequirementSnapshot.create,
      ).not.toHaveBeenCalled();
      expect(
        database.applicationEvidenceSnapshot.create,
      ).not.toHaveBeenCalled();
      expect(database.applicationAudit.create).not.toHaveBeenCalled();
      expect(database.usageTracker.update).not.toHaveBeenCalled();
      expect(notifications.createApplicationNotification).not.toHaveBeenCalled();
    });

    it('re-checks the locked submission context inside the transaction and refuses a Request that closed between read and lock', async () => {
      contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(
        requestContext({ status: ContributionRequestStatus.cancelled }),
      );

      await expectApplicationError(
        service.submit({
          actor: contributor,
          contributionRequestId: requestId,
          contributionApproach: 'I will deliver this request safely.',
          proposedDeliveryDurationDays: 5,
          idempotencyKey: VALID_KEY,
        }),
        {
          klass: ConflictApplicationError,
          message: 'The Contribution Request was cancelled',
          code: 'REQUEST_CANCELLED',
          statusCode: 409,
        },
      );
      expect(database.application.create).not.toHaveBeenCalled();
      expect(eligibility.evaluateForRequest).not.toHaveBeenCalled();
      expect(database.usageTracker.upsert).not.toHaveBeenCalled();
    });

    it.each([
      {
        recovery: 'replay-found' as const,
        description: 'returns the recorded command result',
      },
      {
        recovery: 'replay-missing' as const,
        description: 'reports the duplicate-application conflict',
      },
    ])('on a P2002 uniqueness race during creation, $description', async ({ recovery }) => {
      database.application.create.mockRejectedValue(p2002());
      const fingerprint = applicationCommandFingerprint({
        action: ApplicationAuditAction.submitted,
        contributionRequestId: requestId,
        contributionApproach: 'I will deliver this request safely.',
        proposedDeliveryDurationDays: 5,
      });
      // Audit reads in order: pre-transaction replay, in-transaction replay,
      // post-race recovery.
      database.applicationAudit.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          recovery === 'replay-found'
            ? { command_fingerprint: fingerprint, application: applicationRecord() }
            : null,
        );

      if (recovery === 'replay-found') {
        await expect(
          service.submit({
            actor: contributor,
            contributionRequestId: requestId,
            contributionApproach: 'I will deliver this request safely.',
            proposedDeliveryDurationDays: 5,
            idempotencyKey: VALID_KEY,
          }),
        ).resolves.toMatchObject({ id: applicationId });
        expect(notifications.createApplicationNotification).toHaveBeenCalledTimes(1);
      } else {
        await expectApplicationError(
          service.submit({
            actor: contributor,
            contributionRequestId: requestId,
            contributionApproach: 'I will deliver this request safely.',
            proposedDeliveryDurationDays: 5,
            idempotencyKey: VALID_KEY,
          }),
          {
            klass: ConflictApplicationError,
            message:
              'An Application already exists for this Contribution Request',
            code: 'ALREADY_APPLIED',
            statusCode: 409,
          },
        );
      }
      // The daily slot is reserved before the Application insert, so the race
      // always happens after reserve ran once.
      expect(database.usageTracker.update).toHaveBeenCalledTimes(1);
    });

    it('returns the in-transaction replay without writing anything when the same command commits first', async () => {
      const fingerprint = applicationCommandFingerprint({
        action: ApplicationAuditAction.submitted,
        contributionRequestId: requestId,
        contributionApproach: 'I will deliver this request safely.',
        proposedDeliveryDurationDays: 5,
      });
      database.applicationAudit.findFirst
        .mockResolvedValueOnce(null) // pre-transaction read: not yet recorded
        .mockResolvedValueOnce({
          command_fingerprint: fingerprint,
          application: applicationRecord(),
        }); // in-transaction read: committed by the concurrent attempt

      const result = await service.submit({
        actor: contributor,
        contributionRequestId: requestId,
        contributionApproach: 'I will deliver this request safely.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey: VALID_KEY,
      });

      expect(result.id).toBe(applicationId);
      expect(database.application.create).not.toHaveBeenCalled();
      expect(
        database.applicationRequirementSnapshot.create,
      ).not.toHaveBeenCalled();
      expect(
        database.applicationEvidenceSnapshot.create,
      ).not.toHaveBeenCalled();
      expect(database.applicationAudit.create).not.toHaveBeenCalled();
      expect(database.usageTracker.update).not.toHaveBeenCalled();
      expect(notifications.createApplicationNotification).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'submitted', userId: ownerId }),
      );
    });

    it('returns the FULL ApplicationDto shape and stamps the review window from submission time', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-28T12:00:01.000Z'));

      const result = await service.submit({
        actor: contributor,
        contributionRequestId: requestId,
        contributionApproach: 'I will implement and test the NestJS workflow.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey: VALID_KEY,
      });

      expect(result).toEqual(expectedApplicationDto());

      // The review window is computed from the transaction's `now`
      // (reminder day 3, expiry day 7), not from fixture dates.
      expect(database.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            submitted_at: new Date('2026-07-28T12:00:01.000Z'),
            review_due_at: new Date('2026-07-31T12:00:01.000Z'),
            expires_at: new Date('2026-08-04T12:00:01.000Z'),
            status: ApplicationStatus.pending_owner_review,
          }),
        }),
      );

      // Audit row: submitted, no from_status, payload version marker.
      expect(database.applicationAudit.create).toHaveBeenCalledWith({
        data: {
          application_id: applicationId,
          actor_id: contributor.id,
          action: ApplicationAuditAction.submitted,
          to_status: ApplicationStatus.pending_owner_review,
          idempotency_key: VALID_KEY,
          command_fingerprint: applicationCommandFingerprint({
            action: ApplicationAuditAction.submitted,
            contributionRequestId: requestId,
            contributionApproach: 'I will implement and test the NestJS workflow.',
            proposedDeliveryDurationDays: 5,
          }),
          metadata: { payloadVersion: 1 },
        },
      });

      // The contributor notification is emitted only after the write.
      expect(notifications.createApplicationNotification).toHaveBeenCalledTimes(1);
      expect(
        database.application.create.mock.invocationCallOrder[0],
      ).toBeLessThan(
        notifications.createApplicationNotification.mock
          .invocationCallOrder[0],
      );
    });
  });

  describe('listAppliedContributionRequestIds', () => {
    it('returns the raw mapped ids in row order, without deduplication', async () => {
      database.application.findMany.mockResolvedValue([
        { contribution_request_id: 'request-a' },
        { contribution_request_id: 'request-b' },
        { contribution_request_id: 'request-a' },
      ]);

      await expect(
        service.listAppliedContributionRequestIds(contributor.id),
      ).resolves.toEqual(['request-a', 'request-b', 'request-a']);
      expect(database.application.findMany).toHaveBeenCalledWith({
        where: { contributor_id: contributor.id },
        select: { contribution_request_id: true },
      });
    });
  });

  describe('listForOwner', () => {
    it('returns the FULL OwnerApplicationsDto in database order with no client-side filtering', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      const secondApplication = applicationRecord({
        id: siblingId,
        contribution_approach: 'A second, different approach.',
        submitted_at: new Date('2026-07-28T13:00:00.000Z'),
        review_due_at: new Date('2026-07-31T13:00:00.000Z'),
        expires_at: new Date('2026-08-04T13:00:00.000Z'),
      });
      database.application.findMany.mockResolvedValue([
        applicationRecord(),
        secondApplication,
      ]);

      const result = await service.listForOwner(owner, requestId);

      expect(result).toEqual({
        applications: [
          expectedApplicationDto(),
          expectedApplicationDto({
            id: siblingId,
            contributionApproach: 'A second, different approach.',
            submittedAt: new Date('2026-07-28T13:00:00.000Z'),
            reviewDueAt: new Date('2026-07-31T13:00:00.000Z'),
            expiresAt: new Date('2026-08-04T13:00:00.000Z'),
          }),
        ],
      });
      // The decision queue is exactly the pending set for this Request,
      // oldest-first then by id; the service adds no filtering of its own.
      expect(database.application.findMany).toHaveBeenCalledWith({
        where: {
          contribution_request_id: requestId,
          status: ApplicationStatus.pending_owner_review,
        },
        orderBy: [{ submitted_at: 'asc' }, { id: 'asc' }],
        include: APPLICATION_INCLUDE,
      });
    });
  });

  describe('getForActor', () => {
    it.each([
      {
        label: 'an unknown Application id',
        setup: () => {
          database.application.findUnique.mockResolvedValue(null);
        },
      },
      {
        label: 'an Application owned by a different contributor (concealed)',
        setup: () => {
          database.application.findUnique.mockResolvedValue(applicationRecord());
        },
      },
    ])(
      'answers APPLICATION_NOT_FOUND for $label — the same error either way',
      async ({ setup }) => {
        setup();
        const stranger = {
          ...contributor,
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        };
        await expectApplicationError(
          service.getForActor(stranger, applicationId),
          {
            klass: NotFoundApplicationError,
            message: 'Application was not found',
            code: 'APPLICATION_NOT_FOUND',
            statusCode: 404,
          },
        );
        // A contributor stranger never reaches the owner confirmation path.
        expect(contributionTasks.confirmOwnerDecisionActor).not.toHaveBeenCalled();
      },
    );

    it('converts a non-APPLICATION_NOT_FOUND NotFound from the ownership check into APPLICATION_NOT_FOUND for an owner', async () => {
      database.application.findUnique.mockResolvedValue(applicationRecord());
      contributionTasks.confirmOwnerDecisionActor.mockRejectedValue(
        new NotFoundApplicationError(
          'Project was not found',
          'CONTRIBUTION_REQUEST_PROJECT_NOT_FOUND',
        ),
      );

      await expectApplicationError(service.getForActor(owner, applicationId), {
        klass: NotFoundApplicationError,
        message: 'Application was not found',
        code: 'APPLICATION_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('propagates a non-NotFound ownership-check error by identity (preserved as-is)', async () => {
      database.application.findUnique.mockResolvedValue(applicationRecord());
      const original = new ConflictApplicationError(
        'Project membership changed',
        'PROJECT_CONFLICT',
      );
      contributionTasks.confirmOwnerDecisionActor.mockRejectedValue(original);

      let caught: unknown;
      await service.getForActor(owner, applicationId).catch((error: unknown) => {
        caught = error;
      });
      expect(caught).toBe(original);
    });
  });

  describe('withdraw', () => {
    it('answers APPLICATION_NOT_FOUND for an unknown or foreign Application', async () => {
      await expectApplicationError(
        service.withdraw({
          actor: contributor,
          applicationId,
          idempotencyKey: VALID_KEY,
        }),
        {
          klass: NotFoundApplicationError,
          message: 'Application was not found',
          code: 'APPLICATION_NOT_FOUND',
          statusCode: 404,
        },
      );
      expect(database.application.updateMany).not.toHaveBeenCalled();
    });

    it('returns an already-withdrawn Application unchanged but STILL emits the withdrawal notification (preserved as-is)', async () => {
      database.application.findFirst.mockResolvedValue(
        applicationRecord({ status: ApplicationStatus.withdrawn }),
      );

      const result = await service.withdraw({
        actor: contributor,
        applicationId,
        idempotencyKey: VALID_KEY,
      });

      expect(result).toEqual(
        expectedApplicationDto({ status: 'WITHDRAWN' }),
      );
      expect(database.application.updateMany).not.toHaveBeenCalled();
      expect(database.applicationAudit.create).not.toHaveBeenCalled();
      // Repeat withdrawal re-notifies the owner — looks wrong, locked anyway.
      expect(notifications.createApplicationNotification).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'withdrawn', userId: ownerId }),
      );
    });

    it.each([
      {
        trigger: 'a P2002 uniqueness violation on the audit write',
        fail: () => {
          database.applicationAudit.create.mockRejectedValue(p2002());
        },
      },
      {
        trigger: 'a concurrent status change (updateMany count 0)',
        fail: () => {
          database.application.updateMany.mockResolvedValue({ count: 0 });
        },
      },
    ])(
      'without an idempotency key, $trigger propagates with no replay lookup',
      async ({ fail }) => {
        database.application.findFirst.mockResolvedValue(applicationRecord());
        fail();
        await expect(
          service.withdraw({ actor: contributor, applicationId }),
        ).rejects.toBeTruthy();
        // No key means readReplay returns before touching the audit table.
        expect(database.applicationAudit.findFirst).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        trigger: 'a P2002 uniqueness violation',
        rethrown: 'prisma' as const,
        fail: () => {
          database.applicationAudit.create.mockRejectedValue(p2002());
        },
        recovery: 'replay-found' as const,
      },
      {
        trigger: 'a P2002 uniqueness violation',
        rethrown: 'prisma' as const,
        fail: () => {
          database.applicationAudit.create.mockRejectedValue(p2002());
        },
        recovery: 'replay-missing' as const,
      },
      {
        trigger: 'a concurrent status change',
        rethrown: 'conflict' as const,
        fail: () => {
          database.application.updateMany.mockResolvedValue({ count: 0 });
        },
        recovery: 'replay-found' as const,
      },
      {
        trigger: 'a concurrent status change',
        rethrown: 'conflict' as const,
        fail: () => {
          database.application.updateMany.mockResolvedValue({ count: 0 });
        },
        recovery: 'replay-missing' as const,
      },
    ])(
      'with an idempotency key, $trigger plus $recovery',
      async ({ fail, recovery, rethrown }) => {
        database.application.findFirst.mockResolvedValue(applicationRecord());
        fail();
        const fingerprint = applicationCommandFingerprint({
          action: ApplicationAuditAction.withdrawn,
          applicationId,
        });
        // Audit reads in order: pre-transaction replay, post-failure recovery.
        database.applicationAudit.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(
            recovery === 'replay-found'
              ? {
                  command_fingerprint: fingerprint,
                  application: applicationRecord({
                    status: ApplicationStatus.withdrawn,
                  }),
                }
              : null,
          );

        const call = service.withdraw({
          actor: contributor,
          applicationId,
          idempotencyKey: VALID_KEY,
        });
        if (recovery === 'replay-found') {
          await expect(call).resolves.toMatchObject({
            id: applicationId,
            status: 'WITHDRAWN',
          });
        } else if (rethrown === 'prisma') {
          // Preserved as-is: an unrecoverable uniqueness race escapes as the
          // raw Prisma error, not a service error.
          let caught: unknown;
          await call.catch((error: unknown) => {
            caught = error;
          });
          expect(caught).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
          expect((caught as Prisma.PrismaClientKnownRequestError).code).toBe(
            'P2002',
          );
        } else {
          await expectApplicationError(call, {
            klass: ConflictApplicationError,
            message: 'Application changed during withdrawal',
            code: 'APPLICATION_CONCURRENT_MODIFICATION',
            statusCode: 409,
          });
        }
      },
    );

    it('returns the recorded withdrawal without a transaction when the outer replay hits', async () => {
      database.applicationAudit.findFirst.mockResolvedValue({
        command_fingerprint: applicationCommandFingerprint({
          action: ApplicationAuditAction.withdrawn,
          applicationId,
        }),
        application: applicationRecord({ status: ApplicationStatus.withdrawn }),
      });

      await expect(
        service.withdraw({
          actor: contributor,
          applicationId,
          idempotencyKey: VALID_KEY,
        }),
      ).resolves.toMatchObject({ id: applicationId, status: 'WITHDRAWN' });
      expect(database.$transaction).not.toHaveBeenCalled();
      expect(notifications.createApplicationNotification).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'withdrawn', userId: ownerId }),
      );
    });
  });

  describe('owner-decision idempotency-key policy (accept and decline)', () => {
    it.each([
      { command: 'accept', key: undefined },
      { command: 'accept', key: '' },
      { command: 'accept', key: 'not-a-uuid' },
      { command: 'decline', key: undefined },
      { command: 'decline', key: '' },
      { command: 'decline', key: 'not-a-uuid' },
    ])(
      '$command rejects key "$key" before any transaction with the exact policy error',
      async ({ command, key }) => {
        const expected =
          key === 'not-a-uuid'
            ? {
                message: 'Application idempotency key must be a UUID',
                code: 'APPLICATION_IDEMPOTENCY_KEY_INVALID',
              }
            : {
                message: 'Idempotency-Key is required for an Owner Decision',
                code: 'APPLICATION_IDEMPOTENCY_KEY_REQUIRED',
              };
        const call =
          command === 'accept'
            ? service.accept({ actor: owner, applicationId, idempotencyKey: key })
            : service.decline({
                actor: owner,
                applicationId,
                feedback: 'The test strategy is incomplete.',
                idempotencyKey: key,
              });
        await expectApplicationError(call, {
          klass: BadRequestApplicationError,
          ...expected,
          statusCode: 400,
        });
        expect(database.$transaction).not.toHaveBeenCalled();
      },
    );
  });

  describe('accept and decline shared guards', () => {
    it.each(['accept', 'decline'] as const)(
      '%s answers APPLICATION_NOT_FOUND for an unknown Application',
      async (command) => {
        database.application.findFirst.mockResolvedValue(null);
        const call =
          command === 'accept'
            ? service.accept({ actor: owner, applicationId, idempotencyKey: VALID_KEY })
            : service.decline({
                actor: owner,
                applicationId,
                feedback: 'The test strategy is incomplete.',
                idempotencyKey: VALID_KEY,
              });
        await expectApplicationError(call, {
          klass: NotFoundApplicationError,
          message: 'Application was not found',
          code: 'APPLICATION_NOT_FOUND',
          statusCode: 404,
        });
        expect(contributionTasks.reconfirmOwnerDecisionActor).not.toHaveBeenCalled();
      },
    );

    it.each(['accept', 'decline'] as const)(
      '%s converts a foreign NotFound code from the in-transaction owner reconfirmation into APPLICATION_NOT_FOUND',
      async (command) => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
        database.application.findFirst.mockResolvedValue(applicationRecord());
        contributionTasks.reconfirmOwnerDecisionActor.mockRejectedValue(
          new NotFoundApplicationError(
            'Project was not found',
            'CONTRIBUTION_REQUEST_PROJECT_NOT_FOUND',
          ),
        );
        const call =
          command === 'accept'
            ? service.accept({ actor: owner, applicationId, idempotencyKey: VALID_KEY })
            : service.decline({
                actor: owner,
                applicationId,
                feedback: 'The test strategy is incomplete.',
                idempotencyKey: VALID_KEY,
              });
        await expectApplicationError(call, {
          klass: NotFoundApplicationError,
          message: 'Application was not found',
          code: 'APPLICATION_NOT_FOUND',
          statusCode: 404,
        });
        expect(database.ownerDecision.create).not.toHaveBeenCalled();
      },
    );

    it.each(['accept', 'decline'] as const)(
      '%s propagates a non-NotFound reconfirmation error by identity',
      async (command) => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
        database.application.findFirst.mockResolvedValue(applicationRecord());
        const original = new ConflictApplicationError(
          'Contribution Request changed',
          'REQUEST_TERMINAL',
        );
        contributionTasks.reconfirmOwnerDecisionActor.mockRejectedValue(original);
        const call =
          command === 'accept'
            ? service.accept({ actor: owner, applicationId, idempotencyKey: VALID_KEY })
            : service.decline({
                actor: owner,
                applicationId,
                feedback: 'The test strategy is incomplete.',
                idempotencyKey: VALID_KEY,
              });
        let caught: unknown;
        await call.catch((error: unknown) => {
          caught = error;
        });
        // Identity, not just equality: the caller must see this exact error.
        expect(caught).toBe(original);
      },
    );
  });

  describe('accept', () => {
    it('rejects an Application with no proposed delivery duration with the exact conflict', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      database.application.findFirst.mockResolvedValue(
        applicationRecord({ proposed_delivery_duration_days: null }),
      );

      await expectApplicationError(
        service.accept({ actor: owner, applicationId, idempotencyKey: VALID_KEY }),
        {
          klass: ConflictApplicationError,
          message: 'The Application has no Proposed Delivery Duration',
          code: 'APPLICATION_DELIVERY_DURATION_MISSING',
          statusCode: 409,
        },
      );
      expect(contributionTasks.assignFromOwnerDecision).not.toHaveBeenCalled();
      expect(database.ownerDecision.create).not.toHaveBeenCalled();
    });

    it('throws the concurrent-decision conflict when the FOR UPDATE lock set no longer contains the Application', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      database.application.findFirst.mockResolvedValue(applicationRecord());
      // The locked pending set contains only the sibling: `current` vanished.
      database.$queryRaw.mockResolvedValue([
        { id: siblingId, contributor_id: siblingContributorId },
      ]);

      await expectApplicationError(
        service.accept({ actor: owner, applicationId, idempotencyKey: VALID_KEY }),
        {
          klass: ConflictApplicationError,
          message: 'Application changed during the Owner Decision',
          code: 'APPLICATION_CONCURRENT_MODIFICATION',
          statusCode: 409,
        },
      );
      // The Request assignment step runs before the lock probe.
      expect(contributionTasks.assignFromOwnerDecision).toHaveBeenCalledTimes(1);
      expect(database.ownerDecision.create).not.toHaveBeenCalled();
      expect(database.application.updateMany).not.toHaveBeenCalled();
    });

    it('throws the concurrent-decision conflict when the accepted updateMany reports count 0', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      database.application.findFirst.mockResolvedValue(applicationRecord());
      database.$queryRaw.mockResolvedValue([
        { id: applicationId, contributor_id: contributor.id },
      ]);
      database.application.updateMany.mockResolvedValue({ count: 0 });

      await expectApplicationError(
        service.accept({ actor: owner, applicationId, idempotencyKey: VALID_KEY }),
        {
          klass: ConflictApplicationError,
          message: 'Application changed during the Owner Decision',
          code: 'APPLICATION_CONCURRENT_MODIFICATION',
          statusCode: 409,
        },
      );
      // The decision row was written inside the (rolled back) transaction
      // before the guard tripped; the Assignment and audit were not.
      expect(database.ownerDecision.create).toHaveBeenCalledTimes(1);
      expect(database.assignment.create).not.toHaveBeenCalled();
      expect(database.applicationAudit.create).not.toHaveBeenCalled();
    });

    it('throws the concurrent-decision conflict when a sibling escapes the closing updateMany', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      database.application.findFirst.mockResolvedValue(applicationRecord());
      database.$queryRaw.mockResolvedValue([
        { id: applicationId, contributor_id: contributor.id },
        { id: siblingId, contributor_id: siblingContributorId },
      ]);
      database.application.updateMany
        .mockResolvedValueOnce({ count: 1 }) // accepted
        .mockResolvedValueOnce({ count: 0 }); // siblings closed: one escaped

      await expectApplicationError(
        service.accept({ actor: owner, applicationId, idempotencyKey: VALID_KEY }),
        {
          klass: ConflictApplicationError,
          message: 'Application changed during the Owner Decision',
          code: 'APPLICATION_CONCURRENT_MODIFICATION',
          statusCode: 409,
        },
      );
      // Sibling audits are only written after the count check passes.
      expect(database.applicationAudit.createMany).not.toHaveBeenCalled();
      // The race resolver re-reads the replay table after the in-transaction
      // replay read: two findUnique calls in total.
      expect(database.ownerDecision.findUnique).toHaveBeenCalledTimes(2);
    });

    it('returns the FULL OwnerDecisionResultDto and emits notifications only after commit', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      const decidedAt = new Date('2026-07-29T12:00:00.000Z');
      const assignmentRecord = {
        id: assignmentId,
        contribution_request_id: requestId,
        application_id: applicationId,
        owner_decision_id: decisionId,
        contributor_id: contributor.id,
        agreed_delivery_duration_days: 5,
        agreed_delivery_due_at: new Date('2026-08-03T12:00:00.000Z'),
        assigned_at: decidedAt,
      };
      database.application.findFirst.mockResolvedValue(applicationRecord());
      database.$queryRaw.mockResolvedValue([
        { id: applicationId, contributor_id: contributor.id },
      ]);
      database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
        id: decisionId,
        application_id: applicationId,
        contribution_request_id: requestId,
        owner_id: ownerId,
        decision_type: OwnerDecisionType.accepted,
        feedback: null,
        idempotency_key: VALID_KEY,
        command_fingerprint: 'fingerprint',
        decided_at: decidedAt,
        application: applicationRecord({
          status: ApplicationStatus.accepted,
          owner_reviewed_at: decidedAt,
          assignment: assignmentRecord,
        }),
        assignment: assignmentRecord,
      });

      const result = await service.accept({
        actor: owner,
        applicationId,
        idempotencyKey: VALID_KEY,
      });

      expect(result).toEqual({
        application: expectedApplicationDto({
          status: 'ACCEPTED',
          assignment: {
            id: assignmentId,
            contributionRequestId: requestId,
            applicationId,
            ownerDecisionId: decisionId,
            contributorId: contributor.id,
            agreedDeliveryDurationDays: 5,
            agreedDeliveryDueDate: new Date('2026-08-03T12:00:00.000Z'),
            assignedAt: decidedAt,
          },
        }),
        ownerDecision: {
          id: decisionId,
          applicationId,
          contributionRequestId: requestId,
          decisionType: 'ACCEPTED',
          feedback: null,
          decidedAt,
        },
        assignment: {
          id: assignmentId,
          contributionRequestId: requestId,
          applicationId,
          ownerDecisionId: decisionId,
          contributorId: contributor.id,
          agreedDeliveryDurationDays: 5,
          agreedDeliveryDueDate: new Date('2026-08-03T12:00:00.000Z'),
          assignedAt: decidedAt,
        },
      });

      // The agreed due date is now + proposed duration (pinned clock).
      expect(database.assignment.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String),
          contribution_request_id: requestId,
          application_id: applicationId,
          owner_decision_id: expect.any(String),
          contributor_id: contributor.id,
          agreed_delivery_duration_days: 5,
          agreed_delivery_due_at: new Date('2026-08-03T12:00:00.000Z'),
          assigned_at: decidedAt,
        },
      });

      // The audit metadata names the decision and assignment it caused.
      const createdDecisionId =
        database.ownerDecision.create.mock.calls[0][0].data.id;
      const createdAssignmentId =
        database.assignment.create.mock.calls[0][0].data.id;
      expect(database.applicationAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: ApplicationAuditAction.accepted,
          from_status: ApplicationStatus.pending_owner_review,
          to_status: ApplicationStatus.accepted,
          metadata: {
            payloadVersion: 1,
            ownerDecisionId: createdDecisionId,
            assignmentId: createdAssignmentId,
          },
        }),
      });

      // Realtime emission happens after the transaction, never inside it.
      expect(notifications.emitApplicationNotifications).toHaveBeenCalledTimes(1);
      expect(
        database.ownerDecision.findUniqueOrThrow.mock.invocationCallOrder[0],
      ).toBeLessThan(
        notifications.emitApplicationNotifications.mock.invocationCallOrder[0],
      );
    });

    it('notifies the accepted contributor first, then not_selected siblings in lock order, and emits both after commit', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      database.application.findFirst.mockResolvedValue(applicationRecord());
      database.$queryRaw.mockResolvedValue([
        { id: applicationId, contributor_id: contributor.id },
        { id: siblingId, contributor_id: siblingContributorId },
      ]);
      database.application.updateMany.mockResolvedValue({ count: 1 });
      notifications.createApplicationNotification
        .mockResolvedValueOnce({
          created: true,
          notification: { notificationId: 'notification-accepted' },
        })
        .mockResolvedValueOnce({
          created: true,
          notification: { notificationId: 'notification-sibling' },
        });
      database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
        id: decisionId,
        application_id: applicationId,
        contribution_request_id: requestId,
        owner_id: ownerId,
        decision_type: OwnerDecisionType.accepted,
        feedback: null,
        idempotency_key: VALID_KEY,
        command_fingerprint: 'fingerprint',
        decided_at: new Date('2026-07-29T12:00:00.000Z'),
        application: applicationRecord({ status: ApplicationStatus.accepted }),
        assignment: null,
      });

      await service.accept({
        actor: owner,
        applicationId,
        idempotencyKey: VALID_KEY,
      });

      expect(notifications.createApplicationNotification).toHaveBeenNthCalledWith(
        1,
        {
          userId: contributor.id,
          applicationId,
          contributionRequestId: requestId,
          action: 'accepted',
        },
        { transaction: database, emitRealtime: false },
      );
      expect(notifications.createApplicationNotification).toHaveBeenNthCalledWith(
        2,
        {
          userId: siblingContributorId,
          applicationId: siblingId,
          contributionRequestId: requestId,
          action: 'not_selected',
        },
        { transaction: database, emitRealtime: false },
      );
      // Emission order matches creation order, and happens only after both
      // were created inside the transaction.
      expect(notifications.emitApplicationNotifications).toHaveBeenCalledWith([
        { notificationId: 'notification-accepted' },
        { notificationId: 'notification-sibling' },
      ]);
      const [firstCreate, secondCreate] =
        notifications.createApplicationNotification.mock.invocationCallOrder;
      expect(firstCreate).toBeLessThan(secondCreate);
      expect(secondCreate).toBeLessThan(
        notifications.emitApplicationNotifications.mock.invocationCallOrder[0],
      );
    });
  });

  describe('decline', () => {
    it('rethrows the original conflict when the status update loses the race and no replay exists', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      database.application.findFirst.mockResolvedValue(applicationRecord());
      database.application.updateMany.mockResolvedValue({ count: 0 });

      await expectApplicationError(
        service.decline({
          actor: owner,
          applicationId,
          feedback: 'The test strategy is incomplete.',
          idempotencyKey: VALID_KEY,
        }),
        {
          klass: ConflictApplicationError,
          message: 'Application changed during the Owner Decision',
          code: 'APPLICATION_CONCURRENT_MODIFICATION',
          statusCode: 409,
        },
      );
      // The decision row was attempted inside the transaction; the audit row
      // and notification were never reached.
      expect(database.ownerDecision.create).toHaveBeenCalledTimes(1);
      expect(database.applicationAudit.create).not.toHaveBeenCalled();
      expect(notifications.createApplicationNotification).not.toHaveBeenCalled();
      // In-transaction replay read + race-resolver read: two findUnique calls.
      expect(database.ownerDecision.findUnique).toHaveBeenCalledTimes(2);
    });

    it('still resolves and emits an EMPTY realtime batch when the notification already existed', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      database.application.findFirst.mockResolvedValue(applicationRecord());
      notifications.createApplicationNotification.mockResolvedValue({
        created: false,
      });
      database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
        id: decisionId,
        application_id: applicationId,
        contribution_request_id: requestId,
        owner_id: ownerId,
        decision_type: OwnerDecisionType.declined,
        feedback: 'The test strategy is incomplete.',
        idempotency_key: VALID_KEY,
        command_fingerprint: 'fingerprint',
        decided_at: new Date('2026-07-29T12:00:00.000Z'),
        application: applicationRecord({
          status: ApplicationStatus.declined_by_owner,
        }),
        assignment: null,
      });

      await expect(
        service.decline({
          actor: owner,
          applicationId,
          feedback: 'The test strategy is incomplete.',
          idempotencyKey: VALID_KEY,
        }),
      ).resolves.toMatchObject({
        ownerDecision: { id: decisionId, decisionType: 'DECLINED' },
        assignment: null,
      });
      expect(notifications.emitApplicationNotifications).toHaveBeenCalledWith([]);
    });

    it('returns the FULL OwnerDecisionResultDto, trimming feedback once for the row, the fingerprint, and the audit', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
      const decidedAt = new Date('2026-07-29T12:00:00.000Z');
      const trimmedFeedback =
        'The proposed approach does not address testing.';
      const fingerprint = applicationCommandFingerprint({
        action: OwnerDecisionType.declined,
        applicationId,
        feedback: trimmedFeedback,
      });
      database.application.findFirst.mockResolvedValue(applicationRecord());
      database.ownerDecision.findUniqueOrThrow.mockResolvedValue({
        id: decisionId,
        application_id: applicationId,
        contribution_request_id: requestId,
        owner_id: ownerId,
        decision_type: OwnerDecisionType.declined,
        feedback: trimmedFeedback,
        idempotency_key: VALID_KEY,
        command_fingerprint: 'fingerprint',
        decided_at: decidedAt,
        application: applicationRecord({
          status: ApplicationStatus.declined_by_owner,
        }),
        assignment: null,
      });

      const result = await service.decline({
        actor: owner,
        applicationId,
        feedback: `  ${trimmedFeedback}  `,
        idempotencyKey: VALID_KEY,
      });

      // FULL shape: application.ownerDecision/assignment come from the
      // include fixture (null here), matching the accept-test convention.
      expect(result).toEqual({
        application: expectedApplicationDto({
          status: 'DECLINED_BY_OWNER',
        }),
        ownerDecision: {
          id: decisionId,
          applicationId,
          contributionRequestId: requestId,
          decisionType: 'DECLINED',
          feedback: trimmedFeedback,
          decidedAt,
        },
        assignment: null,
      });

      expect(database.ownerDecision.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String),
          application_id: applicationId,
          contribution_request_id: requestId,
          owner_id: ownerId,
          decision_type: OwnerDecisionType.declined,
          feedback: trimmedFeedback,
          idempotency_key: VALID_KEY,
          command_fingerprint: fingerprint,
          decided_at: decidedAt,
        },
      });
      const createdDecisionId =
        database.ownerDecision.create.mock.calls[0][0].data.id;
      expect(database.applicationAudit.create).toHaveBeenCalledWith({
        data: {
          application_id: applicationId,
          actor_id: ownerId,
          action: ApplicationAuditAction.declined_by_owner,
          from_status: ApplicationStatus.pending_owner_review,
          to_status: ApplicationStatus.declined_by_owner,
          idempotency_key: VALID_KEY,
          command_fingerprint: fingerprint,
          metadata: { payloadVersion: 1, ownerDecisionId: createdDecisionId },
        },
      });
      // The declined contributor's notification is created inside the
      // transaction and emitted only after commit.
      expect(notifications.createApplicationNotification).toHaveBeenCalledWith(
        {
          userId: contributor.id,
          applicationId,
          contributionRequestId: requestId,
          action: 'declined_by_owner',
        },
        { transaction: database, emitRealtime: false },
      );
      expect(
        notifications.emitApplicationNotifications,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOwnerDecisionReportContext', () => {
    it('answers OWNER_DECISION_NOT_FOUND when the decision exists but carries no feedback', async () => {
      database.ownerDecision.findFirst.mockResolvedValue({
        id: decisionId,
        application_id: applicationId,
        contribution_request_id: requestId,
        owner_id: ownerId,
        feedback: null,
        application: { contributor_id: contributor.id },
      });

      await expectApplicationError(
        service.getOwnerDecisionReportContext(contributor, decisionId),
        {
          klass: NotFoundApplicationError,
          message: 'Owner Decision was not found',
          code: 'OWNER_DECISION_NOT_FOUND',
          statusCode: 404,
        },
      );
    });
  });

  describe('summarizePendingByContributionRequests', () => {
    it('deduplicates Request ids across scopes before grouping and sums per scope', async () => {
      database.application.groupBy.mockResolvedValue([
        { contribution_request_id: 'request-1', _count: { _all: 2 } },
        { contribution_request_id: 'request-2', _count: { _all: 1 } },
      ]);

      await expect(
        service.summarizePendingByContributionRequests({
          requestScopes: [
            {
              projectId: 'project-1',
              contributionRequestIds: ['request-1', 'request-2'],
            },
            { projectId: 'project-2', contributionRequestIds: ['request-1'] },
          ],
        }),
      ).resolves.toEqual({
        projects: [
          { projectId: 'project-1', pendingApplicationCount: 3 },
          { projectId: 'project-2', pendingApplicationCount: 2 },
        ],
      });
      // The id set is deduplicated in first-appearance order.
      expect(database.application.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contribution_request_id: { in: ['request-1', 'request-2'] },
          }),
        }),
      );
    });
  });

  describe('cancelPendingForRequest', () => {
    it('returns an empty result without touching Applications when nothing is pending', async () => {
      database.$queryRaw.mockResolvedValue([]);

      await expect(
        service.cancelPendingForRequest({
          contributionRequestId: requestId,
          actorId: ownerId,
          reason: 'Project priorities changed',
          correlationId: VALID_KEY,
          causationAuditId: decisionId,
          transaction: database as never,
        }),
      ).resolves.toEqual({ cancelledApplicationIds: [] });
      expect(database.application.updateMany).not.toHaveBeenCalled();
      expect(database.applicationAudit.createMany).not.toHaveBeenCalled();
    });
  });
});
