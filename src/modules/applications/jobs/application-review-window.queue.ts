import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';

export const APPLICATION_REVIEW_WINDOW_QUEUE = 'application-review-window';

export type ApplicationReviewWindowJobData = Record<string, never>;

@Injectable()
export class ApplicationReviewWindowQueue implements OnModuleDestroy {
  private readonly queue: Queue<ApplicationReviewWindowJobData> | null;
  private readonly intervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.intervalMs = this.config.get<number>(
      'APPLICATION_REVIEW_SWEEP_INTERVAL_MS',
      60_000,
    );
    this.queue = this.isEnabled()
      ? new Queue<ApplicationReviewWindowJobData>(
          APPLICATION_REVIEW_WINDOW_QUEUE,
          { connection: getRedisConnection(this.config) },
        )
      : null;
  }

  async schedule(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add('sweep', {}, {
      jobId: 'scheduled-sweep',
      repeat: { every: this.intervalMs },
      ...this.jobOptions(),
    });
  }

  async enqueueCatchUp(now = Date.now()): Promise<void> {
    if (!this.queue) return;
    const intervalBucket = Math.floor(now / this.intervalMs);
    await this.queue.add('sweep', {}, {
      jobId: `catch-up-${intervalBucket}`,
      ...this.jobOptions(),
    });
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

  private isEnabled(): boolean {
    return this.config.get<boolean>(
      'APPLICATION_REVIEW_QUEUE_ENABLED',
      this.config.get<string>('NODE_ENV', 'development') !== 'test',
    );
  }
}
