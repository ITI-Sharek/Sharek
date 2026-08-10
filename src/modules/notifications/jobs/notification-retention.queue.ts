import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isNotificationRetentionQueueEnabled } from './notification-retention.config';

export const NOTIFICATION_RETENTION_QUEUE = 'notification-retention';
export const NOTIFICATION_RETENTION_JOB = 'purge';

export type NotificationRetentionJobData = Record<string, never>;

@Injectable()
export class NotificationRetentionQueue implements OnModuleDestroy {
  private readonly queue: Queue<NotificationRetentionJobData> | null;
  private readonly intervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.intervalMs = config.get<number>(
      'NOTIFICATION_RETENTION_INTERVAL_MS',
      60_000,
    );
    this.queue = isNotificationRetentionQueueEnabled(config)
      ? new Queue<NotificationRetentionJobData>(
          NOTIFICATION_RETENTION_QUEUE,
          { connection: getRedisConnection(config) },
        )
      : null;
  }

  async schedule(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      NOTIFICATION_RETENTION_JOB,
      {},
      {
        jobId: 'scheduled-retention-purge',
        repeat: { every: this.intervalMs },
        ...this.jobOptions(),
      },
    );
  }

  async enqueueCatchUp(now = Date.now()): Promise<void> {
    if (!this.queue) return;
    const intervalBucket = Math.floor(now / this.intervalMs);
    await this.queue.add(
      NOTIFICATION_RETENTION_JOB,
      {},
      {
        jobId: `retention-purge-catch-up-${intervalBucket}`,
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
