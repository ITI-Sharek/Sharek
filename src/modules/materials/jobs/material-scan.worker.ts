import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { MaterialScanProcessorService } from '../services/material-scan-processor.service';
import { MaterialScanReaperService } from '../services/material-scan-reaper.service';
import { isMaterialScanQueueEnabled } from './material-scan.config';
import {
  MATERIAL_SCAN_JOB,
  MATERIAL_SCAN_QUEUE,
  MATERIAL_SCAN_REAP_JOB,
  MaterialScanJobData,
  MaterialScanQueue,
} from './material-scan.queue';

@Injectable()
export class MaterialScanWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MaterialScanWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: MaterialScanQueue,
    private readonly processor: MaterialScanProcessorService,
    private readonly reaper: MaterialScanReaperService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isMaterialScanQueueEnabled(this.config)) return;

    this.worker = new Worker(MATERIAL_SCAN_QUEUE, (job) => this.handle(job), {
      connection: getRedisConnection(this.config),
      concurrency: 2,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Material scan job ${job?.name ?? 'unknown'} ${job?.id ?? ''} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error('Material scan worker error', error.stack);
    });

    await this.queue.scheduleReaper();
    await this.queue.enqueueReapCatchUp(new Date());
  }

  /**
   * Only infrastructure failures may throw from here, and for this queue they
   * are the ones worth retrying: an unreachable scanner or unreadable storage
   * is transient, while every verdict the scanner does produce is already
   * persisted by the processor and resolves the job.
   */
  private async handle(job: Job): Promise<void> {
    if (job.name === MATERIAL_SCAN_REAP_JOB) {
      await this.reaper.reapStale(new Date());
      return;
    }
    if (job.name === MATERIAL_SCAN_JOB) {
      const { materialId, version, attemptNumber } =
        job.data as MaterialScanJobData;
      await this.processor.process(materialId, version, attemptNumber);
      return;
    }
    this.logger.warn(`Ignoring unknown Material scan job name ${job.name}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
