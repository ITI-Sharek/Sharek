import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isContributorMatchingQueueEnabled } from './contributor-matching.config';

export const CONTRIBUTOR_MATCHING_QUEUE = 'contributor-matching';
export const CONTRIBUTOR_MATCHING_JOB = 'generate';

export interface ContributorMatchingJobData {
  ownerId: string;
  requestId: string;
}

export function contributorMatchingJobId(data: ContributorMatchingJobData): string {
  return `request-${data.requestId}`;
}

@Injectable()
export class ContributorMatchingQueue implements OnModuleDestroy {
  private readonly queue: Queue<ContributorMatchingJobData> | null;

  constructor(private readonly config: ConfigService) {
    this.queue = isContributorMatchingQueueEnabled(config)
      ? new Queue<ContributorMatchingJobData>(CONTRIBUTOR_MATCHING_QUEUE, {
          connection: getRedisConnection(config),
        })
      : null;
  }

  async enqueueForPublishedRequest(data: ContributorMatchingJobData): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(CONTRIBUTOR_MATCHING_JOB, data, {
      jobId: contributorMatchingJobId(data),
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
