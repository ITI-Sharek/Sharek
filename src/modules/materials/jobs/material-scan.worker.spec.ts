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

import { MaterialScanWorker } from './material-scan.worker';

describe('MaterialScanWorker', () => {
  const materialId = '55555555-5555-4555-8555-555555555555';
  const queue = { scheduleReaper: jest.fn(), enqueueReapCatchUp: jest.fn() };
  const processor = { process: jest.fn() };
  const reaper = { reapStale: jest.fn() };
  const purge = { purgePending: jest.fn() };

  const config = (enabledValue: boolean) =>
    ({
      get: (key: string, fallback: unknown) =>
        key === 'MATERIAL_SCAN_QUEUE_ENABLED' ? enabledValue : fallback,
      getOrThrow: () => 'redis://localhost:6379',
    }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = null;
    queue.scheduleReaper.mockResolvedValue(undefined);
    queue.enqueueReapCatchUp.mockResolvedValue(undefined);
    processor.process.mockResolvedValue({ outcome: 'ready' });
    reaper.reapStale.mockResolvedValue({ requeued: 0, abandoned: 0, skipped: 0 });
    purge.purgePending.mockResolvedValue({ purged: 0, skipped: 0 });
  });

  async function bootstrap() {
    const worker = new MaterialScanWorker(
      config(true),
      queue as never,
      processor as never,
      reaper as never,
      purge as never,
    );
    await worker.onApplicationBootstrap();
    return worker;
  }

  it('routes each job name to its own handler', async () => {
    await bootstrap();
    if (!handler) throw new Error('worker did not register a handler');

    await handler({
      name: 'scan',
      data: { materialId, version: 2, attemptNumber: 3 },
    } as Job);
    expect(processor.process).toHaveBeenCalledWith(materialId, 2, 3);

    await handler({ name: 'reap', data: {} } as Job);
    expect(reaper.reapStale).toHaveBeenCalledTimes(1);
    // One tick drives both sweeps; a second repeating job would double the
    // Redis chatter for no gain.
    expect(purge.purgePending).toHaveBeenCalledTimes(1);
  });

  it('lets a scan failure reach BullMQ so it is retried', async () => {
    await bootstrap();
    if (!handler) throw new Error('worker did not register a handler');
    processor.process.mockRejectedValue(new Error('scanner unreachable'));

    // Swallowing this would resolve the job and leave the version to sit until
    // the reaper notices, for a fault a retry could clear in seconds.
    await expect(
      handler({
        name: 'scan',
        data: { materialId, version: 1, attemptNumber: 1 },
      } as Job),
    ).rejects.toThrow('scanner unreachable');
  });

  it('schedules the reaper and a catch-up sweep on bootstrap', async () => {
    await bootstrap();

    expect(queue.scheduleReaper).toHaveBeenCalledTimes(1);
    expect(queue.enqueueReapCatchUp).toHaveBeenCalledTimes(1);
  });

  it('starts nothing when the queue is disabled', async () => {
    const worker = new MaterialScanWorker(
      config(false),
      queue as never,
      processor as never,
      reaper as never,
      purge as never,
    );

    await worker.onApplicationBootstrap();

    expect(handler).toBeNull();
    expect(queue.scheduleReaper).not.toHaveBeenCalled();
  });

  it('ignores an unrecognised job name instead of failing it', async () => {
    await bootstrap();
    if (!handler) throw new Error('worker did not register a handler');

    await expect(
      handler({ name: 'unknown', data: {} } as Job),
    ).resolves.toBeUndefined();
    expect(processor.process).not.toHaveBeenCalled();
    expect(reaper.reapStale).not.toHaveBeenCalled();
    expect(purge.purgePending).not.toHaveBeenCalled();
  });
});
