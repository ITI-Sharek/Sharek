import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { AdvisoryFitAssessmentProcessorService } from '../services/advisory-fit-assessment-processor.service';
import { AdvisoryFitAssessmentReaperService } from '../services/advisory-fit-assessment-reaper.service';
import { isAdvisoryFitQueueEnabled } from './advisory-fit-assessment.config';
import {
  ADVISORY_FIT_ASSESS_JOB,
  ADVISORY_FIT_ASSESSMENT_QUEUE,
  ADVISORY_FIT_REAP_JOB,
  AdvisoryFitAssessJobData,
  AdvisoryFitAssessmentQueue,
} from './advisory-fit-assessment.queue';

@Injectable()
export class AdvisoryFitAssessmentWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AdvisoryFitAssessmentWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: AdvisoryFitAssessmentQueue,
    private readonly processor: AdvisoryFitAssessmentProcessorService,
    private readonly reaper: AdvisoryFitAssessmentReaperService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isAdvisoryFitQueueEnabled(this.config)) return;

    this.worker = new Worker(
      ADVISORY_FIT_ASSESSMENT_QUEUE,
      (job) => this.handle(job),
      {
        connection: getRedisConnection(this.config),
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Advisory Fit job ${job?.name ?? 'unknown'} ${job?.id ?? ''} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error('Advisory Fit worker error', error.stack);
    });

    await this.queue.scheduleReaper();
    await this.queue.enqueueReapCatchUp(new Date());
  }

  /**
   * Only infrastructure failures may throw from here. Provider outcomes are
   * persisted by the processor and resolve the job, because BullMQ's retry
   * budget and the provider attempt budget are different: letting a provider
   * failure bubble would retry it three times and write three attempt rows
   * against a two-attempt limit.
   */
  private async handle(job: Job): Promise<void> {
    if (job.name === ADVISORY_FIT_REAP_JOB) {
      await this.reaper.reapStale(new Date());
      return;
    }
    if (job.name === ADVISORY_FIT_ASSESS_JOB) {
      const { assessmentRequestId, attemptNumber } =
        job.data as AdvisoryFitAssessJobData;
      await this.processor.process(assessmentRequestId, attemptNumber);
      return;
    }
    this.logger.warn(`Ignoring unknown Advisory Fit job name ${job.name}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
