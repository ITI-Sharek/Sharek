import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { AssignmentCallsService } from './assignment-calls.service';

const CALLER_ID = '11111111-1111-4111-8111-111111111111';
const CALLEE_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const CALL_ID = '55555555-5555-4555-8555-555555555555';
const IDEMPOTENCY_KEY = '66666666-6666-4666-8666-666666666666';
const EVENT_ID = '77777777-7777-4777-8777-777777777777';

const caller: AuthenticatedUser = {
  id: CALLER_ID,
  email: 'caller@example.com',
  role: 'owner',
  status: 'active',
};
const callee: AuthenticatedUser = {
  id: CALLEE_ID,
  email: 'callee@example.com',
  role: 'contributor',
  status: 'active',
};

/**
 * `target` is a field-name array, matching what Prisma actually reports for
 * a P2002 (verified against a real Postgres run, including for a raw index
 * declared only in migration SQL, never in schema.prisma) -- never the
 * constraint/index name.
 */
function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
  (error as unknown as { meta: { target: string[] } }).meta = { target };
  return error;
}

function callRecord(overrides: Partial<{
  outcome: string;
  started_at: Date;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number | null;
  end_reason: string | null;
  aggregate_version: number;
}> = {}) {
  return {
    id: CALL_ID,
    conversation_id: CONVERSATION_ID,
    caller_id: CALLER_ID,
    callee_id: CALLEE_ID,
    outcome: 'ringing',
    started_at: new Date('2026-08-22T12:00:00.000Z'),
    answered_at: null,
    ended_at: null,
    duration_seconds: null,
    end_reason: null,
    aggregate_version: 1,
    caller: { first_name: 'Cal', last_name: 'Ler' },
    callee: { first_name: 'Cal', last_name: 'Lee' },
    ...overrides,
  };
}

