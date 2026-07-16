import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionOptions, Queue } from 'bullmq';

export const SKILL_PROFILE_GENERATION_QUEUE = 'skill-profile-generation';

export interface SkillProfileGenerationJobData {
  generationId: string;
}

@Injectable()
export class SkillProfileGenerationQueue implements OnModuleDestroy {
  private readonly queue: Queue<SkillProfileGenerationJobData> | null;

  constructor(private readonly config: ConfigService) {
    this.queue = this.isEnabled()
      ? new Queue<SkillProfileGenerationJobData>(SKILL_PROFILE_GENERATION_QUEUE, {
          connection: getRedisConnection(this.config),
        })
      : null;
  }

  async enqueue(generationId: string): Promise<void> {
    if (!this.queue) {
      throw new Error('Skill profile generation queue is disabled');
    }

    await this.queue.add(
      'generate',
      { generationId },
      {
        jobId: generationId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }

  async hasJob(generationId: string): Promise<boolean> {
    if (!this.queue) {
      return false;
    }

    const job = await this.queue.getJob(generationId);
    if (!job) {
      return false;
    }

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      await job.remove();
      return false;
    }

    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private isEnabled(): boolean {
    return this.config.get<boolean>(
      'SKILL_PROFILE_QUEUE_ENABLED',
      this.config.get<string>('NODE_ENV', 'development') !== 'test',
    );
  }
}

export function getRedisConnection(config: ConfigService): ConnectionOptions {
  const redisUrl = new URL(
    config.get<string>('REDIS_URL', 'redis://localhost:6379'),
  );

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
