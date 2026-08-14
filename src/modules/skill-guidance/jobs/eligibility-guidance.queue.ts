import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isEligibilityGuidanceQueueEnabled } from './eligibility-guidance.config';

export const ELIGIBILITY_GUIDANCE_QUEUE = 'eligibility-guidance';
export const ELIGIBILITY_GUIDANCE_JOB = 'generate';

export type EligibilityGuidanceJobData = { guidanceId: string };

@Injectable()
export class EligibilityGuidanceQueue implements OnModuleDestroy {
  private readonly logger = new Logger(EligibilityGuidanceQueue.name);
  private readonly queue: Queue | null;

  constructor(private readonly config: ConfigService) {
    this.queue = isEligibilityGuidanceQueueEnabled(config)
      ? new Queue(ELIGIBILITY_GUIDANCE_QUEUE, {
          connection: getRedisConnection(config),
        })
      : null;
  }

  /**
   * Never throws. The row is already written by the time this runs, so a Redis
   * outage leaves a `pending` row the contributor can see and retry — strictly
   * better than failing their request and leaving them with nothing.
   */
  async enqueueGeneration(data: EligibilityGuidanceJobData): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.add(ELIGIBILITY_GUIDANCE_JOB, data, {
        // One job per guidance row. The row id is already unique per request,
        // and BullMQ reserves the colon for its own key namespacing.
        jobId: `guidance--${data.guidanceId}`,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 2_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    } catch (error) {
      this.logger.warn(
        `Could not queue skill-gap guidance ${data.guidanceId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
