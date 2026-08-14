import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { EligibilityGuidanceProcessorService } from '../services/eligibility-guidance-processor.service';
import { isEligibilityGuidanceQueueEnabled } from './eligibility-guidance.config';
import {
  ELIGIBILITY_GUIDANCE_JOB,
  ELIGIBILITY_GUIDANCE_QUEUE,
  EligibilityGuidanceJobData,
} from './eligibility-guidance.queue';

@Injectable()
export class EligibilityGuidanceWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EligibilityGuidanceWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: EligibilityGuidanceProcessorService,
  ) {}

  onApplicationBootstrap(): void {
    if (!isEligibilityGuidanceQueueEnabled(this.config)) return;

    this.worker = new Worker(
      ELIGIBILITY_GUIDANCE_QUEUE,
      (job) => this.handle(job),
      { connection: getRedisConnection(this.config), concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Skill-gap guidance job ${job?.id ?? 'unknown'} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error('Skill-gap guidance worker error', error.stack);
    });
  }

  /**
   * Only infrastructure faults may throw. The processor records a provider
   * failure as `failed` and resolves the job — letting an outage bubble would
   * burn all three attempts on a service that is down while the contributor
   * still sees a row stuck on `pending`.
   */
  private async handle(job: Job): Promise<void> {
    if (job.name !== ELIGIBILITY_GUIDANCE_JOB) {
      this.logger.warn(`Ignoring unknown guidance job ${job.name}`);
      return;
    }
    const { guidanceId } = job.data as EligibilityGuidanceJobData;
    await this.processor.process(guidanceId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
