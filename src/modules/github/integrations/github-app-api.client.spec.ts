import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';

import { GitHubAppApiClient } from './github-app-api.client';
import { GitHubAppCredentialsService } from '../security/github-app-credentials.service';

describe('GitHubAppApiClient', () => {
  const originalFetch = global.fetch;
  const credentials = {
    createAppJwt: jest.fn(() => 'app-jwt'),
  } as unknown as GitHubAppCredentialsService;
  const client = new GitHubAppApiClient(
    new ConfigService({
      GITHUB_APP_CLIENT_ID: 'client-id',
      GITHUB_APP_CLIENT_SECRET: 'client-secret',
    }),
    credentials,
  );

  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('exchanges a single-use user code once and never retries it', async () => {
    jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(client.exchangeUserCode('single-use')).rejects.toMatchObject({
      code: 'GITHUB_APP_PROVIDER_UNAVAILABLE',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts rotating token fields from refresh', async () => {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'new-user-token',
          expires_in: 28800,
          refresh_token: 'new-refresh-token',
          refresh_token_expires_in: 15897600,
        }),
    } as Response);

    await expect(client.refreshUserToken('old-refresh-token')).resolves.toMatchObject({
      access_token: 'new-user-token',
      refresh_token: 'new-refresh-token',
    });
    const request = jest.mocked(global.fetch).mock.calls[0][1];
    expect(String(request?.body)).toContain('grant_type=refresh_token');
  });

  it('mints an installation token on demand without persisting it', async () => {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          token: 'installation-token',
          expires_at: '2026-07-27T13:00:00Z',
        }),
    } as Response);

    await expect(client.createInstallationToken('987')).resolves.toMatchObject({
      token: 'installation-token',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/app/installations/987/access_tokens',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('paginates selected installation repositories', async () => {
    const fullPage = Array.from({ length: 100 }, (_, id) => ({
      id,
      full_name: `owner/repo-${id}`,
      private: true,
    }));
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ link: '<next>; rel="next"' }),
        json: () => Promise.resolve({ repositories: fullPage }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ repositories: [] }),
      } as Response);

    await expect(client.listInstallationRepositories('token')).resolves.toHaveLength(100);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('fails closed for provider status %s', async (status) => {
    jest.mocked(global.fetch).mockResolvedValue({ ok: false, status } as Response);
    await expect(client.getAuthenticatedUser('token')).rejects.toMatchObject({
      code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
      statusCode: 403,
    });
  });

  it('maps a 404 without treating it as public access', async () => {
    jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(client.getAuthenticatedUser('token')).rejects.toMatchObject({
      code: 'GITHUB_APP_PROVIDER_UNAVAILABLE',
      statusCode: 404,
    });
  });

  it('rejects malformed payloads', async () => {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ unexpected: [] }),
    } as Response);
    await expect(client.listUserInstallations('token')).rejects.toMatchObject({
      code: 'GITHUB_APP_PROVIDER_INVALID_RESPONSE',
    });
  });

  it('retries idempotent reads no more than three times', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers() } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers() } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 42, login: 'member' }),
      } as Response);
    await expect(client.getAuthenticatedUser('token')).resolves.toEqual({
      id: 42,
      login: 'member',
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('honors an immediate rate-limit retry hint for an idempotent read', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '0' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 42, login: 'member' }),
      } as Response);
    await expect(client.getAuthenticatedUser('token')).resolves.toMatchObject({ id: 42 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries read timeouts but still fails within the three-attempt ceiling', async () => {
    jest.mocked(global.fetch).mockRejectedValue(new Error('timeout'));
    await expect(client.getAuthenticatedUser('token')).rejects.toMatchObject({
      code: 'GITHUB_APP_PROVIDER_UNAVAILABLE',
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects a malformed installation-token expiry', async () => {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ token: 'token', expires_at: 'not-a-date' }),
    } as Response);
    await expect(client.createInstallationToken('987')).rejects.toMatchObject({
      code: 'GITHUB_APP_PROVIDER_INVALID_RESPONSE',
    });
  });

  it('uses only operations listed by the read-only provider fixture', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'test/fixtures/github-app-provider/permission-matrix.json',
        ),
        'utf8',
      ),
    ) as {
      installationPermissions: Record<string, string>;
      forbiddenPermissions: string[];
    };
    expect(fixture.installationPermissions).toEqual({ metadata: 'read', contents: 'read' });
    expect(fixture.forbiddenPermissions).toContain('contents:write');
  });
});
