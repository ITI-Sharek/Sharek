import { ConfigService } from '@nestjs/config';

const workerHandlers = new Map<string, (...args: unknown[]) => unknown>();
let jobProcessor: ((job: { data: { generationId: string } }) => Promise<void>) | null =
  null;

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_name: string, processor: typeof jobProcessor) => {
      jobProcessor = processor;
      return {
        on: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
          workerHandlers.set(event, handler);
        }),
        close: jest.fn(),
      };
    },
  ),
}));

import { SkillProfileGenerationWorker } from './skill-profile-generation.worker';

describe('SkillProfileGenerationWorker', () => {
  function createWorker() {
    const generations = {
      findIncomplete: jest.fn().mockResolvedValue([]),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      hasJob: jest.fn().mockResolvedValue(false),
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    const processor = { process: jest.fn().mockResolvedValue(undefined) };
    const config = new ConfigService({
      SKILL_PROFILE_QUEUE_ENABLED: true,
      SKILL_PROFILE_QUEUE_CONCURRENCY: 1,
      REDIS_URL: 'redis://localhost:6379',
    });
    return {
      worker: new SkillProfileGenerationWorker(
        config,
        generations as never,
        queue as never,
        processor as never,
      ),
      generations,
      queue,
      processor,
    };
  }

  beforeEach(() => {
    workerHandlers.clear();
    jobProcessor = null;
    jest.clearAllMocks();
  });

  it('lets access removal between enqueue and processing fail for BullMQ retry', async () => {
    const { worker, processor, generations } = createWorker();
    processor.process.mockRejectedValueOnce(
      Object.assign(new Error('repository removed'), {
        code: 'GITHUB_APP_REPOSITORY_ACCESS_REVOKED',
      }),
    );
    await worker.onApplicationBootstrap();
    await expect(
      jobProcessor?.({ data: { generationId: 'generation-1' } }),
    ).rejects.toMatchObject({ code: 'GITHUB_APP_REPOSITORY_ACCESS_REVOKED' });
    expect(generations.fail).not.toHaveBeenCalled();
  });

  it('lets retryable provider failures propagate without inventing evidence', async () => {
    const { worker, processor, generations } = createWorker();
    processor.process.mockRejectedValueOnce(
      Object.assign(new Error('provider unavailable'), {
        code: 'GITHUB_APP_PROVIDER_UNAVAILABLE',
      }),
    );
    await worker.onApplicationBootstrap();
    await expect(
      jobProcessor?.({ data: { generationId: 'generation-2' } }),
    ).rejects.toMatchObject({ code: 'GITHUB_APP_PROVIDER_UNAVAILABLE' });
    expect(generations.fail).not.toHaveBeenCalled();
  });

  it('records a safe failure only after the final BullMQ attempt', async () => {
    const { worker, generations } = createWorker();
    await worker.onApplicationBootstrap();
    const failed = workerHandlers.get('failed');
    expect(failed).toBeDefined();
    await failed?.(
      {
        data: { generationId: 'generation-3' },
        attemptsMade: 2,
        opts: { attempts: 3 },
      },
      new Error('still retrying'),
    );
    expect(generations.fail).not.toHaveBeenCalled();

    await failed?.(
      {
        data: { generationId: 'generation-3' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      },
      new Error('final failure'),
    );
    expect(generations.fail).toHaveBeenCalledWith(
      'generation-3',
      'Skill profile analysis could not be completed. Please try again.',
    );
  });
});
