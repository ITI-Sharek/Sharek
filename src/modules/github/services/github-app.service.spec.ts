import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { GitHubAppService } from './github-app.service';

const installation = {
  id: 'installation-internal',
  installation_id: '987',
  account_id: '77',
  account_login: 'sharek-org',
  account_type: 'organization',
  repository_selection: 'selected',
  permissions: { metadata: 'read', contents: 'read' },
  status: 'active',
  installed_at: new Date('2026-07-01T00:00:00Z'),
  last_verified_at: new Date('2026-07-27T00:00:00Z'),
  suspended_at: null,
  deleted_at: null,
  created_at: new Date('2026-07-01T00:00:00Z'),
  updated_at: new Date('2026-07-27T00:00:00Z'),
};

function activeLink(userId = 'user-1') {
  return {
    id: `link-${userId}`,
    installation_id: installation.id,
    user_id: userId,
    github_user_id: userId === 'user-1' ? '42' : '43',
    github_login: userId,
    encrypted_user_token: 'encrypted-user-token',
    user_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
    encrypted_refresh_token: 'encrypted-refresh-token',
    refresh_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: 'active',
    last_verified_at: new Date(),
    linked_at: new Date(),
    disconnected_at: null,
    revoked_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    installation,
  };
}

describe('GitHubAppService', () => {
  function createService() {
    const repository = {
      id: 'repo-internal',
      installation_id: installation.id,
      github_repository_id: '123',
      full_name: 'sharek-org/selected',
      visibility: 'private',
      default_branch: 'main',
      selected_at: new Date(),
      last_verified_at: new Date(),
      removed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const transaction = {
      gitHubAppInstallation: {
        upsert: jest.fn().mockResolvedValue(installation),
      },
      gitHubAppInstallationLink: {
        upsert: jest.fn().mockResolvedValue(activeLink()),
      },
      gitHubAppLinkState: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      gitHubAppRepository: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue(repository),
      },
    };
    const database = {
      gitHubAppLinkState: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      gitHubAppInstallation: { findUnique: jest.fn() },
      gitHubAppInstallationLink: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      gitHubAppRepository: {
        findMany: jest.fn().mockResolvedValue([repository]),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const apiClient = {
      exchangeUserCode: jest.fn(),
      getAuthenticatedUser: jest.fn(),
      listUserInstallations: jest.fn(),
      getInstallation: jest.fn(),
      listUserInstallationRepositories: jest.fn(),
      refreshUserToken: jest.fn(),
    };
    const tokenEncryption = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn(() => 'plain-user-token'),
    };
    return {
      service: new GitHubAppService(
        database as never,
        new ConfigService({
          GITHUB_APP_INSTALLATION_URL:
            'https://github.com/apps/share-k/installations/new',
          GITHUB_APP_ID: '123456',
          GITHUB_APP_SLUG: 'share-k',
        }),
        apiClient as never,
        tokenEncryption as never,
      ),
      database,
      transaction,
      apiClient,
      tokenEncryption,
      repository,
    };
  }

  it('locks the persisted link, installation, and selected repositories for an evidence snapshot', async () => {
    const { service } = createService();
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ installation_id: installation.id }])
        .mockResolvedValueOnce([{ github_repository_id: '123' }]),
    };

    await expect(
      service.lockRepositorySelectionAuthorization({
        userId: '11111111-1111-4111-8111-111111111111',
        installationLinkId: '22222222-2222-4222-8222-222222222222',
        repositoryIds: ['123'],
        transaction: transaction as never,
      }),
    ).resolves.toBe(true);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(
      transaction.$queryRaw.mock.calls
        .map(([query]) => query.strings.join(''))
        .join('\n'),
    ).toContain('FOR SHARE');
  });

  it('creates a hashed state-bearing install URL without a setup URL', async () => {
    const { service, database } = createService();
    const result = await service.startConnection('user-1');
    const state = new URL(result.installationUrl).searchParams.get('state');
    expect(state).toEqual(expect.any(String));
    expect(result.installationUrl).not.toContain('setup');
    expect(database.gitHubAppLinkState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user-1',
        flow_type: 'install_and_authorize',
        state_hash: createHash('sha256').update(state!).digest('hex'),
      }),
    });
  });

  it('binds authorize-existing flow to an owned target installation', async () => {
    const { service, database } = createService();
    database.gitHubAppInstallationLink.findFirst.mockResolvedValue({
      installation_id: installation.id,
    });
    await service.startConnection(
      'user-1',
      'authorize_existing_installation',
      'link-user-1',
    );
    expect(database.gitHubAppLinkState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user-1',
        target_installation_id: installation.id,
      }),
    });
  });

  it.each([
    ['expired', { status: 'issued', expires_at: new Date(0) }],
    ['already consumed', { status: 'callback_processed', expires_at: new Date(Date.now() + 60_000) }],
  ])('rejects %s callback state before exchanging the code', async (_label, attempt) => {
    const { service, database, apiClient } = createService();
    database.gitHubAppLinkState.findUnique.mockResolvedValue({
      id: 'attempt-1',
      ...attempt,
    });
    await expect(service.processBrowserCallback('code', 'state')).rejects.toMatchObject({
      code: 'GITHUB_APP_STATE_INVALID',
    });
    expect(apiClient.exchangeUserCode).not.toHaveBeenCalled();
  });

  it('exchanges the code immediately and stores only encrypted pending credentials', async () => {
    const { service, database, apiClient, tokenEncryption } = createService();
    database.gitHubAppLinkState.findUnique.mockResolvedValue({
      id: 'attempt-1',
      status: 'issued',
      expires_at: new Date(Date.now() + 60_000),
    });
    database.gitHubAppLinkState.updateMany.mockResolvedValue({ count: 1 });
    database.gitHubAppLinkState.update.mockResolvedValue({});
    apiClient.exchangeUserCode.mockResolvedValue({
      access_token: 'user-token',
      expires_in: 3600,
      refresh_token: 'refresh-token',
      refresh_token_expires_in: 7200,
    });
    apiClient.getAuthenticatedUser.mockResolvedValue({ id: 42, login: 'member' });
    apiClient.listUserInstallations.mockResolvedValue([
      { id: 987, account: { login: 'sharek-org', type: 'Organization' } },
    ]);
    await expect(service.processBrowserCallback('code', 'state')).resolves.toBe(
      'attempt-1',
    );
    expect(tokenEncryption.encrypt).toHaveBeenCalledWith('user-token');
    expect(tokenEncryption.encrypt).toHaveBeenCalledWith('refresh-token');
    expect(database.gitHubAppLinkState.update).toHaveBeenCalledWith({
      where: { id: 'attempt-1' },
      data: expect.objectContaining({
        encrypted_pending_user_token: 'encrypted:user-token',
        encrypted_pending_refresh_token: 'encrypted:refresh-token',
      }),
    });
  });

  it('rejects spoofed provider installation choices before provider reads', async () => {
    const { service, database, apiClient } = createService();
    database.gitHubAppLinkState.findFirst.mockResolvedValue({
      id: 'attempt-1',
      encrypted_pending_user_token: 'encrypted',
      verified_github_user_id: '42',
      accessible_installation_candidates: [
        {
          installationId: '987',
          accountLogin: 'sharek-org',
          accountType: 'Organization',
        },
      ],
    });
    await expect(
      service.completeConnection('user-1', 'attempt-1', 'spoofed'),
    ).rejects.toMatchObject({ code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED' });
    expect(apiClient.listUserInstallations).not.toHaveBeenCalled();
  });

  it('fails completion when the independently verified member no longer has access', async () => {
    const { service, database, apiClient } = createService();
    database.gitHubAppLinkState.findFirst.mockResolvedValue({
      id: 'attempt-1',
      user_id: 'user-2',
      encrypted_pending_user_token: 'encrypted',
      verified_github_user_id: '43',
      verified_github_login: 'member-two',
      accessible_installation_candidates: [
        {
          installationId: '987',
          accountLogin: 'sharek-org',
          accountType: 'Organization',
        },
      ],
    });
    apiClient.listUserInstallations.mockResolvedValue([]);

    await expect(
      service.completeConnection('user-2', 'attempt-1', '987'),
    ).rejects.toMatchObject({
      code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
    });
    expect(apiClient.getInstallation).not.toHaveBeenCalled();
  });

  it('creates an isolated member link to an existing shared organization installation', async () => {
    const { service, database, transaction, apiClient } = createService();
    database.gitHubAppLinkState.findFirst.mockResolvedValue({
      id: 'attempt-2',
      user_id: 'user-2',
      encrypted_pending_user_token: 'encrypted',
      pending_user_token_expires_at: new Date(Date.now() + 60_000),
      encrypted_pending_refresh_token: 'encrypted-refresh',
      pending_refresh_token_expires_at: new Date(Date.now() + 120_000),
      verified_github_user_id: '43',
      verified_github_login: 'member-two',
      accessible_installation_candidates: [
        {
          installationId: '987',
          accountLogin: 'sharek-org',
          accountType: 'Organization',
        },
      ],
    });
    apiClient.listUserInstallations.mockResolvedValue([{ id: 987 }]);
    apiClient.getInstallation.mockResolvedValue({
      id: 987,
      app_id: 123456,
      account: { id: 77, login: 'sharek-org', type: 'Organization' },
      repository_selection: 'selected',
      permissions: { metadata: 'read', contents: 'read' },
      created_at: '2026-07-01T00:00:00Z',
      suspended_at: null,
    });
    apiClient.listUserInstallationRepositories.mockResolvedValue([]);
    transaction.gitHubAppInstallationLink.upsert.mockResolvedValue(
      activeLink('user-2'),
    );

    await expect(
      service.completeConnection('user-2', 'attempt-2', '987'),
    ).resolves.toMatchObject({ installationLinkId: 'link-user-2' });
    expect(transaction.gitHubAppInstallation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { installation_id: '987' } }),
    );
    expect(transaction.gitHubAppInstallationLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          installation_id_user_id: {
            installation_id: installation.id,
            user_id: 'user-2',
          },
        },
      }),
    );
  });

  it('returns multiple isolated links for one user and shared organization members', async () => {
    const { service, database } = createService();
    database.gitHubAppInstallationLink.findMany.mockResolvedValue([
      activeLink('user-1'),
      { ...activeLink('user-1'), id: 'second-link' },
    ]);
    await expect(service.listInstallationLinks('user-1')).resolves.toHaveLength(2);
    expect(database.gitHubAppInstallationLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'user-1' } }),
    );
  });

  it('returns only safe candidates for the authenticated callback attempt owner', async () => {
    const { service, database } = createService();
    const expiresAt = new Date(Date.now() + 60_000);
    database.gitHubAppLinkState.findFirst.mockResolvedValue({
      id: 'attempt-1',
      expires_at: expiresAt,
      target_installation_id: null,
      accessible_installation_candidates: [
        {
          installationId: '987',
          accountLogin: 'sharek-org',
          accountType: 'Organization',
          accessToken: 'must-not-leak',
        },
        {
          installationId: '654',
          accountLogin: 'personal-account',
          accountType: 'User',
        },
        { installationId: 'not-numeric', accountLogin: 'invalid' },
      ],
    });

    await expect(
      service.getConnectionAttempt('user-1', 'attempt-1'),
    ).resolves.toEqual({
      attemptId: 'attempt-1',
      expiresAt,
      candidates: [
        {
          providerInstallationId: '987',
          accountLogin: 'sharek-org',
          accountType: 'organization',
        },
        {
          providerInstallationId: '654',
          accountLogin: 'personal-account',
          accountType: 'user',
        },
      ],
    });
    expect(database.gitHubAppLinkState.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'attempt-1',
        user_id: 'user-1',
        status: 'callback_processed',
        completion_consumed_at: null,
      }),
      select: expect.not.objectContaining({
        encrypted_pending_user_token: true,
        encrypted_pending_refresh_token: true,
      }),
    });
  });

  it('filters reauthorization candidates to the attempt target', async () => {
    const { service, database } = createService();
    database.gitHubAppLinkState.findFirst.mockResolvedValue({
      id: 'attempt-1',
      expires_at: new Date(Date.now() + 60_000),
      target_installation_id: installation.id,
      accessible_installation_candidates: [
        {
          installationId: '987',
          accountLogin: 'sharek-org',
          accountType: 'Organization',
        },
        {
          installationId: '654',
          accountLogin: 'other-org',
          accountType: 'Organization',
        },
      ],
    });
    database.gitHubAppInstallation.findUnique.mockResolvedValue({
      installation_id: '987',
    });

    await expect(
      service.getConnectionAttempt('user-1', 'attempt-1'),
    ).resolves.toMatchObject({
      candidates: [{ providerInstallationId: '987' }],
    });
  });

  it('does not reveal foreign, expired, or consumed attempts', async () => {
    const { service, database } = createService();
    database.gitHubAppLinkState.findFirst.mockResolvedValue(null);

    await expect(
      service.getConnectionAttempt('user-1', 'attempt-1'),
    ).rejects.toMatchObject({ code: 'GITHUB_APP_STATE_INVALID' });
  });

  it('disconnects only the owned user link and never deletes the installation', async () => {
    const { service, database } = createService();
    database.gitHubAppInstallationLink.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.disconnect('user-1', 'link-user-1')).resolves.toMatchObject({
      success: true,
    });
    expect(database.gitHubAppInstallationLink.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'link-user-1', user_id: 'user-1' }),
      data: expect.objectContaining({
        status: 'disconnected',
        encrypted_user_token: null,
        encrypted_refresh_token: null,
      }),
    });
    expect(database.gitHubAppInstallation.findUnique).not.toHaveBeenCalled();
  });

  it('refreshes rotating member authorization and returns selected repositories only', async () => {
    const { service, database, apiClient, tokenEncryption, repository } =
      createService();
    const expiredLink = {
      ...activeLink(),
      user_token_expires_at: new Date(0),
    };
    const refreshedLink = {
      ...expiredLink,
      encrypted_user_token: 'encrypted:new-user-token',
      user_token_expires_at: new Date(Date.now() + 3600_000),
    };
    database.gitHubAppInstallationLink.findFirst.mockResolvedValue(expiredLink);
    database.gitHubAppInstallationLink.update
      .mockResolvedValueOnce(refreshedLink)
      .mockResolvedValueOnce(refreshedLink);
    apiClient.refreshUserToken.mockResolvedValue({
      access_token: 'new-user-token',
      expires_in: 3600,
      refresh_token: 'new-refresh-token',
      refresh_token_expires_in: 7200,
    });
    apiClient.listUserInstallations.mockResolvedValue([{ id: 987 }]);
    apiClient.listUserInstallationRepositories.mockResolvedValue([
      { id: 123, full_name: 'sharek-org/selected', private: true },
    ]);
    database.gitHubAppRepository.findMany.mockResolvedValue([repository]);

    await expect(
      service.listSelectedRepositories('user-1', 'link-user-1', 1, 30),
    ).resolves.toMatchObject({
      items: [{ repositoryId: '123', fullName: 'sharek-org/selected' }],
    });
    expect(apiClient.refreshUserToken).toHaveBeenCalled();
    expect(tokenEncryption.encrypt).toHaveBeenCalledWith('new-refresh-token');
    expect(database.gitHubAppRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { installation_id: installation.id, removed_at: null },
      }),
    );
  });
});