function harness(configOverrides: Record<string, unknown> = {}) {
  const configValues: Record<string, unknown> = {
    ASSIGNMENT_CALLS_ENABLED: true,
    ASSIGNMENT_CALL_MAX_DURATION_MS: 3_600_000,
    ...configOverrides,
  };
  const shared = {
    assignmentCall: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    assignmentCallParticipation: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    assignmentCallEvent: {
      create: jest.fn().mockResolvedValue({ id: EVENT_ID }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    notificationPreference: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const database = {
    ...shared,
    $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback(shared),
    ),
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) =>
      key in configValues ? configValues[key] : fallback,
    ),
  };
  const conversations = {
    getParticipation: jest.fn().mockResolvedValue({
      status: 'active',
      peerId: CALLEE_ID,
    }),
  };
  const ice = {
    mintJoinCredentials: jest.fn().mockReturnValue({
      iceServers: [],
      expiresAt: new Date('2026-08-22T12:05:00.000Z'),
      maxDurationSeconds: 3_600,
    }),
  };
  const queue = {
    armRingTimeout: jest.fn().mockResolvedValue(undefined),
    cancelRingTimeout: jest.fn().mockResolvedValue(undefined),
    armDurationTimers: jest.fn().mockResolvedValue(undefined),
    cancelDurationTimers: jest.fn().mockResolvedValue(undefined),
    cancelReconnectGrace: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = {
    publishRinging: jest.fn().mockResolvedValue(true),
    publishAnswered: jest.fn().mockResolvedValue(true),
    publishDeclined: jest.fn().mockResolvedValue(true),
    publishEnded: jest.fn().mockResolvedValue(true),
  };
  const capacity = { isExhausted: jest.fn().mockResolvedValue(false) };
  const authorization = { invalidate: jest.fn() };

  const service = new AssignmentCallsService(
    database as never,
    config as never,
    conversations as never,
    ice as never,
    queue as never,
    realtime as never,
    capacity as never,
    authorization as never,
  );

  return { service, database, config, conversations, ice, queue, realtime, capacity, authorization };
}

describe('AssignmentCallsService', () => {
  describe('start', () => {
    it('creates a ringing call, two active participations, and an outbox event with aggregate_version 1', async () => {
      const { service, database, queue, realtime } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(null);
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(callRecord());

      const result = await service.start({
        actor: caller,
        conversationId: CONVERSATION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      });

      expect(database.assignmentCall.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversation_id: CONVERSATION_ID,
            caller_id: CALLER_ID,
            callee_id: CALLEE_ID,
            outcome: 'ringing',
          }),
        }),
      );
      expect(database.assignmentCallParticipation.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ user_id: CALLER_ID, role: 'caller', active: true }),
          expect.objectContaining({ user_id: CALLEE_ID, role: 'callee', active: true }),
        ],
      });
      expect(database.assignmentCallEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          event_type: 'ringing',
          aggregate_version: 1,
          command_idempotency_key: IDEMPOTENCY_KEY,
        }),
      });
      expect(result.call.outcome).toBe('RINGING');
      expect(queue.armRingTimeout).toHaveBeenCalledWith(CALL_ID);
      expect(realtime.publishRinging).toHaveBeenCalledWith(EVENT_ID);
    });

    it('maps a P2002 on the partial unique index to ASSIGNMENT_CALL_PARTICIPANT_BUSY', async () => {
      // `target: ['user_id']` is the real shape Prisma reports for this raw,
      // migration-only partial index -- verified against a real Postgres run
      // (scripts/test-assignment-call-concurrency.ts). An earlier version of
      // this test used the constraint name as the mocked target, which
      // matched the (buggy) implementation without proving anything about
      // real behavior; `mapStartError` now matches on the field array
      // instead of a constraint-name substring, which is the only way this
      // ever actually fires against a live database.
      const { service, database } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(null);
      database.assignmentCallParticipation.createMany.mockRejectedValue(
        p2002(['user_id']),
      );

      await expect(
        service.start({
          actor: caller,
          conversationId: CONVERSATION_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_PARTICIPANT_BUSY', statusCode: 409 });
    });

    it('does not mistake the [call_id, user_id] participation-row conflict for a busy-user conflict', async () => {
      // A different unique constraint (AssignmentCallParticipation's own
      // [call_id, user_id]) also touches `user_id`, but its target is a
      // two-field array. Only the single-field ['user_id'] target -- unique
      // to the partial "one active call" index -- means "this user is busy".
      const { service, database } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(null);
      const error = p2002(['call_id', 'user_id']);
      database.assignmentCallParticipation.createMany.mockRejectedValue(error);

      await expect(
        service.start({
          actor: caller,
          conversationId: CONVERSATION_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ).rejects.toBe(error);
    });

    it('rejects starting a call in a read-only conversation', async () => {
      const { service, conversations, database } = harness();
      conversations.getParticipation.mockResolvedValue({ status: 'read_only', peerId: CALLEE_ID });

      await expect(
        service.start({
          actor: caller,
          conversationId: CONVERSATION_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_CONVERSATION_READ_ONLY' });
      expect(database.$transaction).not.toHaveBeenCalled();
    });

    it('rejects starting a call when TURN capacity is exhausted', async () => {
      const { service, capacity, database } = harness();
      capacity.isExhausted.mockResolvedValue(true);

      await expect(
        service.start({
          actor: caller,
          conversationId: CONVERSATION_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ).rejects.toMatchObject({
        code: 'ASSIGNMENT_CALL_FREE_CAPACITY_EXHAUSTED',
        statusCode: 503,
      });
      expect(database.$transaction).not.toHaveBeenCalled();
    });

    it('rejects starting a call during the callee quiet hours window, creating no row', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
      try {
        const { service, database } = harness();
        database.notificationPreference.findUnique.mockResolvedValue({
          quiet_hours_enabled: true,
          // UTC hour/minute fields stand in for local time-of-day; 00:00 to
          // 23:59 covers this frozen "now" (12:00) with no timezone maths.
          quiet_start_local: new Date('1970-01-01T00:00:00.000Z'),
          quiet_end_local: new Date('1970-01-01T23:59:00.000Z'),
          quiet_timezone: 'UTC',
        });

        await expect(
          service.start({
            actor: caller,
            conversationId: CONVERSATION_ID,
            idempotencyKey: IDEMPOTENCY_KEY,
          }),
        ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_QUIET_HOURS' });
        // Same "Participant unavailable" shape a busy peer would produce --
        // no row created, no hint that quiet hours specifically were why.
        expect(database.$transaction).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('replays an idempotent start and returns the same call without re-creating it', async () => {
      const { service, database, queue, realtime } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(callRecord());

      const result = await service.start({
        actor: caller,
        conversationId: CONVERSATION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      });

      expect(database.assignmentCall.create).not.toHaveBeenCalled();
      expect(result.call.callId).toBe(CALL_ID);
      // No new ringing event was created, so nothing is re-armed or re-published.
      expect(queue.armRingTimeout).not.toHaveBeenCalled();
      expect(realtime.publishRinging).not.toHaveBeenCalled();
    });

    it('rejects a replay of the same idempotency key against a different conversationId', async () => {
      const { service, database } = harness();
      // Same idempotency key was already used, but for a different conversationId.
      database.assignmentCall.findUnique.mockResolvedValue({
        ...callRecord(),
        conversation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });

      await expect(
        service.start({
          actor: caller,
          conversationId: CONVERSATION_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_IDEMPOTENCY_CONFLICT' });
      expect(database.assignmentCall.create).not.toHaveBeenCalled();
    });

    it('refuses to start a call while the feature flag is disabled', async () => {
      const { service, conversations } = harness({ ASSIGNMENT_CALLS_ENABLED: false });

      await expect(
        service.start({
          actor: caller,
          conversationId: CONVERSATION_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_DISABLED', statusCode: 403 });
      expect(conversations.getParticipation).not.toHaveBeenCalled();
    });
  });

  describe('answer', () => {
    it('succeeds only from ringing, by the callee, cancelling the ring timer and arming duration timers', async () => {
      const { service, database, queue, realtime, authorization } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(callRecord({ aggregate_version: 1 }));
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'answered', answered_at: new Date(), aggregate_version: 2 }),
      );

      const result = await service.answer({
        actor: callee,
        callId: CALL_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      });

      expect(result.call.outcome).toBe('ANSWERED');
      expect(database.assignmentCallEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'answered', aggregate_version: 2 }),
      });
      expect(queue.cancelRingTimeout).toHaveBeenCalledWith(CALL_ID);
      expect(queue.armDurationTimers).toHaveBeenCalledWith(CALL_ID);
      expect(realtime.publishAnswered).toHaveBeenCalledWith(EVENT_ID);
      expect(authorization.invalidate).toHaveBeenCalledWith(CALL_ID);
    });

    it('rejects answer attempts by the caller as not-found, never distinguishing role from absence', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(callRecord());

      await expect(
        service.answer({ actor: caller, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_NOT_FOUND', statusCode: 404 });
    });

    it('reports the identical ASSIGNMENT_CALL_NOT_FOUND for a non-participant actor', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(null);

      await expect(
        service.answer({ actor: { ...caller, id: OUTSIDER_ID }, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_NOT_FOUND', statusCode: 404 });
    });

    it.each(['answered', 'declined', 'missed', 'ended'])(
      'rejects answering a call already in outcome %s',
      async (outcome) => {
        const { service, database } = harness();
        database.assignmentCall.findFirst.mockResolvedValue(callRecord({ outcome }));

        await expect(
          service.answer({ actor: callee, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY }),
        ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_INVALID_STATE' });
      },
    );

    it('replays an idempotent answer without re-transitioning the call', async () => {
      const { service, database } = harness();
      const existing = callRecord({ outcome: 'answered', answered_at: new Date() });
      database.assignmentCall.findFirst.mockResolvedValue(existing);
      database.assignmentCallEvent.findUnique.mockResolvedValue({ id: EVENT_ID });

      const result = await service.answer({
        actor: callee,
        callId: CALL_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      });

      expect(database.assignmentCall.updateMany).not.toHaveBeenCalled();
      expect(result.call.outcome).toBe('ANSWERED');
    });
  });

  describe('decline', () => {
    it('succeeds only from ringing, only by the callee', async () => {
      const { service, database, queue, realtime, authorization } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(callRecord());
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'declined', ended_at: new Date(), end_reason: 'declined', aggregate_version: 2 }),
      );

      const result = await service.decline({
        actor: callee,
        callId: CALL_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      });

      expect(result.outcome).toBe('DECLINED');
      expect(database.assignmentCallEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'declined', aggregate_version: 2 }),
      });
      expect(queue.cancelRingTimeout).toHaveBeenCalledWith(CALL_ID);
      expect(realtime.publishDeclined).toHaveBeenCalledWith(EVENT_ID);
      expect(authorization.invalidate).toHaveBeenCalledWith(CALL_ID);
    });

    it('rejects a decline attempted by the caller', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(callRecord());

      await expect(
        service.decline({ actor: caller, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_NOT_FOUND' });
    });

    it('rejects declining a call that is no longer ringing', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(callRecord({ outcome: 'answered' }));
      database.assignmentCall.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.decline({ actor: callee, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_CALL_INVALID_STATE' });
    });
  });

  describe('end', () => {
    it('proves aggregate_version is read fresh: ending directly from ringing lands at version 2', async () => {
      const { service, database, realtime } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(
        callRecord({ outcome: 'ringing', aggregate_version: 1 }),
      );
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'ended', ended_at: new Date(), aggregate_version: 2 }),
      );

      await service.end({ actor: caller, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY });

      expect(database.assignmentCallEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'ended', aggregate_version: 2 }),
      });
      expect(realtime.publishEnded).toHaveBeenCalledWith(EVENT_ID);
    });

    it('proves aggregate_version is read fresh: ending from answered (version 2, post-answer) lands at version 3', async () => {
      const { service, database } = harness();
      // Reflects a call that already transitioned ringing(1) -> answered(2).
      database.assignmentCall.findFirst.mockResolvedValue(
        callRecord({ outcome: 'answered', answered_at: new Date('2026-08-22T12:00:00.000Z'), aggregate_version: 2 }),
      );
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'ended', ended_at: new Date(), aggregate_version: 3 }),
      );

      await service.end({ actor: caller, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY });

      expect(database.assignmentCallEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'ended', aggregate_version: 3 }),
      });
    });

    it('allows either participant to end a ringing or answered call', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(callRecord({ outcome: 'ringing' }));
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'ended', ended_at: new Date(), aggregate_version: 2 }),
      );

      await expect(
        service.end({ actor: callee, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY }),
      ).resolves.toMatchObject({ outcome: 'ENDED' });
    });

    it('computes duration_seconds only when answered_at was set, leaving it null otherwise', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(
        callRecord({ outcome: 'ringing', answered_at: null }),
      );
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'ended', ended_at: new Date(), duration_seconds: null, aggregate_version: 2 }),
      );

      await service.end({ actor: caller, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY });

      const updateArgs = database.assignmentCall.updateMany.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArgs.data.duration_seconds).toBeUndefined();
    });

    it('computes duration_seconds from answered_at to now when the call had been answered', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(
        callRecord({
          outcome: 'answered',
          answered_at: new Date('2026-08-22T12:00:00.000Z'),
          aggregate_version: 2,
        }),
      );
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'ended', ended_at: new Date(), duration_seconds: 90, aggregate_version: 3 }),
      );

      await service.end({ actor: caller, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY });

      const updateArgs = database.assignmentCall.updateMany.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(typeof updateArgs.data.duration_seconds).toBe('number');
    });

    it('replays an idempotent end without re-transitioning the call', async () => {
      const { service, database } = harness();
      const existing = callRecord({ outcome: 'ended', ended_at: new Date() });
      database.assignmentCall.findFirst.mockResolvedValue(existing);
      database.assignmentCallEvent.findUnique.mockResolvedValue({ id: EVENT_ID });

      await service.end({ actor: caller, callId: CALL_ID, idempotencyKey: IDEMPOTENCY_KEY });

      expect(database.assignmentCall.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    it('succeeds only from answered with ended_at IS NULL, clearing disconnected_at and cancelling the grace timer', async () => {
      const { service, database, queue, ice } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(
        callRecord({ outcome: 'answered', answered_at: new Date(), ended_at: null }),
      );

      await service.reconnect({ actor: caller, callId: CALL_ID });

      expect(database.assignmentCallParticipation.updateMany).toHaveBeenCalledWith({
        where: { call_id: CALL_ID, user_id: CALLER_ID },
        data: { disconnected_at: null },
      });
      expect(queue.cancelReconnectGrace).toHaveBeenCalledWith(CALL_ID, CALLER_ID);
      expect(ice.mintJoinCredentials).toHaveBeenCalledWith(CALLER_ID);
    });

    it('rejects reconnecting to a call that is not answered', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(callRecord({ outcome: 'ringing' }));

      await expect(service.reconnect({ actor: caller, callId: CALL_ID })).rejects.toMatchObject({
        code: 'ASSIGNMENT_CALL_INVALID_STATE',
      });
    });

    it('rejects reconnecting to a call whose ended_at is already set', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(
        callRecord({ outcome: 'answered', ended_at: new Date() }),
      );

      await expect(service.reconnect({ actor: caller, callId: CALL_ID })).rejects.toMatchObject({
        code: 'ASSIGNMENT_CALL_INVALID_STATE',
      });
    });

    it('is safe to call twice in a row -- no idempotency key is required', async () => {
      const { service, database, queue } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(
        callRecord({ outcome: 'answered', answered_at: new Date(), ended_at: null }),
      );

      await service.reconnect({ actor: caller, callId: CALL_ID });
      await expect(service.reconnect({ actor: caller, callId: CALL_ID })).resolves.toBeDefined();

      expect(database.assignmentCallParticipation.updateMany).toHaveBeenCalledTimes(2);
      expect(queue.cancelReconnectGrace).toHaveBeenCalledTimes(2);
    });
  });

  describe('getJoinCredentials', () => {
    it('rejects a terminal call', async () => {
      const { service, database } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(
        callRecord({ outcome: 'ended', ended_at: new Date() }),
      );

      await expect(service.getJoinCredentials(caller, CALL_ID)).rejects.toMatchObject({
        code: 'ASSIGNMENT_CALL_INVALID_STATE',
      });
    });

    it('mints credentials for a ringing or answered call', async () => {
      const { service, database, ice } = harness();
      database.assignmentCall.findFirst.mockResolvedValue(callRecord({ outcome: 'ringing' }));

      await service.getJoinCredentials(caller, CALL_ID);

      expect(ice.mintJoinCredentials).toHaveBeenCalledWith(CALLER_ID);
    });
  });
});
