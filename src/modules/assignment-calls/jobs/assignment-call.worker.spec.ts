import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';

let handler: ((job: Job) => Promise<unknown>) | null = null;
const workerOn = jest.fn();
const workerClose = jest.fn();

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_name: string, jobHandler: (job: unknown) => Promise<unknown>) => {
      handler = jobHandler as (job: Job) => Promise<unknown>;
      return { on: workerOn, close: workerClose };
    },
  ),
}));

import { AssignmentCallWorker } from './assignment-call.worker';

const CALL_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('AssignmentCallWorker', () => {
  const queue = {
    scheduleSweep: jest.fn(),
    scheduleCapacityPoll: jest.fn(),
    enqueueSweepCatchUp: jest.fn(),
  };
  const timers = {
    handleRingTimeout: jest.fn(),
    handleReconnectGraceExpired: jest.fn(),
    handleDurationWarning: jest.fn(),
    handleMaxDurationReached: jest.fn(),
    sweep: jest.fn(),
  };
  const capacity = { pollAndRecordUsage: jest.fn() };

  const config = (enabledValue: boolean) =>
    ({
      get: (key: string, fallback: unknown) =>
        key === 'ASSIGNMENT_CALL_QUEUE_ENABLED' ? enabledValue : fallback,
      getOrThrow: () => 'redis://localhost:6379',
    }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = null;
    queue.scheduleSweep.mockResolvedValue(undefined);
    queue.scheduleCapacityPoll.mockResolvedValue(undefined);
    queue.enqueueSweepCatchUp.mockResolvedValue(undefined);
    timers.handleRingTimeout.mockResolvedValue(undefined);
    timers.handleReconnectGraceExpired.mockResolvedValue(undefined);
    timers.handleDurationWarning.mockResolvedValue(undefined);
    timers.handleMaxDurationReached.mockResolvedValue(undefined);
    timers.sweep.mockResolvedValue(undefined);
    capacity.pollAndRecordUsage.mockResolvedValue(undefined);
  });

  async function bootstrap() {
    const worker = new AssignmentCallWorker(
      config(true),
      queue as never,
      timers as never,
      capacity as never,
    );
    await worker.onApplicationBootstrap();
    return worker;
  }

  it('routes each job name to its own timer handler', async () => {
    await bootstrap();
    if (!handler) throw new Error('worker did not register a handler');

    await handler({ name: 'ring-timeout', data: { callId: CALL_ID } } as Job);
    expect(timers.handleRingTimeout).toHaveBeenCalledWith(CALL_ID);

    await handler({
      name: 'reconnect-grace',
      data: { callId: CALL_ID, userId: USER_ID },
    } as Job);
    expect(timers.handleReconnectGraceExpired).toHaveBeenCalledWith(CALL_ID, USER_ID);

    await handler({
      name: 'duration-warning',
      data: { callId: CALL_ID, warningIndex: 1 },
    } as Job);
    expect(timers.handleDurationWarning).toHaveBeenCalledWith(CALL_ID, 1);

    await handler({ name: 'max-duration', data: { callId: CALL_ID } } as Job);
    expect(timers.handleMaxDurationReached).toHaveBeenCalledWith(CALL_ID);

    await handler({ name: 'sweep', data: {} } as Job);
    expect(timers.sweep).toHaveBeenCalledTimes(1);

    await handler({ name: 'capacity-poll', data: {} } as Job);
    expect(capacity.pollAndRecordUsage).toHaveBeenCalledTimes(1);
  });

  it('lets a handler failure reach BullMQ so the job is retried', async () => {
    await bootstrap();
    if (!handler) throw new Error('worker did not register a handler');
    timers.handleRingTimeout.mockRejectedValue(new Error('database unreachable'));

    await expect(
      handler({ name: 'ring-timeout', data: { callId: CALL_ID } } as Job),
    ).rejects.toThrow('database unreachable');
  });

  it('schedules the sweep, the capacity poll, and a catch-up sweep on bootstrap', async () => {
    await bootstrap();

    expect(queue.scheduleSweep).toHaveBeenCalledTimes(1);
    expect(queue.scheduleCapacityPoll).toHaveBeenCalledTimes(1);
    expect(queue.enqueueSweepCatchUp).toHaveBeenCalledTimes(1);
  });

  it('starts nothing when the queue is disabled', async () => {
    const worker = new AssignmentCallWorker(
      config(false),
      queue as never,
      timers as never,
      capacity as never,
    );

    await worker.onApplicationBootstrap();

    expect(handler).toBeNull();
    expect(queue.scheduleSweep).not.toHaveBeenCalled();
  });

  it('ignores an unrecognised job name instead of failing it', async () => {
    await bootstrap();
    if (!handler) throw new Error('worker did not register a handler');

    await expect(handler({ name: 'unknown', data: {} } as Job)).resolves.toBeUndefined();
    expect(timers.handleRingTimeout).not.toHaveBeenCalled();
    expect(timers.sweep).not.toHaveBeenCalled();
  });

  it('closes the underlying worker on module destroy', async () => {
    const worker = await bootstrap();
    await worker.onModuleDestroy();

    expect(workerClose).toHaveBeenCalledTimes(1);
  });
});
