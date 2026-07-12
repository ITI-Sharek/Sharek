import { GitHubApiClient } from './github-api.client';

describe('GitHubApiClient', () => {
  const client = new GitHubApiClient();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('requests all repositories visible to the connected token', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    } as Response);

    await client.listRepositories('plain-token');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer plain-token',
        }),
      }),
    );
  });

  it('returns null when a repository README is unavailable', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    await expect(
      client.getRepositoryReadme('plain-token', 'ITI-Sharek/sharek-api'),
    ).resolves.toBeNull();
  });

  it('reports pending contribution stats without failing the caller', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 202,
    } as Response);

    await expect(
      client.getRepositoryContributionStats(
        'plain-token',
        'ITI-Sharek/sharek-api',
      ),
    ).resolves.toEqual({
      data: null,
      unavailableReason: 'github_stats_pending',
    });
  });

  it('fetches recent commits from the encoded repository path', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            sha: 'abc123',
          },
        ]),
    } as Response);

    await client.listRecentCommits('plain-token', 'ITI-Sharek/sharek-api', 10);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/ITI-Sharek/sharek-api/commits?per_page=10',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer plain-token',
        }),
      }),
    );
  });

  it('rejects an invalid repository list response shape', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          message: 'Bad credentials',
        }),
    } as Response);

    await expect(client.listRepositories('plain-token')).rejects.toMatchObject({
      code: 'GITHUB_REPOSITORY_LIST_INVALID_RESPONSE',
      statusCode: 502,
    });
  });
});
