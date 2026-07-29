import { ConfigService } from '@nestjs/config';

const add = jest.fn();
const close = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add, close })),
}));

import { ApplicationReviewWindowQueue } from './application-review-window.queue';

describe('ApplicationReviewWindowQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    add.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
  });

  it('registers a repeat sweep and a bucketed catch-up with bounded retries', async () => {
    const queue = new ApplicationReviewWindowQueue(
      new ConfigService({
        APPLICATION_REVIEW_QUEUE_ENABLED: true,
        APPLICATION_REVIEW_SWEEP_INTERVAL_MS: 60_000,
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
    expect(add).toHaveBeenNthCalledWith(1, 'sweep', {}, {
      jobId: 'scheduled-sweep',
      repeat: { every: 60_000 },
      ...retryOptions,
    });
    expect(add).toHaveBeenNthCalledWith(2, 'sweep', {}, {
      jobId: 'catch-up-2',
      ...retryOptions,
    });
  });

  it('does not touch Redis when review scheduling is disabled', async () => {
    const queue = new ApplicationReviewWindowQueue(
      new ConfigService({ APPLICATION_REVIEW_QUEUE_ENABLED: false }),
    );
    await queue.schedule();
    await queue.enqueueCatchUp();
    await queue.onModuleDestroy();
    expect(add).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
