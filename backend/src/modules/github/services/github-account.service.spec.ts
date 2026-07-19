import {
  GitHubAccountService,
  isBroadOrUnknownScope,
} from './github-account.service';

describe('isBroadOrUnknownScope', () => {
  it('treats missing scope as unknown', () => {
    expect(isBroadOrUnknownScope(null)).toBe(true);
  });

  it('detects the broad repo scope as its own token', () => {
    expect(isBroadOrUnknownScope('read:user user:email repo')).toBe(true);
    expect(isBroadOrUnknownScope('repo')).toBe(true);
    expect(isBroadOrUnknownScope('read:user,repo')).toBe(true);
  });

  it('does not match the narrow public_repo scope', () => {
    expect(isBroadOrUnknownScope('read:user user:email public_repo')).toBe(false);
    expect(isBroadOrUnknownScope('read:user user:email')).toBe(false);
  });
});

describe('GitHubAccountService', () => {
  function createService(account: Record<string, unknown> | null) {
    const database = {
      gitHubAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
      },
    };
    const tokenEncryption = {
      decrypt: jest.fn().mockReturnValue('decrypted-token'),
    };

    return {
      database,
      tokenEncryption,
      service: new GitHubAccountService(database as never, tokenEncryption as never),
    };
  }

  it('returns the decrypted token for a narrow-scope account', async () => {
    const { service } = createService({
      access_token: 'encrypted',
      token_scope: 'read:user user:email public_repo',
      requires_reauthorization: false,
    });

    await expect(service.getAccessToken('user-1')).resolves.toBe('decrypted-token');
  });

  it('blocks evidence access for accounts flagged for reauthorization', async () => {
    const { service, tokenEncryption } = createService({
      access_token: 'encrypted',
      token_scope: 'read:user user:email public_repo',
      requires_reauthorization: true,
    });

    await expect(service.getAccessToken('user-1')).rejects.toMatchObject({
      code: 'GITHUB_REAUTHORIZATION_REQUIRED',
      statusCode: 403,
    });
    expect(tokenEncryption.decrypt).not.toHaveBeenCalled();
  });

  it('blocks evidence access through unflagged legacy broad tokens', async () => {
    const { service, tokenEncryption } = createService({
      access_token: 'encrypted',
      token_scope: 'read:user user:email repo',
      requires_reauthorization: false,
    });

    await expect(service.getAccessToken('user-1')).rejects.toMatchObject({
      code: 'GITHUB_REAUTHORIZATION_REQUIRED',
    });
    expect(tokenEncryption.decrypt).not.toHaveBeenCalled();
  });

  it('blocks evidence access when the scope was never recorded', async () => {
    const { service } = createService({
      access_token: 'encrypted',
      token_scope: null,
      requires_reauthorization: false,
    });

    await expect(service.getAccessToken('user-1')).rejects.toMatchObject({
      code: 'GITHUB_REAUTHORIZATION_REQUIRED',
    });
  });

  it('reports reauthorization state in the account status', async () => {
    const { service } = createService({
      username: 'octocat',
      requires_reauthorization: true,
    });

    await expect(service.getStatusForUser('user-1')).resolves.toEqual({
      connected: true,
      username: 'octocat',
      requiresReauthorization: true,
    });
  });
});
