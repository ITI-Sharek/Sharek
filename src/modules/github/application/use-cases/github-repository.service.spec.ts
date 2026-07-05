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
  const service = new GitHubRepositoryService(
    database as never,
    tokenEncryption as never,
  );
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
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
    mockFetchJson([getRepositoryPayload()]);
    mockFetchJson({
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
    mockFetchJson(getRepositoryPayload());
    mockFetchJson({
      TypeScript: 1000,
    });
    mockFetchText('# Share-k API');

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
      },
      readmeContent: '# Share-k API',
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

function mockFetchJson(payload: unknown): void {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(payload),
  } as Response);
}

function mockFetchText(payload: string): void {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    text: () => Promise.resolve(payload),
  } as Response);
}
