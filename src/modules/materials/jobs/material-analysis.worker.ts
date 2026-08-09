import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { MaterialAnalysisService } from '../services/material-analysis.service';
import { MaterialAnalysisReaperService } from '../services/material-analysis-reaper.service';
import { isMaterialAnalysisQueueEnabled } from './material-analysis.config';
import {
  MATERIAL_ANALYSIS_QUEUE,
  MATERIAL_ANALYSIS_REAP_JOB,
  MATERIAL_ANALYSIS_RUN_JOB,
  MaterialAnalysisQueue,
  MaterialAnalysisRunJobData,
} from './material-analysis.queue';

@Injectable()
export class MaterialAnalysisWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MaterialAnalysisWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: MaterialAnalysisQueue,
    private readonly analysis: MaterialAnalysisService,
    private readonly reaper: MaterialAnalysisReaperService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isMaterialAnalysisQueueEnabled(this.config)) return;
    this.worker = new Worker(MATERIAL_ANALYSIS_QUEUE, (job) => this.handle(job), {
      connection: getRedisConnection(this.config),
      concurrency: 1,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Material analysis job ${job?.name ?? 'unknown'} ${job?.id ?? ''} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => this.logger.error('Material analysis worker error', error.stack));
    await this.queue.scheduleReaper();
    await this.queue.enqueueReapCatchUp(new Date());
  }

  private async handle(job: Job): Promise<void> {
    if (job.name === MATERIAL_ANALYSIS_REAP_JOB) {
      await this.reaper.reapStale(new Date());
      return;
    }
    if (job.name === MATERIAL_ANALYSIS_RUN_JOB) {
      await this.analysis.processRun((job.data as MaterialAnalysisRunJobData).runId);
      return;
    }
    this.logger.warn(`Ignoring unknown Material analysis job ${job.name}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
