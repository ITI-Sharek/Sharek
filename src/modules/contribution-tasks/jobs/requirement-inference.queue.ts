import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isRequirementInferenceQueueEnabled } from './requirement-inference.config';

export const REQUIREMENT_INFERENCE_QUEUE = 'requirement-inference';
export const REQUIREMENT_INFERENCE_JOB = 'infer';

export type RequirementInferenceJobData = {
  contributionRequestId: string;
  /**
   * The draft revision the job was queued for. A later edit queues a new job
   * with a new value, so a slow run against stale content can be recognised and
   * discarded rather than overwriting rows inferred from newer text.
   */
  requestedAt: string;
};

@Injectable()
export class RequirementInferenceQueue implements OnModuleDestroy {
  private readonly logger = new Logger(RequirementInferenceQueue.name);
  private readonly queue: Queue | null;

  constructor(private readonly config: ConfigService) {
    this.queue = isRequirementInferenceQueueEnabled(config)
      ? new Queue(REQUIREMENT_INFERENCE_QUEUE, {
          connection: getRedisConnection(config),
        })
      : null;
  }

  /**
   * Never throws, and never blocks the caller's transaction outcome.
   *
   * The opposite of `AdvisoryFitAssessmentQueue.enqueueAssessment`, deliberately:
   * an Assessment Request is a durable row an owner asked for and would be
   * stranded by a dropped job, whereas inference is an optional convenience on
   * a draft. Failing a draft save because Redis is down would make the whole
   * authoring flow depend on infrastructure the product does not need — and the
   * owner can always enter the set by hand.
   */
  async enqueueInference(data: RequirementInferenceJobData): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.add(REQUIREMENT_INFERENCE_JOB, data, {
        // Keyed by revision, not by request: an edit must be able to supersede
        // an earlier run, and BullMQ ignores `add` for a job id that still
        // exists. A colon is reserved by BullMQ for its own key namespacing.
        jobId: `${data.contributionRequestId}--${Date.parse(data.requestedAt)}`,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 2_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    } catch (error) {
      this.logger.warn(
        `Could not queue requirement inference for ${data.contributionRequestId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
