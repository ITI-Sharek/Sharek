import {
  AuthProvider,
  LanguageCode,
  SocialAuthIntent,
  UserRole,
  UserStatus,
} from '@prisma/client';

import { SocialAuthService } from './social-auth.service';

describe('SocialAuthService', () => {
  const database = {
    $transaction: jest.fn(),
    authOAuthState: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    authProviderAccount: {
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
    },
  };

  const gitHubOAuthService = {
    getSocialAuthorizationUrl: jest.fn(),
    exchangeCodeForSocialIdentity: jest.fn(),
    connectWithCallback: jest.fn(),
    disconnect: jest.fn(),
    findLinkedUserId: jest.fn(),
    findLinkedGitHubIdForUser: jest.fn(),
  };
  const googleOAuthService = {
    getSocialAuthorizationUrl: jest.fn(),
    exchangeCodeForSocialIdentity: jest.fn(),
  };
  const sessionService = {
    create: jest.fn(),
  };
  const identityUsernameService = {
    getAvailableUsernameOrNull: jest.fn(),
  };
  const service = new SocialAuthService(
    database as never,
    gitHubOAuthService as never,
    googleOAuthService as never,
    sessionService as never,
    identityUsernameService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation((callback) => callback(database));
    sessionService.create.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(),
      refreshExpiresAt: new Date(),
    });
    identityUsernameService.getAvailableUsernameOrNull.mockResolvedValue(null);
  });


  it('starts GitHub auth without requesting repository consent', async () => {
    gitHubOAuthService.getSocialAuthorizationUrl.mockReturnValue(
      'https://github.com/login/oauth/authorize?scope=read%3Auser+user%3Aemail',
    );

    const result = await service.start(
      AuthProvider.github,
      UserRole.contributor,
      SocialAuthIntent.login,
    );

    expect(database.authOAuthState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: AuthProvider.github,
        requested_role: UserRole.contributor,
        requested_intent: SocialAuthIntent.login,
        state_hash: expect.any(String),
        expires_at: expect.any(Date),
      }),
    });
    expect(gitHubOAuthService.getSocialAuthorizationUrl).toHaveBeenCalledWith(
      result.state,
    );
    expect(result.authorizationUrl).toContain('scope=read%3Auser+user%3Aemail');
  });


  it('logs in the user already connected to a GitHub account', async () => {
    const githubIdentity = {
      provider: AuthProvider.github,
      providerUserId: '192692935',
      email: 'owner@example.com',
      emailVerified: true,
      username: 'Root12335',
      displayName: 'Root Owner',
      avatarUrl: 'https://github.com/avatar.png',
      profileUrl: 'https://github.com/Root12335',
      rawProfileData: {
        id: 192692935,
        login: 'Root12335',
      },
      accessToken: 'github-token',
    };
    const linkedUser = getUser({
      id: 'linked-user-id',
      email: 'owner@example.com',
      role: UserRole.owner,
    });

    database.authOAuthState.findFirst.mockResolvedValue({
      id: 'state-id',
      requested_role: UserRole.contributor,
      requested_intent: SocialAuthIntent.login,
    });
    gitHubOAuthService.exchangeCodeForSocialIdentity.mockResolvedValue(
      githubIdentity,
    );
    database.authProviderAccount.findUnique.mockResolvedValue(null);
    gitHubOAuthService.findLinkedUserId.mockResolvedValue('linked-user-id');
    database.user.findUnique.mockResolvedValue(linkedUser);
    database.user.update.mockResolvedValue({
      ...linkedUser,
      last_login_at: new Date('2026-07-08T12:00:00Z'),
    });

    const result = await service.complete({
      provider: AuthProvider.github,
      code: 'oauth-code',
      state: 'oauth-state',
      context: {},
    });

    expect(database.user.create).not.toHaveBeenCalled();
    expect(database.authProviderAccount.upsert).toHaveBeenCalledWith({
      where: {
        provider_provider_account_id: {
          provider: AuthProvider.github,
          provider_account_id: '192692935',
        },
      },
      create: expect.objectContaining({
        user_id: 'linked-user-id',
        provider: AuthProvider.github,
        provider_account_id: '192692935',
      }),
      update: expect.any(Object),
    });
    expect(result.user).toMatchObject({
      id: 'linked-user-id',
      role: UserRole.owner,
    });
  });

  it('suggests an available GitHub login as the new social user username', async () => {
    database.authOAuthState.findFirst.mockResolvedValue({
      id: 'state-id',
      requested_role: UserRole.contributor,
      requested_intent: SocialAuthIntent.register,
    });
    gitHubOAuthService.exchangeCodeForSocialIdentity.mockResolvedValue({
      provider: AuthProvider.github,
      providerUserId: 'github-123',
      email: 'github@example.com',
      emailVerified: true,
      username: 'Root12335',
      displayName: 'Root Owner',
      avatarUrl: 'https://github.com/avatar.png',
      profileUrl: 'https://github.com/Root12335',
      rawProfileData: {
        id: 123,
        login: 'Root12335',
      },
    });
    database.authProviderAccount.findUnique.mockResolvedValue(null);
    gitHubOAuthService.findLinkedUserId.mockResolvedValue(null);
    database.user.findUnique.mockResolvedValue(null);
    identityUsernameService.getAvailableUsernameOrNull.mockResolvedValue(
      'root12335',
    );
    database.user.create.mockResolvedValue(
      getUser({
        id: 'github-user-id',
        email: 'github@example.com',
        username: 'root12335',
        role: UserRole.contributor,
      }),
    );
    database.user.update.mockResolvedValue(
      getUser({
        id: 'github-user-id',
        email: 'github@example.com',
        username: 'root12335',
        role: UserRole.contributor,
        last_login_at: new Date('2026-07-08T12:00:00Z'),
      }),
    );

    await service.complete({
      provider: AuthProvider.github,
      code: 'oauth-code',
      state: 'oauth-state',
      context: {},
    });

    expect(
      identityUsernameService.getAvailableUsernameOrNull,
    ).toHaveBeenCalledWith('Root12335');
    expect(database.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'github@example.com',
        username: 'root12335',
      }),
    });
  });

  it('does not create a user when an unknown GitHub identity starts from login', async () => {
    database.authOAuthState.findFirst.mockResolvedValue({
      id: 'state-id',
      requested_role: UserRole.contributor,
      requested_intent: SocialAuthIntent.login,
    });
    gitHubOAuthService.exchangeCodeForSocialIdentity.mockResolvedValue({
      provider: AuthProvider.github,
      providerUserId: 'new-github-id',
      email: 'new@example.com',
      emailVerified: true,
      username: 'new-github-user',
      rawProfileData: {},
    });
    database.authProviderAccount.findUnique.mockResolvedValue(null);
    gitHubOAuthService.findLinkedUserId.mockResolvedValue(null);
    database.user.findUnique.mockResolvedValue(null);

    await expect(
      service.complete({
        provider: AuthProvider.github,
        code: 'oauth-code',
        state: 'oauth-state',
        context: {},
      }),
    ).rejects.toMatchObject({
      code: 'SOCIAL_AUTH_ACCOUNT_NOT_FOUND',
      statusCode: 404,
    });

    expect(database.user.create).not.toHaveBeenCalled();
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('does not sign in a GitHub account that starts from register', async () => {
    const existingUser = getUser({
      id: 'github-user-id',
      email: 'github@example.com',
      role: UserRole.contributor,
    });
    database.authOAuthState.findFirst.mockResolvedValue({
      id: 'state-id',
      requested_role: UserRole.contributor,
      requested_intent: SocialAuthIntent.register,
    });
    gitHubOAuthService.exchangeCodeForSocialIdentity.mockResolvedValue({
      provider: AuthProvider.github,
      providerUserId: 'known-github-id',
      email: 'github@example.com',
      emailVerified: true,
      username: 'known-github-user',
      rawProfileData: {},
    });
    database.authProviderAccount.findUnique.mockResolvedValue({
      user: existingUser,
    });
    gitHubOAuthService.findLinkedGitHubIdForUser.mockResolvedValue(
      'known-github-id',
    );

    await expect(
      service.complete({
        provider: AuthProvider.github,
        code: 'oauth-code',
        state: 'oauth-state',
        context: {},
      }),
    ).rejects.toMatchObject({
      code: 'SOCIAL_AUTH_ACCOUNT_ALREADY_EXISTS',
      statusCode: 409,
    });

    expect(database.authProviderAccount.upsert).not.toHaveBeenCalled();
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('does not sign in an existing user only because GitHub reports the same email', async () => {
    const existingUser = getUser({
      id: 'manual-user-id',
      email: 'shared@example.com',
      role: UserRole.contributor,
    });
    database.authOAuthState.findFirst.mockResolvedValue({
      id: 'state-id',
      requested_role: UserRole.contributor,
      requested_intent: SocialAuthIntent.login,
    });
    gitHubOAuthService.exchangeCodeForSocialIdentity.mockResolvedValue({
      provider: AuthProvider.github,
      providerUserId: 'selected-github-id',
      email: 'shared@example.com',
      emailVerified: true,
      username: 'selected-github-user',
      rawProfileData: {},
    });
    database.authProviderAccount.findUnique.mockResolvedValue(null);
    gitHubOAuthService.findLinkedUserId.mockResolvedValue(null);
    database.user.findUnique.mockResolvedValue(existingUser);

    await expect(
      service.complete({
        provider: AuthProvider.github,
        code: 'oauth-code',
        state: 'oauth-state',
        context: {},
      }),
    ).rejects.toMatchObject({
      code: 'GITHUB_SIGN_IN_EMAIL_CONFLICT',
      statusCode: 409,
    });

    expect(database.authProviderAccount.upsert).not.toHaveBeenCalled();
    expect(database.user.update).not.toHaveBeenCalled();
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('rejects a historical social link that conflicts with the connected GitHub account', async () => {
    const existingUser = getUser({
      id: 'mismatched-user-id',
      email: 'shared@example.com',
      role: UserRole.contributor,
    });
    database.authOAuthState.findFirst.mockResolvedValue({
      id: 'state-id',
      requested_role: UserRole.contributor,
      requested_intent: SocialAuthIntent.login,
    });
    gitHubOAuthService.exchangeCodeForSocialIdentity.mockResolvedValue({
      provider: AuthProvider.github,
      providerUserId: 'selected-github-id',
      email: 'shared@example.com',
      emailVerified: true,
      username: 'selected-github-user',
      rawProfileData: {},
    });
    database.authProviderAccount.findUnique.mockResolvedValue({
      user: existingUser,
    });
    gitHubOAuthService.findLinkedGitHubIdForUser.mockResolvedValue(
      'different-connected-github-id',
    );

    await expect(
      service.complete({
        provider: AuthProvider.github,
        code: 'oauth-code',
        state: 'oauth-state',
        context: {},
      }),
    ).rejects.toMatchObject({
      code: 'GITHUB_AUTH_ACCOUNT_MISMATCH',
      statusCode: 409,
    });

    expect(database.authProviderAccount.upsert).not.toHaveBeenCalled();
    expect(database.user.update).not.toHaveBeenCalled();
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('replaces a stale GitHub provider link after an authenticated account connection', async () => {
    const connectedAccount = {
      id: 'github-account-id',
      githubId: 'new-github-id',
      username: 'new-github-user',
      avatarUrl: 'https://github.com/new-avatar.png',
      profileUrl: 'https://github.com/new-github-user',
      ingestionStatus: 'pending' as const,
      connectedAt: new Date('2026-07-21T00:00:00.000Z'),
      lastSyncedAt: null,
    };
    database.authProviderAccount.findUnique.mockResolvedValue(null);
    gitHubOAuthService.connectWithCallback.mockImplementation(
      async (_code, _state, options) => {
        await options.assertCanLink(connectedAccount.githubId);
        return connectedAccount;
      },
    );

    const result = await service.connectGitHubAccount({
      userId: 'manual-user-id',
      code: 'oauth-code',
      state: 'oauth-state',
    });

    expect(gitHubOAuthService.connectWithCallback).toHaveBeenCalledWith(
      'oauth-code',
      'oauth-state',
      expect.objectContaining({
        expectedUserId: 'manual-user-id',
        assertCanLink: expect.any(Function),
      }),
    );
    expect(database.authProviderAccount.deleteMany).toHaveBeenCalledWith({
      where: {
        provider: AuthProvider.github,
        user_id: 'manual-user-id',
        provider_account_id: { not: 'new-github-id' },
      },
    });
    expect(database.authProviderAccount.upsert).toHaveBeenCalledWith({
      where: {
        provider_provider_account_id: {
          provider: AuthProvider.github,
          provider_account_id: 'new-github-id',
        },
      },
      create: expect.objectContaining({
        user_id: 'manual-user-id',
        provider: AuthProvider.github,
        provider_account_id: 'new-github-id',
        username: 'new-github-user',
      }),
      update: expect.objectContaining({ username: 'new-github-user' }),
    });
    expect(result).toBe(connectedAccount);
  });

  it('disconnects both the repository account and GitHub sign-in link when another login remains', async () => {
    database.user.findUnique.mockResolvedValue({
      password_hash: 'password-hash',
      authProviderAccounts: [],
    });

    await service.disconnectGitHubAccount('manual-user-id');

    expect(gitHubOAuthService.disconnect).toHaveBeenCalledWith('manual-user-id');
    expect(database.authProviderAccount.deleteMany).toHaveBeenCalledWith({
      where: {
        provider: AuthProvider.github,
        user_id: 'manual-user-id',
      },
    });
  });

  it('prevents disconnecting GitHub when it is the only available login method', async () => {
    database.user.findUnique.mockResolvedValue({
      password_hash: null,
      authProviderAccounts: [],
    });

    await expect(
      service.disconnectGitHubAccount('github-only-user-id'),
    ).rejects.toMatchObject({
      code: 'GITHUB_DISCONNECT_WOULD_LOCK_ACCOUNT',
      statusCode: 409,
    });

    expect(gitHubOAuthService.disconnect).not.toHaveBeenCalled();
    expect(database.authProviderAccount.deleteMany).not.toHaveBeenCalled();
  });

  it('does not replace an existing avatar when another provider uses the same email', async () => {
    const existingAvatar = 'https://sharek.example/user-selected-avatar.png';
    const existingUser = getUser({
      id: 'same-email-user',
      email: 'shared@example.com',
      role: UserRole.contributor,
      avatar_url: existingAvatar,
    });
    database.authOAuthState.findFirst.mockResolvedValue({
      id: 'state-id',
      requested_role: UserRole.contributor,
      requested_intent: SocialAuthIntent.login,
    });
    googleOAuthService.exchangeCodeForSocialIdentity.mockResolvedValue({
      provider: AuthProvider.google,
      providerUserId: 'google-456',
      email: 'shared@example.com',
      emailVerified: true,
      displayName: 'Shared User',
      avatarUrl: 'https://google.example/different-avatar.png',
      rawProfileData: {},
    });
    database.authProviderAccount.findUnique.mockResolvedValue(null);
    database.user.findUnique.mockResolvedValue(existingUser);
    database.user.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...existingUser, ...data }),
    );

    await service.complete({
      provider: AuthProvider.google,
      code: 'oauth-code',
      state: 'oauth-state',
      context: {},
    });

    expect(database.user.update).toHaveBeenCalledWith({
      where: { id: existingUser.id },
      data: {
        avatar_url: existingAvatar,
        last_login_at: expect.any(Date),
      },
    });
  });
});

function getUser(overrides: {
  id: string;
  email: string;
  username?: string | null;
  role: UserRole;
  last_login_at?: Date | null;
  avatar_url?: string | null;
}) {
  return {
    id: overrides.id,
    email: overrides.email,
    username: overrides.username ?? null,
    password_hash: null,
    first_name: 'Sharek',
    last_name: 'User',
    avatar_url: overrides.avatar_url ?? null,
    role: overrides.role,
    status: UserStatus.active,
    preferred_language: LanguageCode.en,
    created_at: new Date('2026-07-08T00:00:00Z'),
    updated_at: new Date('2026-07-08T00:00:00Z'),
    last_login_at: overrides.last_login_at ?? null,
  };
}
