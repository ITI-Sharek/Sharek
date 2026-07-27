import { ConfigService } from '@nestjs/config';

import { GitHubAccountService } from '../src/modules/github/services/github-account.service';
import { GitHubOAuthService } from '../src/modules/github/services/github-oauth.service';

describe('GitHub OAuth cutover compatibility', () => {
  const cutoverDatabase = {
    gitHubEvidenceCutover: {
      findUnique: jest.fn().mockResolvedValue({ cutover_at: new Date() }),
    },
    gitHubAccount: { findUnique: jest.fn(), deleteMany: jest.fn() },
  };

  it('fails legacy private repository credential reads with the stable migration error', async () => {
    const service = new GitHubAccountService(
      cutoverDatabase as never,
      { decrypt: jest.fn() } as never,
    );
    await expect(service.getAccessToken('user-1')).rejects.toMatchObject({
      code: 'GITHUB_REPOSITORY_OAUTH_MIGRATED',
      statusCode: 410,
    });
    expect(cutoverDatabase.gitHubAccount.findUnique).not.toHaveBeenCalled();
  });

  it('retires legacy repository connection/disconnect while identity authorization remains usable', async () => {
    const service = new GitHubOAuthService(
      new ConfigService({
        GITHUB_CLIENT_ID: 'identity-client',
        GITHUB_AUTH_CALLBACK_URL: 'http://localhost:4000/auth/github/callback',
      }),
      cutoverDatabase as never,
      {} as never,
    );
    await expect(service.startOAuth('user-1')).rejects.toMatchObject({
      code: 'GITHUB_REPOSITORY_OAUTH_MIGRATED',
      statusCode: 410,
    });
    await expect(service.disconnect('user-1')).rejects.toMatchObject({
      code: 'GITHUB_REPOSITORY_OAUTH_MIGRATED',
    });

    const identityUrl = new URL(service.getSocialAuthorizationUrl('state'));
    expect(identityUrl.searchParams.get('scope')).toBe('read:user user:email');
    expect(identityUrl.pathname).toBe('/login/oauth/authorize');
  });
});
