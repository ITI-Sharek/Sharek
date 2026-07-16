import { SkillProfileGenerationStatus } from '@prisma/client';

import { SkillProfilesService } from './skill-profiles.service';
import { SkillProfileGenerationRepository } from './repositories/skill-profile-generation.repository';
import { SkillProfileGenerationQueue } from './jobs/skill-profile-generation.queue';

const generation = {
  id: 'generation-1',
  user_id: 'user-1',
  status: SkillProfileGenerationStatus.queued,
  selected_repositories: [{ fullName: 'owner/repo' }],
  evidence_snapshot: null,
  fraud_signals: null,
  evidence_quality: null,
  failure_reason: null,
  provider: null,
  model: null,
  prompt_version: null,
  schema_version: null,
  service_version: null,
  selected_repository_count: 1,
  snapshotted_repository_count: 0,
  created_at: new Date('2026-07-14T00:00:00.000Z'),
  updated_at: new Date('2026-07-14T00:00:00.000Z'),
  completed_at: null,
  skillProfiles: [],
};

function createService() {
  const generations = {
    create: jest.fn().mockResolvedValue(generation),
    findByIdForUser: jest.fn().mockResolvedValue(generation),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const queue = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new SkillProfilesService(
      generations as unknown as SkillProfileGenerationRepository,
      queue as unknown as SkillProfileGenerationQueue,
    ),
    generations,
    queue,
  };
}

describe('SkillProfilesService', () => {
  it('creates a queued generation and schedules processing', async () => {
    const { service, generations, queue } = createService();

    await expect(
      service.startGeneration({
        user: {
          id: 'user-1',
          email: 'contributor@example.com',
          role: 'contributor',
          status: 'pending',
        },
        repositories: [
          { fullName: 'owner/repo' },
          { fullName: 'owner/repo' },
        ],
      }),
    ).resolves.toMatchObject({
      generationId: 'generation-1',
      status: 'queued',
      progress: {
        selectedRepositoryCount: 1,
        snapshottedRepositoryCount: 0,
      },
    });
    expect(generations.create).toHaveBeenCalledWith({
      userId: 'user-1',
      selectedRepositories: [{ fullName: 'owner/repo' }],
    });
    expect(queue.enqueue).toHaveBeenCalledWith('generation-1');
  });

  it('rejects owners', async () => {
    const { service, generations, queue } = createService();

    await expect(
      service.startGeneration({
        user: {
          id: 'owner-1',
          email: 'owner@example.com',
          role: 'owner',
          status: 'active',
        },
        repositories: [{ fullName: 'owner/repo' }],
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(generations.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('marks the generation failed when Redis cannot accept the job', async () => {
    const { service, generations, queue } = createService();
    queue.enqueue.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      service.startGeneration({
        user: {
          id: 'user-1',
          email: 'contributor@example.com',
          role: 'contributor',
          status: 'active',
        },
        repositories: [{ fullName: 'owner/repo' }],
      }),
    ).rejects.toMatchObject({
      code: 'SKILL_PROFILE_QUEUE_UNAVAILABLE',
      statusCode: 503,
    });
    expect(generations.fail).toHaveBeenCalledWith(
      'generation-1',
      'Skill profile analysis could not be queued. Please try again.',
    );
  });

  it('rejects malformed repository names', async () => {
    const { service, generations } = createService();

    await expect(
      service.startGeneration({
        user: {
          id: 'user-1',
          email: 'contributor@example.com',
          role: 'contributor',
          status: 'active',
        },
        repositories: [{ fullName: 'not-a-full-name' }],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(generations.create).not.toHaveBeenCalled();
  });
});
