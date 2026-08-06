import { ConfigService } from '@nestjs/config';

const add = jest.fn();
const close = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add, close })),
}));

import { MaterialScanQueue, materialScanJobId } from './material-scan.queue';

describe('MaterialScanQueue', () => {
  const materialId = '55555555-5555-4555-8555-555555555555';

  it('builds a job id BullMQ will accept', () => {
    const id = materialScanJobId({ materialId, version: 2, attemptNumber: 3 });

    expect(id).toBe(`${materialId}--v2--attempt-3`);
    // BullMQ throws "Custom Id cannot contain :" at runtime, and this suite
    // mocks bullmq, so the constraint is asserted directly. The Advisory Fit
    // queue shipped with a colon in its id and every request 500'd live,
    // precisely because its spec mocked bullmq and never saw the rejection.
    expect(id).not.toContain(':');
  });

  const enabled = () =>
    new MaterialScanQueue({
      get: (key: string, fallback: unknown) =>
        key === 'MATERIAL_SCAN_QUEUE_ENABLED' ? true : fallback,
      getOrThrow: () => 'redis://localhost:6379',
    } as unknown as ConfigService);

  beforeEach(() => {
    jest.clearAllMocks();
    add.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
  });

  it('keys the job by version and attempt so a re-queue is not deduplicated away', async () => {
    await enabled().enqueueScan({ materialId, version: 2, attemptNumber: 3 });

    expect(add).toHaveBeenCalledWith(
      'scan',
      { materialId, version: 2, attemptNumber: 3 },
      expect.objectContaining({
        jobId: `${materialId}--v2--attempt-3`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      }),
    );
  });

  it('distinguishes two versions of the same Material', async () => {
    // Keying on the Material alone would let version 2's scan be swallowed as
    // a duplicate of version 1's, leaving it quarantined and unopenable.
    expect(materialScanJobId({ materialId, version: 1, attemptNumber: 1 })).not.toBe(
      materialScanJobId({ materialId, version: 2, attemptNumber: 1 }),
    );
  });

  it('refuses to accept work it cannot process when disabled', async () => {
    const disabled = new MaterialScanQueue({
      get: (key: string, fallback: unknown) =>
        key === 'MATERIAL_SCAN_QUEUE_ENABLED' ? false : fallback,
      getOrThrow: () => 'redis://localhost:6379',
    } as unknown as ConfigService);

    // Silently dropping the job would hand the owner a file that uploaded
    // successfully, sits quarantined forever, and can never be opened.
    await expect(
      disabled.enqueueScan({ materialId, version: 1, attemptNumber: 1 }),
    ).rejects.toThrow('disabled');
    expect(add).not.toHaveBeenCalled();
  });

  it('schedules a repeating reaper and a bucketed catch-up', async () => {
    const queue = enabled();
    await queue.scheduleReaper();
    await queue.enqueueReapCatchUp(new Date('2026-08-07T12:00:00.000Z'));

    expect(add).toHaveBeenNthCalledWith(
      1,
      'reap',
      {},
      expect.objectContaining({
        jobId: 'material-scan-reaper',
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
