import {
  AuthProvider,
  LanguageCode,
  UserRole,
  UserStatus,
} from '@prisma/client';

import { SocialAuthService } from './social-auth.service';

describe('SocialAuthService', () => {
  const database = {
    authOAuthState: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    authProviderAccount: {
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
    findLinkedUserId: jest.fn(),
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

    const result = await service.start(AuthProvider.github, UserRole.contributor);

    expect(database.authOAuthState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: AuthProvider.github,
        requested_role: UserRole.contributor,
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
});

function getUser(overrides: {
  id: string;
  email: string;
  username?: string | null;
  role: UserRole;
  last_login_at?: Date | null;
}) {
  return {
    id: overrides.id,
    email: overrides.email,
    username: overrides.username ?? null,
    password_hash: null,
    first_name: 'Sharek',
    last_name: 'User',
    avatar_url: null,
    role: overrides.role,
    status: UserStatus.active,
    preferred_language: LanguageCode.en,
    created_at: new Date('2026-07-08T00:00:00Z'),
    updated_at: new Date('2026-07-08T00:00:00Z'),
    last_login_at: overrides.last_login_at ?? null,
  };
}
