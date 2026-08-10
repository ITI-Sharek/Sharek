import { Logger } from '@nestjs/common';
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

import { NotificationEventRecoveryWorker } from './notification-event-recovery.worker';

describe('NotificationEventRecoveryWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handler = null;
    workerClose.mockResolvedValue(undefined);
  });

  it('schedules catch-up and delegates duplicate jobs to the recovery service', async () => {
    const queue = {
      schedule: jest.fn().mockResolvedValue(undefined),
      enqueueCatchUp: jest.fn().mockResolvedValue(undefined),
    };
    const recovery = {
      recoverPending: jest.fn().mockResolvedValue({
        selected: 0,
        attempted: 0,
        published: 0,
        unavailable: 0,
        exhausted: 0,
        skipped: 0,
      }),
    };
    const worker = new NotificationEventRecoveryWorker(
      new ConfigService({
        NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED: true,
        REDIS_URL: 'redis://localhost:6379',
      }),
      queue as never,
      recovery as never,
    );

    await worker.onApplicationBootstrap();
    await handler?.({ name: 'recover', data: {} } as Job);
    await handler?.({ name: 'recover', data: {} } as Job);

    expect(queue.schedule).toHaveBeenCalledTimes(1);
    expect(queue.enqueueCatchUp).toHaveBeenCalledTimes(1);
    expect(recovery.recoverPending).toHaveBeenCalledTimes(2);
    expect(recovery.recoverPending.mock.calls[0]?.[0]).toBeInstanceOf(Date);
  });

  it('does not start or schedule when recovery is disabled', async () => {
    const queue = { schedule: jest.fn(), enqueueCatchUp: jest.fn() };
    const recovery = { recoverPending: jest.fn() };
    const worker = new NotificationEventRecoveryWorker(
      new ConfigService({ NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED: false }),
      queue as never,
      recovery as never,
    );

    await worker.onApplicationBootstrap();

    expect(handler).toBeNull();
    expect(queue.schedule).not.toHaveBeenCalled();
  });

  it('logs terminal BullMQ failures without leaking event payloads', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const queue = {
      schedule: jest.fn().mockResolvedValue(undefined),
      enqueueCatchUp: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new NotificationEventRecoveryWorker(
      new ConfigService({
        NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED: true,
        REDIS_URL: 'redis://localhost:6379',
      }),
      queue as never,
      { recoverPending: jest.fn() } as never,
    );

    await worker.onApplicationBootstrap();
    const failedHandler = workerOn.mock.calls.find(
      ([event]) => event === 'failed',
    )?.[1] as
      | ((job: { id: string; attemptsMade: number }, error: Error) => void)
      | undefined;
    const error = new Error('recovery failed after retries');
    failedHandler?.({ id: 'scheduled-recovery', attemptsMade: 3 }, error);

    expect(failedHandler).toBeDefined();
    expect(loggerError).toHaveBeenCalledWith(
      'Notification event recovery scheduled-recovery failed after 3 attempts',
      error.stack,
    );
    expect(loggerError.mock.calls.flat()).not.toContain(
      expect.stringContaining('event-created-1'),
    );
  });
});
