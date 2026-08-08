import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { SkillProfileGenerationRepository } from '../repositories/skill-profile-generation.repository';
import { SkillProfileGenerationService } from '../services/skill-profile-generation.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  SKILL_PROFILE_GENERATION_QUEUE,
  SkillProfileGenerationJobData,
  SkillProfileGenerationQueue,
} from './skill-profile-generation.queue';

@Injectable()
export class SkillProfileGenerationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SkillProfileGenerationWorker.name);
  private worker: Worker<SkillProfileGenerationJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly generations: SkillProfileGenerationRepository,
    private readonly queue: SkillProfileGenerationQueue,
    private readonly processor: SkillProfileGenerationService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    this.worker = new Worker<SkillProfileGenerationJobData>(
      SKILL_PROFILE_GENERATION_QUEUE,
      (job) => this.processor.process(job.data.generationId),
      {
        connection: getRedisConnection(this.config),
        concurrency: this.config.get<number>(
          'SKILL_PROFILE_QUEUE_CONCURRENCY',
          2,
        ),
      },
    );
    this.worker.on('failed', (job, error) => {
      void this.handleFinalFailure(job, error);
    });
    this.worker.on('error', (error) => this.logger.error(error));

    await this.recoverIncompleteGenerations();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async recoverIncompleteGenerations(): Promise<void> {
    const incomplete = await this.generations.findIncomplete();

    for (const generation of incomplete) {
      if (!(await this.queue.hasJob(generation.id))) {
        await this.queue.enqueue(generation.id);
      }
    }
  }

  private async handleFinalFailure(
    job: Job<SkillProfileGenerationJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    this.logger.error(
      `Skill profile generation ${job.data.generationId} failed after retries`,
      error.stack,
    );
    let generation = null;
    if (this.notifications) {
      try {
        generation = await this.generations.findById(job.data.generationId);
      } catch (lookupError) {
        this.logger.warn(
          `Could not load failed skill generation ${job.data.generationId} for notification`,
          lookupError instanceof Error ? lookupError.message : String(lookupError),
        );
      }
    }
    await this.generations.fail(
      job.data.generationId,
      'Skill profile analysis could not be completed. Please try again.',
    );
    if (generation && this.notifications) {
      try {
        await this.notifications.createSkillProfileGenerationNotification({
          userId: generation.user_id,
          generationId: job.data.generationId,
          status: 'failed',
        });
      } catch (notificationError) {
        this.logger.warn(
          `Could not create failure notification for skill generation ${job.data.generationId}`,
          notificationError instanceof Error
            ? notificationError.message
            : String(notificationError),
        );
      }
    }
  }

  private isEnabled(): boolean {
    return this.config.get<boolean>(
      'SKILL_PROFILE_QUEUE_ENABLED',
      this.config.get<string>('NODE_ENV', 'development') !== 'test',
    );
  }
}
