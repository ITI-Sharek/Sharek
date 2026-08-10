import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { NotificationEventRecoveryService } from '../notification-event-recovery.service';
import { isNotificationEventRecoveryQueueEnabled } from './notification-event-recovery.config';
import {
  NOTIFICATION_EVENT_RECOVERY_JOB,
  NOTIFICATION_EVENT_RECOVERY_QUEUE,
  NotificationEventRecoveryJobData,
  NotificationEventRecoveryQueue,
} from './notification-event-recovery.queue';

@Injectable()
export class NotificationEventRecoveryWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationEventRecoveryWorker.name);
  private worker: Worker<NotificationEventRecoveryJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: NotificationEventRecoveryQueue,
    private readonly recovery: NotificationEventRecoveryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isNotificationEventRecoveryQueueEnabled(this.config)) return;

    this.worker = new Worker<NotificationEventRecoveryJobData>(
      NOTIFICATION_EVENT_RECOVERY_QUEUE,
      (job) => this.handle(job),
      {
        connection: getRedisConnection(this.config),
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Notification event recovery ${job?.id ?? 'unknown'} failed after ${job?.attemptsMade ?? 0} attempts`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error('Notification event recovery worker error', error.stack);
    });

    await this.queue.schedule();
    await this.queue.enqueueCatchUp();
  }

  private async handle(job: Job<NotificationEventRecoveryJobData>): Promise<void> {
    if (job.name === NOTIFICATION_EVENT_RECOVERY_JOB) {
      await this.recovery.recoverPending(new Date());
      return;
    }
    this.logger.warn(`Ignoring unknown Notification event recovery job ${job.name}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
