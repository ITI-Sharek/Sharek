import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

let processor: (() => Promise<unknown>) | null = null;
const workerOn = jest.fn();
const workerClose = jest.fn();

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_name: string, jobProcessor: () => Promise<unknown>) => {
      processor = jobProcessor;
      return { on: workerOn, close: workerClose };
    },
  ),
}));

import { ApplicationReviewWindowWorker } from './application-review-window.worker';

describe('ApplicationReviewWindowWorker', () => {
  beforeEach(() => {
    processor = null;
    jest.clearAllMocks();
    workerClose.mockResolvedValue(undefined);
  });

  it('schedules catch-up and delegates duplicate jobs to the idempotent processor', async () => {
    const queue = {
      schedule: jest.fn().mockResolvedValue(undefined),
      enqueueCatchUp: jest.fn().mockResolvedValue(undefined),
    };
    const reviewWindow = {
      processDue: jest
        .fn()
        .mockResolvedValue({ reminded: 0, expired: 0 }),
    };
    const worker = new ApplicationReviewWindowWorker(
      new ConfigService({
        APPLICATION_REVIEW_QUEUE_ENABLED: true,
        REDIS_URL: 'redis://localhost:6379',
      }),
      queue as never,
      reviewWindow as never,
    );

    await worker.onApplicationBootstrap();
    await processor?.();
    await processor?.();

    expect(queue.schedule).toHaveBeenCalledTimes(1);
    expect(queue.enqueueCatchUp).toHaveBeenCalledTimes(1);
    expect(reviewWindow.processDue).toHaveBeenCalledTimes(2);
    expect(reviewWindow.processDue.mock.calls[0]?.[0]).toBeInstanceOf(Date);
    expect(reviewWindow.processDue.mock.calls[1]?.[0]).toBeInstanceOf(Date);
  });

  it('does not start or schedule when disabled', async () => {
    const queue = { schedule: jest.fn(), enqueueCatchUp: jest.fn() };
    const reviewWindow = { processDue: jest.fn() };
    const worker = new ApplicationReviewWindowWorker(
      new ConfigService({ APPLICATION_REVIEW_QUEUE_ENABLED: false }),
      queue as never,
      reviewWindow as never,
    );

    await worker.onApplicationBootstrap();
    expect(processor).toBeNull();
    expect(queue.schedule).not.toHaveBeenCalled();
    expect(queue.enqueueCatchUp).not.toHaveBeenCalled();
  });

  it('logs the terminal job failure after BullMQ exhausts configured retries', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const queue = {
      schedule: jest.fn().mockResolvedValue(undefined),
      enqueueCatchUp: jest.fn().mockResolvedValue(undefined),
    };
    const reviewWindow = { processDue: jest.fn() };
    const worker = new ApplicationReviewWindowWorker(
      new ConfigService({
        APPLICATION_REVIEW_QUEUE_ENABLED: true,
        REDIS_URL: 'redis://localhost:6379',
      }),
      queue as never,
      reviewWindow as never,
    );

    await worker.onApplicationBootstrap();
    const failedHandler = workerOn.mock.calls.find(
      ([event]) => event === 'failed',
    )?.[1] as
      | ((job: { id: string; attemptsMade: number }, error: Error) => void)
      | undefined;
    const error = new Error('sweep failed after retries');
    failedHandler?.({ id: 'scheduled-sweep', attemptsMade: 3 }, error);

    expect(failedHandler).toBeDefined();
    expect(loggerError).toHaveBeenCalledWith(
      'Application review sweep scheduled-sweep failed',
      error.stack,
    );
  });
});
