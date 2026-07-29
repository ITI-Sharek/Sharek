import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { ApplicationReviewWindowService } from '../services/application-review-window.service';
import {
  APPLICATION_REVIEW_WINDOW_QUEUE,
  ApplicationReviewWindowJobData,
  ApplicationReviewWindowQueue,
} from './application-review-window.queue';

@Injectable()
export class ApplicationReviewWindowWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ApplicationReviewWindowWorker.name);
  private worker: Worker<ApplicationReviewWindowJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: ApplicationReviewWindowQueue,
    private readonly processor: ApplicationReviewWindowService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.isEnabled()) return;

    this.worker = new Worker<ApplicationReviewWindowJobData>(
      APPLICATION_REVIEW_WINDOW_QUEUE,
      () => this.processor.processDue(new Date()),
      {
        connection: getRedisConnection(this.config),
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Application review sweep ${job?.id ?? 'unknown'} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => this.logger.error(error));

    await this.queue.schedule();
    await this.queue.enqueueCatchUp();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private isEnabled(): boolean {
    return this.config.get<boolean>(
      'APPLICATION_REVIEW_QUEUE_ENABLED',
      this.config.get<string>('NODE_ENV', 'development') !== 'test',
    );
  }
}
