import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isMaterialScanQueueEnabled } from './material-scan.config';

export const MATERIAL_SCAN_QUEUE = 'material-scan';
export const MATERIAL_SCAN_JOB = 'scan';
export const MATERIAL_SCAN_REAP_JOB = 'reap';

export type MaterialScanJobData = {
  materialId: string;
  version: number;
  attemptNumber: number;
};

/**
 * Unique per attempt, not per version. BullMQ ignores `add` for a job id that
 * still exists, and removeOnComplete keeps only the last 100 -- so keying on
 * the version alone would make a reaper's re-queue silently never run.
 *
 * The separator is not a colon: BullMQ reserves that for its own key
 * namespacing and rejects a custom id containing one. That mistake cost a live
 * debugging session on the Advisory Fit queue, because the spec mocked bullmq
 * and so never saw the rejection.
 */
export function materialScanJobId(data: MaterialScanJobData): string {
  return `${data.materialId}--v${data.version}--attempt-${data.attemptNumber}`;
}

@Injectable()
export class MaterialScanQueue implements OnModuleDestroy {
  private readonly queue: Queue | null;
  private readonly reapIntervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.reapIntervalMs = config.get<number>(
      'MATERIAL_SCAN_REAP_INTERVAL_MS',
      60_000,
    );
    this.queue = isMaterialScanQueueEnabled(config)
      ? new Queue(MATERIAL_SCAN_QUEUE, {
          connection: getRedisConnection(config),
        })
      : null;
  }

  /**
   * Throws when disabled rather than silently dropping the job. A version whose
   * scan was never queued sits quarantined forever, and quarantined means
   * undownloadable -- so dropping the job quietly would hand the owner a file
   * they uploaded successfully and can never open, with nothing to explain it.
   */
  async enqueueScan(data: MaterialScanJobData): Promise<void> {
    if (!this.queue) {
      throw new Error('Material scan queue is disabled');
    }
    await this.queue.add(MATERIAL_SCAN_JOB, data, {
      jobId: materialScanJobId(data),
      ...this.jobOptions(),
    });
  }

  async scheduleReaper(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      MATERIAL_SCAN_REAP_JOB,
      {},
      {
        jobId: 'material-scan-reaper',
        repeat: { every: this.reapIntervalMs },
        ...this.jobOptions(),
      },
    );
  }

  /** Covers versions stranded while no worker was running. */
  async enqueueReapCatchUp(now: Date): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      MATERIAL_SCAN_REAP_JOB,
      {},
      {
        jobId: `material-scan-reap-catch-up-${Math.floor(now.getTime() / this.reapIntervalMs)}`,
        ...this.jobOptions(),
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private jobOptions() {
    return {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    };
  }
}
