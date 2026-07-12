import { GitHubRepositoryService } from './github-repository.service';
import { ApplicationError } from '../../../../shared/errors/application.error';

describe('GitHubRepositoryService', () => {
  const database = {
    gitHubAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const tokenEncryption = {
    decrypt: jest.fn(),
  };
  const gitHubApiClient = {
    listRepositories: jest.fn(),
    getRepository: jest.fn(),
    getRepositoryLanguages: jest.fn(),
    getRepositoryReadme: jest.fn(),
    getRepositoryContributionStats: jest.fn(),
    getRepositoryCommitActivity: jest.fn(),
    listRecentCommits: jest.fn(),
  };
  const service = new GitHubRepositoryService(
    database as never,
    tokenEncryption as never,
    gitHubApiClient as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('requires a connected GitHub account before listing repositories', async () => {
    database.gitHubAccount.findUnique.mockResolvedValue(null);

    await expect(service.listRepositories('user-id')).rejects.toMatchObject({
      code: 'GITHUB_ACCOUNT_NOT_CONNECTED',
      statusCode: 404,
    } satisfies Partial<ApplicationError>);
  });

  it('lists normalized repositories for a connected account', async () => {
    database.gitHubAccount.findUnique.mockResolvedValue({
      access_token: 'encrypted-token',
    });
    tokenEncryption.decrypt.mockReturnValue('plain-token');
    gitHubApiClient.listRepositories.mockResolvedValue([getRepositoryPayload()]);
    gitHubApiClient.getRepositoryLanguages.mockResolvedValue({
      TypeScript: 1000,
    });

    const repositories = await service.listRepositories('user-id');

    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toMatchObject({
      githubRepoId: '123',
      fullName: 'ITI-Sharek/sharek-api',
      primaryLanguage: 'TypeScript',
      languages: {
        TypeScript: 1000,
      },
      stars: 5,
    });
    expect(tokenEncryption.decrypt).toHaveBeenCalledWith('encrypted-token');
  });

  it('creates an import snapshot from a GitHub repository', async () => {
    database.gitHubAccount.findUnique.mockResolvedValue({
      access_token: 'encrypted-token',
    });
    tokenEncryption.decrypt.mockReturnValue('plain-token');
    gitHubApiClient.getRepository.mockResolvedValue(getRepositoryPayload());
    gitHubApiClient.getRepositoryLanguages.mockResolvedValue({
      TypeScript: 1000,
    });
    gitHubApiClient.getRepositoryReadme.mockResolvedValue('# Share-k API');
    gitHubApiClient.getRepositoryContributionStats.mockResolvedValue({
      data: [getContributorStatsPayload()],
      unavailableReason: null,
    });
    gitHubApiClient.getRepositoryCommitActivity.mockResolvedValue({
      data: [
        {
          week: 1783296000,
          total: 3,
        },
      ],
      unavailableReason: null,
    });
    gitHubApiClient.listRecentCommits.mockResolvedValue({
      data: [getCommitPayload()],
      unavailableReason: null,
    });

    const snapshot = await service.getImportSnapshot(
      'user-id',
      'ITI-Sharek/sharek-api',
    );

    expect(snapshot).toMatchObject({
      repository: {
        githubRepoId: '123',
        fullName: 'ITI-Sharek/sharek-api',
        htmlUrl: 'https://github.com/ITI-Sharek/sharek-api',
      },
      technologies: ['nestjs', 'TypeScript'],
      repoStatistics: {
        stars: 5,
        contributionActivity: {
          totalContributors: 1,
          totalCommits: 3,
        },
        commitSignals: {
          recentCommitCount: 1,
          authors: ['sharek-dev'],
        },
      },
      readmeContent: '# Share-k API',
      contributionActivity: {
        totalContributors: 1,
        totalCommits: 3,
        lastYearCommitCount: 3,
      },
      commitSignals: {
        recentCommitCount: 1,
        authors: ['sharek-dev'],
      },
    });
  });

  it('builds limited repository evidence for skill profiling', async () => {
    database.gitHubAccount.findUnique.mockResolvedValue({
      access_token: 'encrypted-token',
    });
    tokenEncryption.decrypt.mockReturnValue('plain-token');
    gitHubApiClient.listRepositories.mockResolvedValue([
      getRepositoryPayload(),
      {
        ...getRepositoryPayload(),
        id: 456,
        name: 'sharek-web',
        full_name: 'ITI-Sharek/sharek-web',
      },
    ]);
    gitHubApiClient.getRepositoryLanguages.mockResolvedValue({
      TypeScript: 1000,
    });
    gitHubApiClient.getRepositoryReadme.mockResolvedValue('# Share-k API');
    gitHubApiClient.getRepositoryContributionStats.mockResolvedValue({
      data: [getContributorStatsPayload()],
      unavailableReason: null,
    });
    gitHubApiClient.getRepositoryCommitActivity.mockResolvedValue({
      data: [
        {
          week: 1783296000,
          total: 3,
        },
      ],
      unavailableReason: null,
    });
    gitHubApiClient.listRecentCommits.mockResolvedValue({
      data: [getCommitPayload()],
      unavailableReason: null,
    });

    const evidence = await service.getSkillProfilingEvidence('user-id', 1);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      repository: {
        fullName: 'ITI-Sharek/sharek-api',
      },
      contributionActivity: {
        totalCommits: 3,
      },
      commitSignals: {
        recentCommitCount: 1,
      },
    });
  });

  it('marks repository import as prepared for later ingestion', async () => {
    database.gitHubAccount.update.mockResolvedValue({});

    await service.markRepositoryImportPrepared('user-id');

    expect(database.gitHubAccount.update).toHaveBeenCalledWith({
      where: {
        user_id: 'user-id',
      },
      data: expect.objectContaining({
        ingestion_status: 'pending',
      }),
    });
  });
});

function getRepositoryPayload() {
  return {
    id: 123,
    name: 'sharek-api',
    full_name: 'ITI-Sharek/sharek-api',
    owner: {
      login: 'ITI-Sharek',
    },
    description: 'Backend',
    html_url: 'https://github.com/ITI-Sharek/sharek-api',
    private: false,
    fork: false,
    archived: false,
    default_branch: 'main',
    language: 'TypeScript',
    stargazers_count: 5,
    forks_count: 1,
    open_issues_count: 2,
    watchers_count: 5,
    topics: ['nestjs'],
    pushed_at: '2026-07-05T00:00:00Z',
    updated_at: '2026-07-05T01:00:00Z',
  };
}

function getContributorStatsPayload() {
  return {
    author: {
      login: 'sharek-dev',
      html_url: 'https://github.com/sharek-dev',
    },
    total: 3,
    weeks: [
      {
        w: 1783296000,
        a: 120,
        d: 30,
        c: 3,
      },
    ],
  };
}

function getCommitPayload() {
  return {
    sha: 'abc123',
    html_url: 'https://github.com/ITI-Sharek/sharek-api/commit/abc123',
    commit: {
      message: 'Add GitHub evidence snapshot\n\nDetailed body',
      author: {
        name: 'Sharek Dev',
        date: '2026-07-05T02:00:00Z',
      },
    },
    author: {
      login: 'sharek-dev',
    },
  };
}
