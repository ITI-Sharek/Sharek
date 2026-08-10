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

import { NotificationRetentionWorker } from './notification-retention.worker';

describe('NotificationRetentionWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handler = null;
    workerClose.mockResolvedValue(undefined);
  });

  it('schedules cleanup and delegates repeat/catch-up jobs to the service', async () => {
    const queue = {
      schedule: jest.fn().mockResolvedValue(undefined),
      enqueueCatchUp: jest.fn().mockResolvedValue(undefined),
    };
    const retention = {
      purgeExpired: jest.fn().mockResolvedValue({ purged: 0, skipped: 0 }),
    };
    const worker = new NotificationRetentionWorker(
      new ConfigService({
        NOTIFICATION_RETENTION_QUEUE_ENABLED: true,
        REDIS_URL: 'redis://localhost:6379',
      }),
      queue as never,
      retention as never,
    );

    await worker.onApplicationBootstrap();
    await handler?.({ name: 'purge', data: {} } as Job);
    await handler?.({ name: 'purge', data: {} } as Job);

    expect(queue.schedule).toHaveBeenCalledTimes(1);
    expect(queue.enqueueCatchUp).toHaveBeenCalledTimes(1);
    expect(retention.purgeExpired).toHaveBeenCalledTimes(2);
    expect(retention.purgeExpired.mock.calls[0]?.[0]).toBeInstanceOf(Date);
  });

  it('does not start or schedule when retention cleanup is disabled', async () => {
    const queue = { schedule: jest.fn(), enqueueCatchUp: jest.fn() };
    const retention = { purgeExpired: jest.fn() };
    const worker = new NotificationRetentionWorker(
      new ConfigService({ NOTIFICATION_RETENTION_QUEUE_ENABLED: false }),
      queue as never,
      retention as never,
    );

    await worker.onApplicationBootstrap();

    expect(handler).toBeNull();
    expect(queue.schedule).not.toHaveBeenCalled();
  });

  it('logs terminal failures without leaking notification payloads', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const queue = {
      schedule: jest.fn().mockResolvedValue(undefined),
      enqueueCatchUp: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new NotificationRetentionWorker(
      new ConfigService({
        NOTIFICATION_RETENTION_QUEUE_ENABLED: true,
        REDIS_URL: 'redis://localhost:6379',
      }),
      queue as never,
      { purgeExpired: jest.fn() } as never,
    );

    await worker.onApplicationBootstrap();
    const failedHandler = workerOn.mock.calls.find(
      ([event]) => event === 'failed',
    )?.[1] as
      | ((job: { id: string; attemptsMade: number }, error: Error) => void)
      | undefined;
    const error = new Error('retention failed after retries');
    failedHandler?.({ id: 'scheduled-retention-purge', attemptsMade: 3 }, error);

    expect(failedHandler).toBeDefined();
    expect(loggerError).toHaveBeenCalledWith(
      'Notification retention purge scheduled-retention-purge failed after 3 attempts',
      error.stack,
    );
    expect(loggerError.mock.calls.flat()).not.toContain(
      expect.stringContaining('notification-1'),
    );
  });
});
