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
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const sessionTokenService = {
      generate: jest.fn().mockReturnValue(tokens),
      hash: jest.fn().mockReturnValue('presented-hash'),
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

  function activeSession(overrides: Record<string, unknown> = {}) {
    return {
      id: 'session-1',
      refresh_token_hash: 'presented-hash',
      revoked_at: null,
      refresh_expires_at: new Date(Date.now() + 60_000),
      user: {
        role: UserRole.contributor,
        status: UserStatus.pending,
      },
      ...overrides,
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
    database.authSession.findFirst.mockResolvedValue(activeSession());

    await expect(service.refresh('refresh-token')).resolves.toMatchObject({
      accessToken: 'access-token',
    });
    expect(database.authSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        access_token_hash: 'access-hash',
        refresh_token_hash: 'refresh-hash',
        previous_refresh_token_hash: 'presented-hash',
      }),
    });
  });

  it('rejects a revoked session refresh', async () => {
    const { database, service } = createService();
    database.authSession.findFirst.mockResolvedValue(
      activeSession({ revoked_at: new Date() }),
    );

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(database.authSession.update).not.toHaveBeenCalled();
  });

  it('rejects an expired refresh credential', async () => {
    const { database, service } = createService();
    database.authSession.findFirst.mockResolvedValue(
      activeSession({ refresh_expires_at: new Date(Date.now() - 1_000) }),
    );

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(database.authSession.update).not.toHaveBeenCalled();
  });

  it('revokes the session when a rotated-out refresh credential is replayed', async () => {
    const { database, service } = createService();
    database.authSession.findFirst.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if (where.previous_refresh_token_hash === 'presented-hash') {
          return Promise.resolve(activeSession({ id: 'session-replayed' }));
        }

        return Promise.resolve(null);
      },
    );

    await expect(service.refresh('stale-refresh-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(database.authSession.update).toHaveBeenCalledWith({
      where: { id: 'session-replayed' },
      data: {
        revoked_at: expect.any(Date),
      },
    });
  });

  it('rejects an unknown refresh credential without touching sessions', async () => {
    const { database, service } = createService();

    await expect(service.refresh('unknown-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(database.authSession.update).not.toHaveBeenCalled();
  });

  it('revokes the current session on logout', async () => {
    const { database, service } = createService();

    await service.logout('session-1');

    expect(database.authSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        revoked_at: expect.any(Date),
      }),
    });
  });
});
