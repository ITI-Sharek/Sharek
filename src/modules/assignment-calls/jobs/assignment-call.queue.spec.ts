import { ConfigService } from '@nestjs/config';

const add = jest.fn();
const remove = jest.fn();
const close = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add, remove, close })),
}));

import {
  AssignmentCallQueue,
  durationWarningJobId,
  maxDurationJobId,
  reconnectGraceJobId,
  ringTimeoutJobId,
} from './assignment-call.queue';

const CALL_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

describe('assignment call job ids', () => {
  it('never contain ":" -- BullMQ rejects a custom job id that does', () => {
    // A colon in a jobId throws "Custom Id cannot contain :" at runtime, and
    // this suite mocks bullmq, so the constraint has to be asserted directly
    // rather than relying on a real rejection to catch a regression.
    expect(ringTimeoutJobId(CALL_ID)).not.toContain(':');
    expect(reconnectGraceJobId(CALL_ID, USER_ID)).not.toContain(':');
    expect(durationWarningJobId(CALL_ID, 0)).not.toContain(':');
    expect(maxDurationJobId(CALL_ID)).not.toContain(':');
  });

  it('distinguishes two users disconnecting from the same call', () => {
    expect(reconnectGraceJobId(CALL_ID, USER_ID)).not.toBe(
      reconnectGraceJobId(CALL_ID, OTHER_USER_ID),
    );
  });

  it('distinguishes two duration-warning offsets on the same call', () => {
    expect(durationWarningJobId(CALL_ID, 0)).not.toBe(durationWarningJobId(CALL_ID, 1));
  });
});

describe('AssignmentCallQueue', () => {
  const configValues: Record<string, unknown> = {
    ASSIGNMENT_CALL_QUEUE_ENABLED: true,
    ASSIGNMENT_CALL_RING_TIMEOUT_MS: 30_000,
    ASSIGNMENT_CALL_RECONNECT_GRACE_MS: 30_000,
    ASSIGNMENT_CALL_MAX_DURATION_MS: 3_600_000,
    ASSIGNMENT_CALL_WARNING_MS: '3000000,3480000',
    ASSIGNMENT_CALL_SWEEP_INTERVAL_MS: 60_000,
  };

  function enabled(overrides: Record<string, unknown> = {}) {
    const values = { ...configValues, ...overrides };
    return new AssignmentCallQueue({
      get: (key: string, fallback: unknown) => (key in values ? values[key] : fallback),
      getOrThrow: () => 'redis://localhost:6379',
    } as unknown as ConfigService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    add.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
  });

  describe('ring timeout', () => {
    it('arms a delayed job with a stable jobId and the configured delay', async () => {
      await enabled().armRingTimeout(CALL_ID);

      expect(add).toHaveBeenCalledWith(
        'ring-timeout',
        { callId: CALL_ID },
        expect.objectContaining({
          jobId: ringTimeoutJobId(CALL_ID),
          delay: 30_000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
        }),
      );
    });

    it('cancels by removing the same stable jobId', async () => {
      await enabled().cancelRingTimeout(CALL_ID);

      expect(remove).toHaveBeenCalledWith(ringTimeoutJobId(CALL_ID));
    });
  });

  describe('reconnect grace', () => {
    it('arms a delayed job keyed by call and user', async () => {
      await enabled().armReconnectGrace(CALL_ID, USER_ID);

      expect(add).toHaveBeenCalledWith(
        'reconnect-grace',
        { callId: CALL_ID, userId: USER_ID },
        expect.objectContaining({
          jobId: reconnectGraceJobId(CALL_ID, USER_ID),
          delay: 30_000,
        }),
      );
    });

    it('cancels the specific user grace timer, not the whole call', async () => {
      await enabled().cancelReconnectGrace(CALL_ID, USER_ID);

      expect(remove).toHaveBeenCalledWith(reconnectGraceJobId(CALL_ID, USER_ID));
      expect(remove).not.toHaveBeenCalledWith(reconnectGraceJobId(CALL_ID, OTHER_USER_ID));
    });
  });

  describe('duration timers', () => {
    it('arms one delayed job per configured warning offset plus a max-duration job', async () => {
      await enabled().armDurationTimers(CALL_ID);

      expect(add).toHaveBeenCalledWith(
        'duration-warning',
        { callId: CALL_ID, warningIndex: 0 },
        expect.objectContaining({ jobId: durationWarningJobId(CALL_ID, 0), delay: 3_000_000 }),
      );
      expect(add).toHaveBeenCalledWith(
        'duration-warning',
        { callId: CALL_ID, warningIndex: 1 },
        expect.objectContaining({ jobId: durationWarningJobId(CALL_ID, 1), delay: 3_480_000 }),
      );
      expect(add).toHaveBeenCalledWith(
        'max-duration',
        { callId: CALL_ID },
        expect.objectContaining({ jobId: maxDurationJobId(CALL_ID), delay: 3_600_000 }),
      );
    });

    it('cancels every warning job and the max-duration job together', async () => {
      await enabled().cancelDurationTimers(CALL_ID);

      expect(remove).toHaveBeenCalledWith(durationWarningJobId(CALL_ID, 0));
      expect(remove).toHaveBeenCalledWith(durationWarningJobId(CALL_ID, 1));
      expect(remove).toHaveBeenCalledWith(maxDurationJobId(CALL_ID));
    });
  });

  describe('sweep and capacity poll (repeat jobs)', () => {
    it('schedules a repeating sweep and a bucketed catch-up', async () => {
      const queue = enabled();
      await queue.scheduleSweep();
      await queue.enqueueSweepCatchUp(new Date('2026-08-22T12:00:00.000Z'));

      expect(add).toHaveBeenNthCalledWith(
        1,
        'sweep',
        {},
        expect.objectContaining({ jobId: 'assignment-call-sweeper', repeat: { every: 60_000 } }),
      );
      expect(add).toHaveBeenNthCalledWith(
        2,
        'sweep',
        {},
        expect.objectContaining({ jobId: expect.stringContaining('catch-up') as string }),
      );
    });

    it('schedules a daily capacity poll', async () => {
      await enabled().scheduleCapacityPoll();

      expect(add).toHaveBeenCalledWith(
        'capacity-poll',
        {},
        expect.objectContaining({
          jobId: 'assignment-call-capacity-poller',
          repeat: { every: 24 * 60 * 60 * 1000 },
        }),
      );
    });
  });

  describe('when the queue is disabled', () => {
    function disabled() {
      return new AssignmentCallQueue({
        get: (key: string, fallback: unknown) =>
          key === 'ASSIGNMENT_CALL_QUEUE_ENABLED' ? false : (configValues[key] ?? fallback),
        getOrThrow: () => 'redis://localhost:6379',
      } as unknown as ConfigService);
    }

    it('silently no-ops arming instead of throwing -- the client mirrors the timer for UI regardless', async () => {
      await expect(disabled().armRingTimeout(CALL_ID)).resolves.toBeUndefined();
      expect(add).not.toHaveBeenCalled();
    });

    it('silently no-ops cancelling', async () => {
      await expect(disabled().cancelRingTimeout(CALL_ID)).resolves.toBeUndefined();
      expect(remove).not.toHaveBeenCalled();
    });
  });

  it('closes the underlying queue on module destroy', async () => {
    await enabled().onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
