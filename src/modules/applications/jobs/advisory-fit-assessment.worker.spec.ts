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

import { AdvisoryFitAssessmentWorker } from './advisory-fit-assessment.worker';

describe('AdvisoryFitAssessmentWorker', () => {
  const queue = {
    scheduleReaper: jest.fn(),
    enqueueReapCatchUp: jest.fn(),
  };
  const processor = { process: jest.fn() };
  const reaper = { reapStale: jest.fn() };

  const config = (enabledValue: boolean) =>
    ({
      get: (key: string, fallback: unknown) =>
        key === 'ADVISORY_FIT_QUEUE_ENABLED' ? enabledValue : fallback,
      getOrThrow: () => 'redis://localhost:6379',
    }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = null;
    queue.scheduleReaper.mockResolvedValue(undefined);
    queue.enqueueReapCatchUp.mockResolvedValue(undefined);
    processor.process.mockResolvedValue({ outcome: 'completed', attemptNumber: 1 });
    reaper.reapStale.mockResolvedValue({ reaped: 0, skipped: 0 });
  });

  async function bootstrap() {
    const worker = new AdvisoryFitAssessmentWorker(
      config(true),
      queue as never,
      processor as never,
      reaper as never,
    );
    await worker.onApplicationBootstrap();
    return worker;
  }

  it('routes each job name to its own handler', async () => {
    await bootstrap();
    if (!handler) throw new Error('worker did not register a handler');

    await handler({ name: 'assess', data: { assessmentRequestId: 'r1', attemptNumber: 2 } } as Job);
    expect(processor.process).toHaveBeenCalledWith('r1', 2);

    await handler({ name: 'reap', data: {} } as Job);
    expect(reaper.reapStale).toHaveBeenCalledTimes(1);
  });

  it('schedules the reaper and a catch-up sweep on bootstrap', async () => {
    await bootstrap();

    expect(queue.scheduleReaper).toHaveBeenCalledTimes(1);
    expect(queue.enqueueReapCatchUp).toHaveBeenCalledTimes(1);
  });

  it('starts nothing when the queue is disabled', async () => {
    const worker = new AdvisoryFitAssessmentWorker(
      config(false),
      queue as never,
      processor as never,
      reaper as never,
    );

    await worker.onApplicationBootstrap();

    expect(handler).toBeNull();
    expect(queue.scheduleReaper).not.toHaveBeenCalled();
  });

  it('ignores an unrecognised job name instead of failing it', async () => {
    await bootstrap();
    if (!handler) throw new Error('worker did not register a handler');

    await expect(handler({ name: 'unknown', data: {} } as Job)).resolves.toBeUndefined();
    expect(processor.process).not.toHaveBeenCalled();
    expect(reaper.reapStale).not.toHaveBeenCalled();
  });
});
