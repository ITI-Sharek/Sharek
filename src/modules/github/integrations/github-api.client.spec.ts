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
      headers: new Headers(),
      json: () => Promise.resolve([]),
    } as Response);

    await client.listRepositories('plain-token');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&page=1&per_page=100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer plain-token',
        }),
      }),
    );
  });

  it('uses the GitHub Link header without skipping repositories between pages', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        link: '<https://api.github.com/user/repos?page=3>; rel="next"',
      }),
      json: () =>
        Promise.resolve([
          { id: 1, name: 'one', full_name: 'sharek/one' },
          { id: 2, name: 'two', full_name: 'sharek/two' },
        ]),
    } as Response);

    await expect(
      client.listRepositoryPage('plain-token', { page: 2, perPage: 2 }),
    ).resolves.toMatchObject({
      repositories: [
        { id: 1, full_name: 'sharek/one' },
        { id: 2, full_name: 'sharek/two' },
      ],
      hasNextPage: true,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&page=2&per_page=2',
      expect.any(Object),
    );
  });

  it('treats a headerless repository response as the final page', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: 1, full_name: 'sharek/one' }]),
    } as Response);

    await expect(
      client.listRepositoryPage('plain-token', { page: 1, perPage: 100 }),
    ).resolves.toMatchObject({
      repositories: [{ id: 1, full_name: 'sharek/one' }],
      hasNextPage: false,
    });
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

  it('decodes a dependency file with the caller-provided repository token', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          type: 'file',
          encoding: 'base64',
          content: Buffer.from('{"dependencies":{"next":"^16.1.6"}}').toString(
            'base64',
          ),
        }),
    } as Response);

    await expect(
      client.getRepositoryFile(
        'installation-token',
        'Root12335/EditedSinaiCore',
        'package.json',
        'main',
      ),
    ).resolves.toContain('next');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/Root12335/EditedSinaiCore/contents/package.json?ref=main',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer installation-token',
        }),
      }),
    );
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
      headers: new Headers(),
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

  it('fetches root entries for the selected default branch', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve([{ name: 'src', path: 'src', type: 'dir' }]),
    } as Response);

    await expect(
      client.listRepositoryRootEntries(
        'plain-token',
        'ITI-Sharek/sharek-api',
        'main',
      ),
    ).resolves.toEqual({
      data: [{ name: 'src', path: 'src', type: 'dir' }],
      unavailableReason: null,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/ITI-Sharek/sharek-api/contents?ref=main',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer plain-token',
        }),
      }),
    );
  });

  it('fetches a recursive tree for the selected default branch', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          truncated: false,
          tree: [{ path: 'src/main.ts', type: 'blob', size: 42 }],
        }),
    } as Response);

    await expect(
      client.getRepositoryTree(
        'plain-token',
        'ITI-Sharek/sharek-api',
        'main',
      ),
    ).resolves.toEqual({
      data: {
        truncated: false,
        tree: [{ path: 'src/main.ts', type: 'blob', size: 42 }],
      },
      unavailableReason: null,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/ITI-Sharek/sharek-api/git/trees/main?recursive=1',
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

  it('maps missing or inaccessible repositories to the safe source error', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
    } as Response);

    await expect(client.getPublicRepository('private/repo')).rejects.toMatchObject({
      code: 'GITHUB_SOURCE_NOT_AVAILABLE',
      statusCode: 404,
    });
  });

  it('maps provider rate limits without exposing a raw provider response', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '30' }),
    } as Response);

    await expect(client.getPublicRepository('sharek/repo')).rejects.toMatchObject({
      code: 'GITHUB_RATE_LIMITED',
      statusCode: 429,
      metadata: { retryAfter: 30, retryable: true },
    });
  });

  it('maps an aborted provider call to the bounded timeout error', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    jest.mocked(global.fetch).mockRejectedValueOnce(timeout);

    await expect(client.getPublicRepository('sharek/repo')).rejects.toMatchObject({
      code: 'GITHUB_PROVIDER_TIMEOUT',
      statusCode: 504,
      metadata: { retryable: true },
    });
  });
});
