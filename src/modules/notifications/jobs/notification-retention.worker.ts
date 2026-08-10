import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { NotificationRetentionService } from '../notification-retention.service';
import { isNotificationRetentionQueueEnabled } from './notification-retention.config';
import {
  NOTIFICATION_RETENTION_JOB,
  NOTIFICATION_RETENTION_QUEUE,
  NotificationRetentionJobData,
  NotificationRetentionQueue,
} from './notification-retention.queue';

@Injectable()
export class NotificationRetentionWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationRetentionWorker.name);
  private worker: Worker<NotificationRetentionJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: NotificationRetentionQueue,
    private readonly retention: NotificationRetentionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isNotificationRetentionQueueEnabled(this.config)) return;

    this.worker = new Worker<NotificationRetentionJobData>(
      NOTIFICATION_RETENTION_QUEUE,
      (job) => this.handle(job),
      {
        connection: getRedisConnection(this.config),
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Notification retention purge ${job?.id ?? 'unknown'} failed after ${job?.attemptsMade ?? 0} attempts`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error('Notification retention worker error', error.stack);
    });

    await this.queue.schedule();
    await this.queue.enqueueCatchUp();
  }

  private async handle(job: Job<NotificationRetentionJobData>): Promise<void> {
    if (job.name === NOTIFICATION_RETENTION_JOB) {
      await this.retention.purgeExpired(new Date());
      return;
    }
    this.logger.warn(`Ignoring unknown Notification retention job ${job.name}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
