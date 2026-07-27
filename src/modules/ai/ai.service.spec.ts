import { AiService } from './ai.service';

describe('AiService private evidence boundary', () => {
  it('forwards only the explicitly constructed authorized evidence contract', async () => {
    const client = {
      generate: jest.fn().mockResolvedValue({ recommendation: 'pending_review' }),
    };
    const service = new AiService(client as never);
    const input = {
      contributorId: 'user-1',
      githubLogin: 'member',
      generationId: 'generation-1',
      requestedAt: '2026-07-27T12:00:00.000Z',
      selectedRepositories: [
        {
          evidenceId: 'github-evidence:opaque',
          fullName: 'private-owner/private-repo',
          htmlUrl: 'https://github.com/private-owner/private-repo',
          private: true,
          fork: false,
          archived: false,
          defaultBranch: 'main',
          owner: 'private-owner',
          description: null,
          topics: [],
          primaryLanguage: 'TypeScript',
          languages: { TypeScript: 100 },
          technologies: ['TypeScript'],
          statistics: {},
          readmeExcerpt: 'bounded excerpt',
          contributionActivity: {},
          commitSignals: {},
          authorship: {
            githubLogin: 'member',
            repositoryOwned: false,
            recentCommitCount: 1,
            totalCommits: 1,
            additions: 1,
            deletions: 0,
            contributionDetected: true,
            matchedRecentCommitShas: [],
          },
          evidenceFailures: [],
        },
      ],
    };
    await service.generateSkillProfile(input);
    expect(client.generate).toHaveBeenCalledWith(input);
    expect(client.generate.mock.calls[0][0]).not.toHaveProperty('accessToken');
    expect(client.generate.mock.calls[0][0]).not.toHaveProperty('providerPayload');
  });
});
