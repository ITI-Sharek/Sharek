import { AssignmentCallTimersService } from './assignment-call-timers.service';

const CALL_ID = '55555555-5555-4555-8555-555555555555';
const CALLER_ID = '11111111-1111-4111-8111-111111111111';
const CALLEE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '77777777-7777-4777-8777-777777777777';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';

function callRecord(overrides: Partial<{
  outcome: string;
  answered_at: Date | null;
  ended_at: Date | null;
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

function harness(withNotifications = true) {
  const shared = {
    assignmentCall: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    assignmentCallParticipation: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    assignmentCallEvent: {
      create: jest.fn().mockResolvedValue({ id: EVENT_ID }),
    },
  };
  const database = {
    ...shared,
    $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback(shared),
    ),
  };
  const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
  const queue = {
    armReconnectGrace: jest.fn().mockResolvedValue(undefined),
    cancelRingTimeout: jest.fn().mockResolvedValue(undefined),
    cancelDurationTimers: jest.fn().mockResolvedValue(undefined),
    cancelReconnectGrace: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { publishEnded: jest.fn().mockResolvedValue(true) };
  const publisher = { publishTransientToUser: jest.fn() };
  const authorization = { invalidate: jest.fn() };
  const notifications = { createMissedCallNotification: jest.fn().mockResolvedValue(undefined) };

  const service = new AssignmentCallTimersService(
    database as never,
    config as never,
    queue as never,
    realtime as never,
    publisher as never,
    authorization as never,
    withNotifications ? (notifications as never) : undefined,
  );

  return { service, database, queue, realtime, publisher, authorization, notifications };
}

describe('AssignmentCallTimersService', () => {
  describe('handleRingTimeout', () => {
    it('transitions ringing -> missed, releases participations, and notifies the callee', async () => {
      const { service, database, queue, realtime, authorization, notifications } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(callRecord({ outcome: 'ringing' }));
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'missed', ended_at: new Date() }),
      );

      await service.handleRingTimeout(CALL_ID);

      expect(database.assignmentCall.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CALL_ID, outcome: { in: ['ringing'] } },
          data: expect.objectContaining({ outcome: 'missed', end_reason: 'ring_timeout' }),
        }),
      );
      expect(queue.cancelRingTimeout).toHaveBeenCalledWith(CALL_ID);
      expect(authorization.invalidate).toHaveBeenCalledWith(CALL_ID);
      expect(realtime.publishEnded).toHaveBeenCalledWith(EVENT_ID);
      expect(notifications.createMissedCallNotification).toHaveBeenCalledWith({
        userId: CALLEE_ID,
        callId: CALL_ID,
        conversationId: CONVERSATION_ID,
        callerName: 'Cal Ler',
      });
    });

    it('is a no-op, not an error, when the call was already answered by the time the timer fires', async () => {
      const { service, database, queue, realtime, notifications } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(callRecord({ outcome: 'answered' }));
      // The conditional claim (`outcome: 'ringing'`) matches nothing.
      database.assignmentCall.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.handleRingTimeout(CALL_ID)).resolves.toBeUndefined();

      expect(queue.cancelRingTimeout).not.toHaveBeenCalled();
      expect(realtime.publishEnded).not.toHaveBeenCalled();
      expect(notifications.createMissedCallNotification).not.toHaveBeenCalled();
    });

    it('does not let a missed-call notification failure break the timeout transition', async () => {
      const { service, database, notifications } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(callRecord({ outcome: 'ringing' }));
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'missed', ended_at: new Date() }),
      );
      notifications.createMissedCallNotification.mockRejectedValue(new Error('notify failed'));

      await expect(service.handleRingTimeout(CALL_ID)).resolves.toBeUndefined();
    });
  });

  describe('handleReconnectGraceExpired', () => {
    it('is a no-op when reconnect() already cleared disconnected_at', async () => {
      const { service, database, realtime } = harness();
      database.assignmentCallParticipation.findUnique.mockResolvedValue({ disconnected_at: null });

      await service.handleReconnectGraceExpired(CALL_ID, CALLER_ID);

      expect(database.$transaction).not.toHaveBeenCalled();
      expect(realtime.publishEnded).not.toHaveBeenCalled();
    });

    it('is a no-op when no participation row exists at all', async () => {
      const { service, database } = harness();
      database.assignmentCallParticipation.findUnique.mockResolvedValue(null);

      await expect(
        service.handleReconnectGraceExpired(CALL_ID, CALLER_ID),
      ).resolves.toBeUndefined();
      expect(database.$transaction).not.toHaveBeenCalled();
    });

    it('ends the call when disconnected_at is still set, cancelling both participants timers', async () => {
      const { service, database, queue, realtime, authorization } = harness();
      database.assignmentCallParticipation.findUnique.mockResolvedValue({
        disconnected_at: new Date('2026-08-22T12:05:00.000Z'),
      });
      database.assignmentCall.findUnique.mockResolvedValue(
        callRecord({ outcome: 'answered', answered_at: new Date() }),
      );
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'ended', ended_at: new Date(), end_reason: 'reconnect_timeout' }),
      );

      await service.handleReconnectGraceExpired(CALL_ID, CALLER_ID);

      expect(database.assignmentCall.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CALL_ID, outcome: { in: ['answered'] } } }),
      );
      expect(queue.cancelDurationTimers).toHaveBeenCalledWith(CALL_ID);
      expect(queue.cancelReconnectGrace).toHaveBeenCalledWith(CALL_ID, CALLER_ID);
      expect(queue.cancelReconnectGrace).toHaveBeenCalledWith(CALL_ID, CALLEE_ID);
      expect(authorization.invalidate).toHaveBeenCalledWith(CALL_ID);
      expect(realtime.publishEnded).toHaveBeenCalledWith(EVENT_ID);
    });
  });

  describe('handleMaxDurationReached', () => {
    it('ends an answered call unconditionally once the cap fires', async () => {
      const { service, database, queue, realtime } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(
        callRecord({ outcome: 'answered', answered_at: new Date('2026-08-22T11:00:00.000Z') }),
      );
      database.assignmentCall.updateMany.mockResolvedValue({ count: 1 });
      database.assignmentCall.findUniqueOrThrow.mockResolvedValue(
        callRecord({ outcome: 'ended', ended_at: new Date(), end_reason: 'max_duration' }),
      );

      await service.handleMaxDurationReached(CALL_ID);

      expect(queue.cancelReconnectGrace).toHaveBeenCalledWith(CALL_ID, CALLER_ID);
      expect(queue.cancelReconnectGrace).toHaveBeenCalledWith(CALL_ID, CALLEE_ID);
      expect(realtime.publishEnded).toHaveBeenCalledWith(EVENT_ID);
    });

    it('is a no-op if the call is already terminal by the time the cap fires', async () => {
      const { service, database, realtime } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(callRecord({ outcome: 'ended' }));
      database.assignmentCall.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.handleMaxDurationReached(CALL_ID)).resolves.toBeUndefined();
      expect(realtime.publishEnded).not.toHaveBeenCalled();
    });
  });

  describe('handleDurationWarning', () => {
    it('is transient only: no AssignmentCallEvent row, just a live signal to both participants', async () => {
      const { service, database, publisher } = harness();
      database.assignmentCall.findUnique.mockResolvedValue({
        outcome: 'answered',
        caller_id: CALLER_ID,
        callee_id: CALLEE_ID,
      });

      await service.handleDurationWarning(CALL_ID, 0);

      expect(database.assignmentCallEvent.create).not.toHaveBeenCalled();
      expect(publisher.publishTransientToUser).toHaveBeenCalledWith(
        CALLER_ID,
        'assignment_call.duration_warning',
        { callId: CALL_ID, warningIndex: 0 },
      );
      expect(publisher.publishTransientToUser).toHaveBeenCalledWith(
        CALLEE_ID,
        'assignment_call.duration_warning',
        { callId: CALL_ID, warningIndex: 0 },
      );
    });

    it('is a no-op if the call is no longer answered when the warning fires', async () => {
      const { service, database, publisher } = harness();
      database.assignmentCall.findUnique.mockResolvedValue({
        outcome: 'ended',
        caller_id: CALLER_ID,
        callee_id: CALLEE_ID,
      });

      await service.handleDurationWarning(CALL_ID, 0);

      expect(publisher.publishTransientToUser).not.toHaveBeenCalled();
    });

    it('is a no-op if the call no longer exists', async () => {
      const { service, database, publisher } = harness();
      database.assignmentCall.findUnique.mockResolvedValue(null);

      await service.handleDurationWarning(CALL_ID, 1);

      expect(publisher.publishTransientToUser).not.toHaveBeenCalled();
    });
  });

  describe('handleSocketDisconnected', () => {
    it('arms the reconnect-grace timer for a user with an active participation on an answered call', async () => {
      const { service, database, queue } = harness();
      database.assignmentCallParticipation.findFirst.mockResolvedValue({ call_id: CALL_ID });

      await service.handleSocketDisconnected({ userId: CALLER_ID, socketId: 'socket-1' });

      expect(database.assignmentCallParticipation.findFirst).toHaveBeenCalledWith({
        where: {
          user_id: CALLER_ID,
          active: true,
          call: { outcome: 'answered', ended_at: null },
        },
        select: { call_id: true },
      });
      expect(database.assignmentCallParticipation.updateMany).toHaveBeenCalledWith({
        where: { call_id: CALL_ID, user_id: CALLER_ID, active: true },
        data: { disconnected_at: expect.any(Date) as Date },
      });
      expect(queue.armReconnectGrace).toHaveBeenCalledWith(CALL_ID, CALLER_ID);
    });

    it('does nothing for a disconnect unrelated to any call', async () => {
      const { service, database, queue } = harness();
      database.assignmentCallParticipation.findFirst.mockResolvedValue(null);

      await service.handleSocketDisconnected({ userId: CALLER_ID, socketId: 'socket-1' });

      expect(database.assignmentCallParticipation.updateMany).not.toHaveBeenCalled();
      expect(queue.armReconnectGrace).not.toHaveBeenCalled();
    });
  });

  describe('sweep', () => {
    const now = new Date('2026-08-22T13:00:00.000Z');

    it('ends calls stuck ringing well past their timeout', async () => {
      const { service, database } = harness();
      database.assignmentCall.findMany.mockResolvedValue([{ id: CALL_ID }]);
      const handleRingTimeout = jest
        .spyOn(service, 'handleRingTimeout')
        .mockResolvedValue(undefined);

      await service.sweep(now);

      expect(handleRingTimeout).toHaveBeenCalledWith(CALL_ID);
    });

    it('continues sweeping the rest even if one stuck call fails', async () => {
      const { service, database } = harness();
      database.assignmentCall.findMany.mockResolvedValue([{ id: CALL_ID }, { id: 'other-call' }]);
      const handleRingTimeout = jest
        .spyOn(service, 'handleRingTimeout')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);

      await expect(service.sweep(now)).resolves.toBeUndefined();

      expect(handleRingTimeout).toHaveBeenCalledTimes(2);
    });

    it('clears orphaned active participations left on already-terminal calls -- the "busy forever" failure mode', async () => {
      const { service, database } = harness();
      database.assignmentCallParticipation.updateMany.mockResolvedValue({ count: 3 });

      await service.sweep(now);

      expect(database.assignmentCallParticipation.updateMany).toHaveBeenCalledWith({
        where: { active: true, call: { ended_at: { not: null } } },
        data: { active: false, left_at: now },
      });
    });
  });
});
