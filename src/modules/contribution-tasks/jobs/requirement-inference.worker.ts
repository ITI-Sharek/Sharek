import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { RequirementInferenceProcessorService } from '../services/requirement-inference-processor.service';
import { isRequirementInferenceQueueEnabled } from './requirement-inference.config';
import {
  REQUIREMENT_INFERENCE_JOB,
  REQUIREMENT_INFERENCE_QUEUE,
  RequirementInferenceJobData,
} from './requirement-inference.queue';

@Injectable()
export class RequirementInferenceWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RequirementInferenceWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: RequirementInferenceProcessorService,
  ) {}

  onApplicationBootstrap(): void {
    if (!isRequirementInferenceQueueEnabled(this.config)) return;

    this.worker = new Worker(
      REQUIREMENT_INFERENCE_QUEUE,
      (job) => this.handle(job),
      {
        connection: getRedisConnection(this.config),
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Requirement inference job ${job?.id ?? 'unknown'} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error('Requirement inference worker error', error.stack);
    });
  }

  /**
   * Only infrastructure faults may throw from here.
   *
   * The processor records a provider failure as a retriable status on the draft
   * and resolves the job. Letting a provider outage bubble would burn BullMQ's
   * three attempts on a service that is down and write three identical audit
   * rows, while the owner still sees nothing explaining the empty skill list.
   */
  private async handle(job: Job): Promise<void> {
    if (job.name !== REQUIREMENT_INFERENCE_JOB) {
      this.logger.warn(`Ignoring unknown requirement inference job ${job.name}`);
      return;
    }
    const { contributionRequestId, requestedAt } =
      job.data as RequirementInferenceJobData;
    await this.processor.process(contributionRequestId, new Date(requestedAt));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
