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
  const googleOAuthClient = {
    getAuthorizationUrl: jest.fn(),
    exchangeCodeForIdentity: jest.fn(),
  };
  const gitHubOAuthService = {
    getSocialAuthorizationUrl: jest.fn(),
    exchangeCodeForSocialIdentity: jest.fn(),
    findLinkedUserId: jest.fn(),
    upsertConnectedAccountFromSocial: jest.fn(),
  };
  const sessionTokenService = {
    generate: jest.fn(),
  };
  const service = new SocialAuthService(
    database as never,
    googleOAuthClient as never,
    gitHubOAuthService as never,
    sessionTokenService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    sessionTokenService.generate.mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenHash: 'access-token-hash',
      refreshTokenHash: 'refresh-token-hash',
    });
  });

  it('starts Google auth with a hashed state and requested role', async () => {
    googleOAuthClient.getAuthorizationUrl.mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );

    const result = await service.start(AuthProvider.google, UserRole.contributor);

    expect(database.authOAuthState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: AuthProvider.google,
        requested_role: UserRole.contributor,
        state_hash: expect.any(String),
        expires_at: expect.any(Date),
      }),
    });
    expect(googleOAuthClient.getAuthorizationUrl).toHaveBeenCalledWith(
      result.state,
    );
    expect(result).toMatchObject({
      provider: AuthProvider.google,
      role: UserRole.contributor,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
  });

  it('creates a contributor from a verified Google identity', async () => {
    database.authOAuthState.findFirst.mockResolvedValue({
      id: 'state-id',
      requested_role: UserRole.contributor,
    });
    googleOAuthClient.exchangeCodeForIdentity.mockResolvedValue({
      provider: AuthProvider.google,
      providerUserId: 'google-123',
      email: 'contributor@example.com',
      emailVerified: true,
      firstName: 'Connie',
      lastName: 'Contributor',
      avatarUrl: 'https://example.com/avatar.png',
      rawProfileData: {
        sub: 'google-123',
      },
    });
    database.authProviderAccount.findUnique.mockResolvedValue(null);
    database.user.findUnique.mockResolvedValue(null);
    database.user.create.mockResolvedValue(
      getUser({
        id: 'new-user-id',
        email: 'contributor@example.com',
        role: UserRole.contributor,
      }),
    );
    database.user.update.mockResolvedValue(
      getUser({
        id: 'new-user-id',
        email: 'contributor@example.com',
        role: UserRole.contributor,
        last_login_at: new Date('2026-07-08T12:00:00Z'),
      }),
    );

    const result = await service.complete({
      provider: AuthProvider.google,
      code: 'oauth-code',
      state: 'oauth-state',
      context: {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
    });

    expect(database.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'contributor@example.com',
        password_hash: null,
        first_name: 'Connie',
        last_name: 'Contributor',
        role: UserRole.contributor,
        status: UserStatus.active,
        preferred_language: LanguageCode.en,
      }),
    });
    expect(database.authProviderAccount.upsert).toHaveBeenCalledWith({
      where: {
        provider_provider_account_id: {
          provider: AuthProvider.google,
          provider_account_id: 'google-123',
        },
      },
      create: expect.objectContaining({
        user_id: 'new-user-id',
        provider: AuthProvider.google,
        provider_account_id: 'google-123',
      }),
      update: expect.any(Object),
    });
    expect(database.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'new-user-id',
        access_token_hash: 'access-token-hash',
        refresh_token_hash: 'refresh-token-hash',
      }),
    });
    expect(result.tokens).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
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

    expect(gitHubOAuthService.upsertConnectedAccountFromSocial).toHaveBeenCalledWith(
      'linked-user-id',
      githubIdentity,
    );
    expect(database.user.create).not.toHaveBeenCalled();
    expect(result.user).toMatchObject({
      id: 'linked-user-id',
      role: UserRole.owner,
    });
  });
});

function getUser(overrides: {
  id: string;
  email: string;
  role: UserRole;
  last_login_at?: Date | null;
}) {
  return {
    id: overrides.id,
    email: overrides.email,
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
