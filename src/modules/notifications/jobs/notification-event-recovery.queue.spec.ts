import { ConfigService } from '@nestjs/config';

const add = jest.fn();
const close = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add, close })),
}));

import { NotificationEventRecoveryQueue } from './notification-event-recovery.queue';

describe('NotificationEventRecoveryQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    add.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
  });

  it('registers a repeat recovery and bucketed catch-up with bounded BullMQ retries', async () => {
    const queue = new NotificationEventRecoveryQueue(
      new ConfigService({
        NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED: true,
        NOTIFICATION_EVENT_RECOVERY_INTERVAL_MS: 60_000,
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
    expect(add).toHaveBeenNthCalledWith(1, 'recover', {}, {
      jobId: 'scheduled-recovery',
      repeat: { every: 60_000 },
      ...retryOptions,
    });
    expect(add).toHaveBeenNthCalledWith(2, 'recover', {}, {
      jobId: 'catch-up-2',
      ...retryOptions,
    });
  });

  it('does not touch Redis when recovery scheduling is disabled', async () => {
    const queue = new NotificationEventRecoveryQueue(
      new ConfigService({ NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED: false }),
    );

    await queue.schedule();
    await queue.enqueueCatchUp();
    await queue.onModuleDestroy();

    expect(add).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
