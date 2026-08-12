import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { ContributorMatchingService } from '../matching.service';
import { isContributorMatchingQueueEnabled } from './contributor-matching.config';
import {
  CONTRIBUTOR_MATCHING_JOB,
  CONTRIBUTOR_MATCHING_QUEUE,
  ContributorMatchingJobData,
  ContributorMatchingQueue,
} from './contributor-matching.queue';

@Injectable()
export class ContributorMatchingWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ContributorMatchingWorker.name);
  private worker: Worker<ContributorMatchingJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: ContributorMatchingQueue,
    private readonly matching: ContributorMatchingService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isContributorMatchingQueueEnabled(this.config)) return;
    this.worker = new Worker<ContributorMatchingJobData>(
      CONTRIBUTOR_MATCHING_QUEUE,
      (job) => this.handle(job),
      {
        connection: getRedisConnection(this.config),
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Contributor matching job ${job?.id ?? 'unknown'} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => this.logger.error('Contributor matching worker error', error.stack));
  }

  private async handle(job: Job<ContributorMatchingJobData>): Promise<void> {
    if (job.name !== CONTRIBUTOR_MATCHING_JOB) {
      this.logger.warn(`Ignoring unknown Contributor matching job ${job.name}`);
      return;
    }
    await this.matching.generateForPublishedRequest(job.data);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
