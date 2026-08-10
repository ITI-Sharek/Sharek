const add = jest.fn();
const close = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add, close })),
}));

import { ConfigService } from '@nestjs/config';

import { NotificationRetentionQueue } from './notification-retention.queue';

describe('NotificationRetentionQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    add.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
  });

  it('registers repeat and catch-up cleanup jobs with bounded retries', async () => {
    const queue = new NotificationRetentionQueue(
      new ConfigService({
        NOTIFICATION_RETENTION_QUEUE_ENABLED: true,
        NOTIFICATION_RETENTION_INTERVAL_MS: 60_000,
        REDIS_URL: 'redis://localhost:6379',
      }),
    );

    await queue.schedule();
    await queue.enqueueCatchUp(120_000);

    const retryOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    };
    expect(add).toHaveBeenNthCalledWith(1, 'purge', {}, {
      jobId: 'scheduled-retention-purge',
      repeat: { every: 60_000 },
      ...retryOptions,
    });
    expect(add).toHaveBeenNthCalledWith(2, 'purge', {}, {
      jobId: 'retention-purge-catch-up-2',
      ...retryOptions,
    });
  });

  it('does not touch Redis when cleanup scheduling is disabled', async () => {
    const queue = new NotificationRetentionQueue(
      new ConfigService({ NOTIFICATION_RETENTION_QUEUE_ENABLED: false }),
    );

    await queue.schedule();
    await queue.enqueueCatchUp();
    await queue.onModuleDestroy();

    expect(add).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
