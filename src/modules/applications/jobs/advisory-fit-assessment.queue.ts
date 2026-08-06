import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isAdvisoryFitQueueEnabled } from './advisory-fit-assessment.config';

export const ADVISORY_FIT_ASSESSMENT_QUEUE = 'advisory-fit-assessment';
export const ADVISORY_FIT_ASSESS_JOB = 'assess';
export const ADVISORY_FIT_REAP_JOB = 'reap';

export type AdvisoryFitAssessJobData = {
  assessmentRequestId: string;
  attemptNumber: number;
};

export function advisoryFitJobId(data: AdvisoryFitAssessJobData): string {
  return `${data.assessmentRequestId}--attempt-${data.attemptNumber}`;
}

@Injectable()
export class AdvisoryFitAssessmentQueue implements OnModuleDestroy {
  private readonly queue: Queue | null;
  private readonly reapIntervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.reapIntervalMs = config.get<number>(
      'ADVISORY_FIT_REAP_INTERVAL_MS',
      60_000,
    );
    this.queue = isAdvisoryFitQueueEnabled(config)
      ? new Queue(ADVISORY_FIT_ASSESSMENT_QUEUE, {
          connection: getRedisConnection(config),
        })
      : null;
  }

  /**
   * Throws when disabled rather than silently dropping the job. An Assessment
   * Request that can never be processed is worse than a failed command: it
   * would sit in `requested` until the reaper marks it unavailable, spending
   * one of the owner's two provider attempts on work that never ran.
   */
  async enqueueAssessment(data: AdvisoryFitAssessJobData): Promise<void> {
    if (!this.queue) {
      throw new Error('Advisory Fit assessment queue is disabled');
    }
    await this.queue.add(ADVISORY_FIT_ASSESS_JOB, data, {
      // Per attempt, not per request. BullMQ ignores `add` for a job id that
      // still exists, and removeOnComplete keeps the last 100 — so keying on
      // the request id alone would make the second attempt silently never run.
      // The separator is not a colon: BullMQ reserves that for its own key
      // namespacing and rejects a custom id containing one.
      jobId: advisoryFitJobId(data),
      ...this.jobOptions(),
    });
  }

  async scheduleReaper(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      ADVISORY_FIT_REAP_JOB,
      {},
      {
        jobId: 'advisory-fit-reaper',
        repeat: { every: this.reapIntervalMs },
        ...this.jobOptions(),
      },
    );
  }

  /** Covers rows stranded while no worker was running. */
  async enqueueReapCatchUp(now: Date): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      ADVISORY_FIT_REAP_JOB,
      {},
      {
        jobId: `advisory-fit-reap-catch-up-${Math.floor(now.getTime() / this.reapIntervalMs)}`,
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
