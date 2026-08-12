import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { DeliveryReputationProjectionService } from '../delivery-reputation-projection.service';
import { isDeliveryReputationQueueEnabled } from './delivery-reputation.config';
import {
  DELIVERY_REPUTATION_JOB,
  DELIVERY_REPUTATION_QUEUE,
  DeliveryReputationJobData,
  DeliveryReputationQueue,
} from './delivery-reputation.queue';

@Injectable()
export class DeliveryReputationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(DeliveryReputationWorker.name);
  private worker: Worker<DeliveryReputationJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: DeliveryReputationQueue,
    private readonly projection: DeliveryReputationProjectionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isDeliveryReputationQueueEnabled(this.config)) return;
    this.worker = new Worker<DeliveryReputationJobData>(
      DELIVERY_REPUTATION_QUEUE,
      (job) => this.handle(job),
      {
        connection: getRedisConnection(this.config),
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Delivery reputation projection ${job?.id ?? 'unknown'} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => this.logger.error(error));
    await this.queue.schedule();
    await this.queue.enqueueCatchUp();
  }

  private async handle(job: Job<DeliveryReputationJobData>): Promise<void> {
    if (job.name !== DELIVERY_REPUTATION_JOB) {
      this.logger.warn(`Ignoring unknown Delivery reputation job ${job.name}`);
      return;
    }
    const processedAt = new Date();
    await this.projection.processPendingApprovals(100, processedAt);
    await this.projection.reconcileAssignedContributors(500, processedAt);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
