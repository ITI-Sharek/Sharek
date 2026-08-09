import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isMaterialAnalysisQueueEnabled } from './material-analysis.config';

export const MATERIAL_ANALYSIS_QUEUE = 'material-analysis';
export const MATERIAL_ANALYSIS_RUN_JOB = 'run';
export const MATERIAL_ANALYSIS_REAP_JOB = 'reap';

export type MaterialAnalysisRunJobData = { runId: string };

export function materialAnalysisRunJobId(runId: string): string {
  return `material-analysis--${runId}`;
}

@Injectable()
export class MaterialAnalysisQueue implements OnModuleDestroy {
  private readonly queue: Queue | null;
  private readonly reapIntervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.reapIntervalMs = config.get<number>(
      'MATERIAL_ANALYSIS_REAP_INTERVAL_MS',
      60_000,
    );
    this.queue = isMaterialAnalysisQueueEnabled(config)
      ? new Queue(MATERIAL_ANALYSIS_QUEUE, {
          connection: getRedisConnection(config),
        })
      : null;
  }

  async enqueueRun(data: MaterialAnalysisRunJobData): Promise<void> {
    if (!this.queue) throw new Error('Material analysis queue is disabled');
    await this.queue.add(MATERIAL_ANALYSIS_RUN_JOB, data, {
      jobId: materialAnalysisRunJobId(data.runId),
      ...this.jobOptions(),
    });
  }

  async scheduleReaper(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      MATERIAL_ANALYSIS_REAP_JOB,
      {},
      {
        jobId: 'material-analysis-reaper',
        repeat: { every: this.reapIntervalMs },
        ...this.jobOptions(),
      },
    );
  }

  async enqueueReapCatchUp(now: Date): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      MATERIAL_ANALYSIS_REAP_JOB,
      {},
      {
        jobId: `material-analysis-reap-catch-up-${Math.floor(now.getTime() / this.reapIntervalMs)}`,
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
