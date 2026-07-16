import { SkillProfileGenerationStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { SkillProfileGenerationService } from './skill-profile-generation.service';
import { GitHubRepositoryImportSnapshot } from '../../github/dto/github-repository.dto';
import { SkillProfileGenerationRepository } from '../repositories/skill-profile-generation.repository';
import { GitHubAccountService } from '../../github/services/github-account.service';
import { GitHubEvidenceService } from '../../github/services/github-evidence.service';
import { AiService } from '../../ai/ai.service';

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

const snapshot: GitHubRepositoryImportSnapshot = {
  repository: {
    githubRepoId: '1',
    fullName: 'owner/repo',
    name: 'repo',
    owner: 'owner',
    description: 'A NestJS API',
    htmlUrl: 'https://github.com/owner/repo',
    private: false,
    fork: false,
    archived: false,
    defaultBranch: 'main',
    primaryLanguage: 'TypeScript',
    languages: {
      TypeScript: 1000,
    },
    stars: 1,
    forks: 0,
    openIssues: 0,
    watchers: 1,
    topics: ['nestjs'],
    pushedAt: new Date('2026-07-13T00:00:00.000Z'),
    updatedAt: new Date('2026-07-13T00:00:00.000Z'),
  },
  technologies: ['TypeScript', 'NestJS'],
  repoStatistics: {
    stars: 1,
  },
  readmeContent: '# API',
  contributionActivity: {
    totalContributors: 1,
    totalCommits: 10,
    lastYearCommitCount: 10,
    weeklyCommitCounts: [],
    topContributors: [],
    unavailableReason: null,
  },
  commitSignals: {
    recentCommitCount: 3,
    latestCommitAt: new Date('2026-07-13T00:00:00.000Z'),
    oldestCommitAt: new Date('2026-07-10T00:00:00.000Z'),
    authors: ['owner'],
    recentCommits: [],
    unavailableReason: null,
  },
  authorship: {
    githubLogin: 'owner',
    repositoryOwned: true,
    recentCommitCount: 3,
    totalCommits: 10,
    additions: 500,
    deletions: 100,
    contributionDetected: true,
    matchedRecentCommitShas: ['abc123'],
  },
  evidenceFailures: [],
};

function createProcessor() {
  const generations = {
    findById: jest.fn().mockResolvedValue(generation),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    completeWithPendingSkills: jest.fn().mockResolvedValue(undefined),
    completeNeedsMoreEvidence: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const gitHubRepositoryService = {
    getSelectedSkillProfilingEvidence: jest.fn().mockResolvedValue({
      snapshots: [snapshot],
      failures: [],
    }),
    getConnectedUsername: jest.fn().mockResolvedValue('owner'),
  };
  const aiService = {
    generateSkillProfile: jest.fn().mockResolvedValue({
      skills: [
        {
          name: ' TypeScript ',
          proficiency: 'intermediate',
          confidence: 0.9,
          evidenceIds: ['github:owner/repo'],
          evidenceSummary: 'Authored TypeScript API code.',
        },
        {
          name: 'Docker',
          proficiency: 'beginner',
          confidence: 0.4,
          evidenceIds: ['github:owner/repo'],
          evidenceSummary: 'Weak Docker signal.',
        },
      ],
      fraudSignals: [
        {
          code: 'weak_authorship',
          severity: 'medium',
          message: 'Authorship needs review.',
        },
      ],
      evidenceQuality: 'medium',
      recommendation: 'pending_review',
      provider: 'openai',
      model: 'openai/gpt-oss-120b',
      promptVersion: 'skill-profile-v1',
      schemaVersion: 'skill-profile-result-v1',
      serviceVersion: 'ai-service-0.1.0',
    }),
  };
  const config = {
    get: jest.fn().mockReturnValue(0.7),
  };

  return {
    processor: new SkillProfileGenerationService(
      generations as unknown as SkillProfileGenerationRepository,
      gitHubRepositoryService as unknown as GitHubEvidenceService,
      gitHubRepositoryService as unknown as GitHubAccountService,
      aiService as unknown as AiService,
      config as unknown as ConfigService,
    ),
    generations,
    gitHubRepositoryService,
    aiService,
  };
}

describe('SkillProfileGenerationService', () => {
  it('collects evidence, calls AI, and stores high-confidence pending skills', async () => {
    const {
      processor,
      generations,
      gitHubRepositoryService,
      aiService,
    } = createProcessor();

    await processor.process('generation-1');

    expect(generations.updateStatus).toHaveBeenCalledWith(
      'generation-1',
      SkillProfileGenerationStatus.collecting_evidence,
    );
    expect(gitHubRepositoryService.getSelectedSkillProfilingEvidence)
      .toHaveBeenCalledWith('user-1', ['owner/repo']);
    expect(aiService.generateSkillProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        contributorId: 'user-1',
        githubLogin: 'owner',
        generationId: 'generation-1',
      }),
    );
    expect(generations.completeWithPendingSkills).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'generation-1',
        skills: [
          expect.objectContaining({
            name: 'TypeScript',
            confidence: 0.9,
          }),
        ],
        provider: 'openai',
        model: 'openai/gpt-oss-120b',
      }),
    );
    expect(generations.fail).not.toHaveBeenCalled();
  });

  it('throws when AI processing fails so BullMQ can retry it', async () => {
    const { processor, generations, aiService } = createProcessor();
    aiService.generateSkillProfile.mockRejectedValueOnce(new Error('AI down'));

    await expect(processor.process('generation-1')).rejects.toThrow('AI down');

    expect(generations.fail).not.toHaveBeenCalled();
  });

  it('stores an insufficient-evidence result without pending skills', async () => {
    const { processor, generations, aiService } = createProcessor();
    aiService.generateSkillProfile.mockResolvedValueOnce({
      skills: [
        {
          name: 'TypeScript',
          proficiency: 'intermediate',
          confidence: 0.9,
          evidenceIds: ['github:owner/repo'],
        },
      ],
      fraudSignals: [],
      evidenceQuality: 'weak',
      recommendation: 'needs_more_evidence',
      provider: 'groq',
      model: 'model',
      promptVersion: 'v1',
      schemaVersion: 'v1',
      serviceVersion: 'v1',
    });

    await processor.process('generation-1');

    expect(generations.completeNeedsMoreEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'generation-1',
        evidenceQuality: 'weak',
      }),
    );
    expect(generations.completeWithPendingSkills).not.toHaveBeenCalled();
  });
});
