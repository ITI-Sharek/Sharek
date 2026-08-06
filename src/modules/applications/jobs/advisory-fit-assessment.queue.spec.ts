import { ConfigService } from '@nestjs/config';

const add = jest.fn();
const close = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add, close })),
}));

import {
  AdvisoryFitAssessmentQueue,
  advisoryFitJobId,
} from './advisory-fit-assessment.queue';

describe('AdvisoryFitAssessmentQueue', () => {
  it('builds a job id BullMQ will accept', () => {
    const id = advisoryFitJobId({ assessmentRequestId: 'request-1', attemptNumber: 2 });
    expect(id).toBe('request-1--attempt-2');
    // BullMQ throws "Custom Id cannot contain :" at runtime, and this suite
    // mocks bullmq, so assert the constraint directly.
    expect(id).not.toContain(':');
  });

  const enabled = () =>
    new AdvisoryFitAssessmentQueue({
      get: (key: string, fallback: unknown) =>
        key === 'ADVISORY_FIT_QUEUE_ENABLED' ? true : fallback,
      getOrThrow: () => 'redis://localhost:6379',
    } as unknown as ConfigService);

  beforeEach(() => {
    jest.clearAllMocks();
    add.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
  });

  it('keys the job by request and attempt so a retry is not deduplicated away', async () => {
    await enabled().enqueueAssessment({
      assessmentRequestId: 'request-1',
      attemptNumber: 2,
    });

    // BullMQ ignores `add` for a job id that still exists, and
    // removeOnComplete keeps the last 100 -- so keying on the request id alone
    // would make the second attempt silently never run.
    //
    // The separator must not be a colon. BullMQ reserves that for its own key
    // namespacing and rejects such an id at runtime -- which this suite cannot
    // see, because it mocks bullmq. The live queue proof is what caught it.
    expect(add).toHaveBeenCalledWith(
      'assess',
      { assessmentRequestId: 'request-1', attemptNumber: 2 },
      expect.objectContaining({
        jobId: 'request-1--attempt-2',
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      }),
    );
  });

  it('refuses to accept work it cannot process when disabled', async () => {
    const disabled = new AdvisoryFitAssessmentQueue({
      get: (key: string, fallback: unknown) =>
        key === 'ADVISORY_FIT_QUEUE_ENABLED' ? false : fallback,
      getOrThrow: () => 'redis://localhost:6379',
    } as unknown as ConfigService);

    // Failing the command is better than accepting a request that would sit in
    // `requested` until the reaper spends one of the owner's two attempts.
    await expect(
      disabled.enqueueAssessment({
        assessmentRequestId: 'request-1',
        attemptNumber: 1,
      }),
    ).rejects.toThrow('disabled');
    expect(add).not.toHaveBeenCalled();
  });

  it('schedules a repeating reaper and a bucketed catch-up', async () => {
    const queue = enabled();
    await queue.scheduleReaper();
    await queue.enqueueReapCatchUp(new Date('2026-08-02T12:00:00.000Z'));

    expect(add).toHaveBeenNthCalledWith(
      1,
      'reap',
      {},
      expect.objectContaining({
        jobId: 'advisory-fit-reaper',
        repeat: { every: 60_000 },
      }),
    );
    expect(add).toHaveBeenNthCalledWith(
      2,
      'reap',
      {},
      expect.objectContaining({ jobId: expect.stringContaining('catch-up') }),
    );
  });
});
