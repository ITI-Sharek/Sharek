import { ConfigService } from '@nestjs/config';

import { SkillProfileInput } from '../dto/skill-profile-ai.dto';
import { FastApiSkillProfileClient } from './fastapi-skill-profile.client';

const input: SkillProfileInput = {
  contributorId: 'user-1',
  githubLogin: 'sharek-dev',
  generationId: 'generation-1',
  requestedAt: '2026-07-14T00:00:00.000Z',
  selectedRepositories: [
    {
      evidenceId: 'github:sharek-dev/repo',
      fullName: 'sharek-dev/repo',
      htmlUrl: 'https://github.com/sharek-dev/repo',
      private: false,
      fork: false,
      archived: false,
      defaultBranch: 'main',
      owner: 'sharek-dev',
      description: null,
      topics: [],
      primaryLanguage: 'TypeScript',
      languages: { TypeScript: 1000 },
      technologies: ['TypeScript'],
      statistics: {},
      readmeExcerpt: null,
      contributionActivity: {},
      commitSignals: {},
      authorship: {
        githubLogin: 'sharek-dev',
        repositoryOwned: true,
        recentCommitCount: 2,
        totalCommits: 5,
        additions: 200,
        deletions: 20,
        contributionDetected: true,
        matchedRecentCommitShas: ['abc'],
      },
      evidenceFailures: [],
    },
  ],
};

describe('FastApiSkillProfileClient', () => {
  const originalFetch = global.fetch;
  const config = {
    get: jest.fn((key: string, fallback: unknown) => {
      if (key === 'AI_SERVICE_URL') return 'http://ai-service';
      if (key === 'AI_SERVICE_TIMEOUT_MS') return 1000;
      if (key === 'AI_SERVICE_AUTH_TOKEN') return 'internal-test-token';
      return fallback;
    }),
  };
  const client = new FastApiSkillProfileClient(
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('accepts cited evidence from the submitted capsules', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        skills: [
          {
            name: 'TypeScript',
            proficiency: 'intermediate',
            confidence: 0.8,
            evidenceIds: ['github:sharek-dev/repo'],
          },
        ],
        fraudSignals: [],
        evidenceQuality: 'medium',
        recommendation: 'pending_review',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        promptVersion: 'v1',
        schemaVersion: 'v1',
        serviceVersion: 'v1',
      }),
    );

    await expect(client.generate(input)).resolves.toMatchObject({
      skills: [{ evidenceIds: ['github:sharek-dev/repo'] }],
      recommendation: 'pending_review',
    });
  });

  it('rejects evidence IDs that were not submitted by the backend', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        skills: [
          {
            name: 'TypeScript',
            proficiency: 'intermediate',
            confidence: 0.8,
            evidenceIds: ['github:someone-else/repo'],
          },
        ],
        fraudSignals: [],
        evidenceQuality: 'medium',
        recommendation: 'pending_review',
        provider: 'groq',
        model: 'model',
        promptVersion: 'v1',
        schemaVersion: 'v1',
        serviceVersion: 'v1',
      }),
    );

    await expect(client.generate(input)).rejects.toMatchObject({
      code: 'AI_SKILL_PROFILE_RESPONSE_INVALID',
    });
  });

  it('rejects a missing deterministic recommendation', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        skills: [],
        fraudSignals: [],
        evidenceQuality: 'weak',
        provider: 'groq',
        model: 'model',
        promptVersion: 'v1',
        schemaVersion: 'v1',
        serviceVersion: 'v1',
      }),
    );

    await expect(client.generate(input)).rejects.toMatchObject({
      code: 'AI_SKILL_PROFILE_RESPONSE_INVALID',
    });
  });
});

function responseWith(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response;
}
