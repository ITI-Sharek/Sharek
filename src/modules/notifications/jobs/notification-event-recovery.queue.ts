import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isNotificationEventRecoveryQueueEnabled } from './notification-event-recovery.config';

export const NOTIFICATION_EVENT_RECOVERY_QUEUE = 'notification-event-recovery';
export const NOTIFICATION_EVENT_RECOVERY_JOB = 'recover';

export type NotificationEventRecoveryJobData = Record<string, never>;

@Injectable()
export class NotificationEventRecoveryQueue implements OnModuleDestroy {
  private readonly queue: Queue<NotificationEventRecoveryJobData> | null;
  private readonly intervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.intervalMs = config.get<number>(
      'NOTIFICATION_EVENT_RECOVERY_INTERVAL_MS',
      60_000,
    );
    this.queue = isNotificationEventRecoveryQueueEnabled(config)
      ? new Queue<NotificationEventRecoveryJobData>(
          NOTIFICATION_EVENT_RECOVERY_QUEUE,
          { connection: getRedisConnection(config) },
        )
      : null;
  }

  async schedule(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      NOTIFICATION_EVENT_RECOVERY_JOB,
      {},
      {
        jobId: 'scheduled-recovery',
        repeat: { every: this.intervalMs },
        ...this.jobOptions(),
      },
    );
  }

  async enqueueCatchUp(now = Date.now()): Promise<void> {
    if (!this.queue) return;
    const intervalBucket = Math.floor(now / this.intervalMs);
    await this.queue.add(
      NOTIFICATION_EVENT_RECOVERY_JOB,
      {},
      {
        jobId: `catch-up-${intervalBucket}`,
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
