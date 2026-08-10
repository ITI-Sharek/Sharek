import { UserRole, UserStatus } from '@prisma/client';

import { SessionService } from './session.service';

describe('SessionService', () => {
  const tokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenHash: 'access-hash',
    refreshTokenHash: 'refresh-hash',
  };

  function createService() {
    const database = {
      authSession: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        update: jest.fn(),
      },
    };
    const sessionTokenService = {
      generate: jest.fn().mockReturnValue(tokens),
      hash: jest.fn().mockReturnValue('refresh-hash'),
    };
    const identityUsernameService = {
      ensureContributorUsernameForUser: jest.fn().mockImplementation((user) => user),
    };

    return {
      database,
      service: new SessionService(
        database as never,
        sessionTokenService as never,
        identityUsernameService as never,
      ),
    };
  }

  it('creates a session with hashed tokens and request context', async () => {
    const { database, service } = createService();

    await expect(
      service.create('user-1', {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      }),
    ).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(database.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user-1',
        access_token_hash: 'access-hash',
        refresh_token_hash: 'refresh-hash',
        user_agent: 'jest',
        ip_address: '127.0.0.1',
      }),
    });
  });

  it('allows pending contributor refresh and rotates tokens', async () => {
    const { database, service } = createService();
    database.authSession.findFirst.mockResolvedValue({
      id: 'session-1',
      user: {
        role: UserRole.contributor,
        status: UserStatus.pending,
      },
    });

    await expect(service.refresh('refresh-token')).resolves.toMatchObject({
      accessToken: 'access-token',
    });
    expect(database.authSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        access_token_hash: 'access-hash',
        refresh_token_hash: 'refresh-hash',
      }),
    });
  });

  it('updates the current user preferred language and returns the public auth user DTO', async () => {
    const { database, service } = createService();
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      password_hash: null,
      first_name: 'First',
      last_name: 'User',
      avatar_url: null,
      role: UserRole.contributor,
      status: UserStatus.active,
      preferred_language: 'ar' as const,
      created_at: new Date('2026-08-08T10:00:00.000Z'),
      updated_at: new Date('2026-08-08T10:00:00.000Z'),
      last_login_at: null,
    };
    database.user.update.mockResolvedValue(user);

    await expect(service.updateCurrentUserPreferences('user-1', 'ar')).resolves.toEqual(
      expect.objectContaining({
        id: 'user-1',
        preferredLanguage: 'ar',
      }),
    );
    expect(database.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { preferred_language: 'ar' },
    });
  });
});
