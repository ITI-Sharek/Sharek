import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isDeliveryReputationQueueEnabled } from './delivery-reputation.config';

export const DELIVERY_REPUTATION_QUEUE = 'delivery-reputation';
export const DELIVERY_REPUTATION_JOB = 'project-reputation';
export type DeliveryReputationJobData = Record<string, never>;

@Injectable()
export class DeliveryReputationQueue implements OnModuleDestroy {
  private readonly queue: Queue<DeliveryReputationJobData> | null;
  private readonly intervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.intervalMs = config.get<number>(
      'DELIVERY_REPUTATION_SWEEP_INTERVAL_MS',
      60_000,
    );
    this.queue = isDeliveryReputationQueueEnabled(config)
      ? new Queue<DeliveryReputationJobData>(DELIVERY_REPUTATION_QUEUE, {
          connection: getRedisConnection(config),
        })
      : null;
  }

  async schedule(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      DELIVERY_REPUTATION_JOB,
      {},
      {
        jobId: 'scheduled-projection',
        repeat: { every: this.intervalMs },
        ...this.jobOptions(),
      },
    );
  }

  async enqueueCatchUp(now = Date.now()): Promise<void> {
    if (!this.queue) return;
    const intervalBucket = Math.floor(now / this.intervalMs);
    await this.queue.add(
      DELIVERY_REPUTATION_JOB,
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
