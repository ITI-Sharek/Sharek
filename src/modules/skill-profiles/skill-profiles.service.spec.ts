import { SkillProfileGenerationStatus } from '@prisma/client';

import { GitHubAppService } from '../github/services/github-app.service';
import { SkillProfilesService } from './skill-profiles.service';
import { SkillProfileGenerationRepository } from './repositories/skill-profile-generation.repository';
import { SkillProfileGenerationQueue } from './jobs/skill-profile-generation.queue';

const generation = {
  id: 'generation-1',
  user_id: 'user-1',
  status: SkillProfileGenerationStatus.queued,
  selected_repositories: [{ repositoryId: '123', fullName: 'owner/repo' }],
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
  github_app_installation_link_id: '00000000-0000-4000-8000-000000000001',
  provider_installation_id: '987',
  consent_version: 'github-skill-analysis-v1',
  consented_at: new Date('2026-07-27T00:00:00.000Z'),
  authorization_verified_at: new Date('2026-07-27T00:00:00.000Z'),
  authorization_failure_code: null,
  retry_of_generation_id: null,
  created_at: new Date('2026-07-27T00:00:00.000Z'),
  updated_at: new Date('2026-07-27T00:00:00.000Z'),
  completed_at: null,
  skillProfiles: [],
};

function createService() {
  const generations = {
    create: jest.fn().mockResolvedValue(generation),
    findByIdForUser: jest.fn().mockResolvedValue(generation),
    findLatestForUser: jest.fn().mockResolvedValue(generation),
    findActiveForUser: jest.fn().mockResolvedValue(null),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const gitHubApp = {
    verifyRepositorySelection: jest.fn().mockResolvedValue({
      installationLinkId: '00000000-0000-4000-8000-000000000001',
      providerInstallationId: '987',
      verifiedAt: new Date('2026-07-27T00:00:00.000Z'),
      repositories: [{ repositoryId: '123', fullName: 'owner/repo' }],
    }),
  };
  return {
    service: new SkillProfilesService(
      generations as unknown as SkillProfileGenerationRepository,
      queue as unknown as SkillProfileGenerationQueue,
      gitHubApp as unknown as GitHubAppService,
    ),
    generations,
    queue,
    gitHubApp,
  };
}

const contributor = {
  id: 'user-1',
  email: 'contributor@example.com',
  role: 'contributor' as const,
  status: 'active' as const,
};
const validRequest = {
  user: contributor,
  installationLinkId: '00000000-0000-4000-8000-000000000001',
  repositoryIds: ['123'],
  consent: { accepted: true, version: 'github-skill-analysis-v1' },
};

describe('SkillProfilesService', () => {
  it('requires explicit consent and server-validated immutable repository IDs', async () => {
    const { service, generations, queue, gitHubApp } = createService();
    await expect(service.startGeneration(validRequest)).resolves.toMatchObject({
      generationId: 'generation-1',
      status: 'queued',
    });
    expect(gitHubApp.verifyRepositorySelection).toHaveBeenCalledWith(
      'user-1',
      validRequest.installationLinkId,
      ['123'],
    );
    expect(generations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        selectedRepositories: [{ repositoryId: '123', fullName: 'owner/repo' }],
        consentVersion: 'github-skill-analysis-v1',
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith('generation-1');
  });

  it.each([
    [{ accepted: false, version: 'github-skill-analysis-v1' }],
    [{ accepted: true, version: 'stale-version' }],
  ])('rejects missing or stale consent', async (consent) => {
    const { service, generations } = createService();
    await expect(service.startGeneration({ ...validRequest, consent })).rejects.toMatchObject({
      code: 'SKILL_PROFILE_ANALYSIS_CONSENT_REQUIRED',
    });
    expect(generations.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate repository IDs', async () => {
    const { service } = createService();
    await expect(
      service.startGeneration({ ...validRequest, repositoryIds: ['123', '123'] }),
    ).rejects.toMatchObject({ code: 'SKILL_PROFILE_REPOSITORY_SELECTION_DUPLICATE' });
  });

  it('rejects repository-backed generation when no installation can be verified', async () => {
    const { service, gitHubApp, generations } = createService();
    gitHubApp.verifyRepositorySelection.mockRejectedValueOnce(
      Object.assign(new Error('installation required'), {
        code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
        statusCode: 403,
      }),
    );
    await expect(service.startGeneration(validRequest)).rejects.toMatchObject({
      code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
    });
    expect(generations.create).not.toHaveBeenCalled();
  });

  it('rejects owners before provider access', async () => {
    const { service, gitHubApp } = createService();
    await expect(
      service.startGeneration({
        ...validRequest,
        user: { ...contributor, role: 'owner' },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(gitHubApp.verifyRepositorySelection).not.toHaveBeenCalled();
  });

  it('marks the generation failed when Redis cannot accept the job', async () => {
    const { service, generations, queue } = createService();
    queue.enqueue.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(service.startGeneration(validRequest)).rejects.toMatchObject({
      code: 'SKILL_PROFILE_QUEUE_UNAVAILABLE',
      statusCode: 503,
    });
    expect(generations.fail).toHaveBeenCalled();
  });

  it('enforces the ten-repository selection limit', async () => {
    const { service } = createService();
    await expect(
      service.startGeneration({
        ...validRequest,
        repositoryIds: Array.from({ length: 11 }, (_, index) => String(index + 1)),
      }),
    ).rejects.toMatchObject({
      code: 'SKILL_PROFILE_REPOSITORY_SELECTION_LIMIT_EXCEEDED',
    });
  });

  it('rejects duplicate active generations before provider validation', async () => {
    const { service, generations, gitHubApp } = createService();
    generations.findActiveForUser.mockResolvedValueOnce(generation);
    await expect(service.startGeneration(validRequest)).rejects.toMatchObject({
      code: 'SKILL_PROFILE_GENERATION_ALREADY_ACTIVE',
      metadata: { generationId: 'generation-1' },
    });
    expect(gitHubApp.verifyRepositorySelection).not.toHaveBeenCalled();
  });

  it('returns the authenticated user latest generation for reload recovery', async () => {
    const { service, generations } = createService();

    await expect(service.getLatestGeneration('user-1')).resolves.toMatchObject({
      generationId: 'generation-1',
      status: 'queued',
    });
    expect(generations.findLatestForUser).toHaveBeenCalledWith('user-1');
  });

  it('returns a stable not-found error when the user has no generation', async () => {
    const { service, generations } = createService();
    generations.findLatestForUser.mockResolvedValueOnce(null);

    await expect(service.getLatestGeneration('user-1')).rejects.toMatchObject({
      code: 'SKILL_PROFILE_GENERATION_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('propagates foreign, revoked, or removed installation selection failures', async () => {
    const { service, gitHubApp } = createService();
    gitHubApp.verifyRepositorySelection.mockRejectedValueOnce(
      Object.assign(new Error('foreign installation'), {
        code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
        statusCode: 403,
      }),
    );
    await expect(service.startGeneration(validRequest)).rejects.toMatchObject({
      code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
    });
  });

  it('allows retry only for an owned terminal generation with new consent', async () => {
    const { service, generations, gitHubApp, queue } = createService();
    generations.findByIdForUser
      .mockResolvedValueOnce({
        ...generation,
        status: SkillProfileGenerationStatus.failed,
      })
      .mockResolvedValueOnce(generation);

    await expect(
      service.retryGeneration({
        user: contributor,
        generationId: 'prior-generation',
        consent: { accepted: true, version: 'github-skill-analysis-v1' },
      }),
    ).resolves.toMatchObject({ generationId: 'generation-1' });
    expect(gitHubApp.verifyRepositorySelection).toHaveBeenCalledWith(
      'user-1',
      generation.github_app_installation_link_id,
      ['123'],
    );
    expect(generations.create).toHaveBeenCalledWith(
      expect.objectContaining({ retryOfGenerationId: 'generation-1' }),
    );
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('returns the active generation ID when a duplicate retry races', async () => {
    const { service, generations, gitHubApp } = createService();
    generations.findActiveForUser.mockResolvedValueOnce(generation);

    await expect(
      service.retryGeneration({
        user: contributor,
        generationId: 'prior-generation',
        consent: { accepted: true, version: 'github-skill-analysis-v1' },
      }),
    ).rejects.toMatchObject({
      code: 'SKILL_PROFILE_GENERATION_ALREADY_ACTIVE',
      metadata: { generationId: 'generation-1' },
    });
    expect(generations.findByIdForUser).not.toHaveBeenCalled();
    expect(gitHubApp.verifyRepositorySelection).not.toHaveBeenCalled();
  });

  it.each([
    [null, 404],
    [{ ...generation, status: SkillProfileGenerationStatus.queued }, 409],
  ])('rejects foreign or non-terminal retry targets', async (prior, statusCode) => {
    const { service, generations } = createService();
    generations.findByIdForUser.mockResolvedValueOnce(prior);
    await expect(
      service.retryGeneration({
        user: contributor,
        generationId: 'prior-generation',
        consent: { accepted: true, version: 'github-skill-analysis-v1' },
      }),
    ).rejects.toMatchObject({
      code: 'SKILL_PROFILE_GENERATION_NOT_RETRYABLE',
      statusCode,
    });
  });
});
