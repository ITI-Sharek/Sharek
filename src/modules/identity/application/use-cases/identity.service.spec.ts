import { User } from '@prisma/client';

import { IdentityService } from './identity.service';

const activeContributor = {
  id: 'user-1',
  email: 'contributor@example.com',
  username: 'contributor-one',
  password_hash: 'hash',
  first_name: 'Contributor',
  last_name: 'One',
  avatar_url: null,
  role: 'contributor',
  status: 'active',
  preferred_language: 'en',
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: null,
} as User;

function createService(user: User | null = activeContributor) {
  const database = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockResolvedValue(user),
    },
    authSession: {
      create: jest.fn().mockResolvedValue({ id: 'session-1' }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'session-1',
        user,
      }),
      update: jest.fn().mockResolvedValue({ id: 'session-1' }),
    },
  };

  const service = new IdentityService(
    database as any,
    {
      hash: jest.fn().mockResolvedValue('hash'),
      verify: jest.fn().mockResolvedValue(true),
    } as any,
    {
      generate: jest.fn().mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenHash: 'access-hash',
        refreshTokenHash: 'refresh-hash',
      }),
      hash: jest.fn().mockReturnValue('refresh-hash'),
    } as any,
    {
      ensureContributorUsernameForUser: jest.fn().mockImplementation((value) =>
        Promise.resolve({
          ...value,
          username: value.username ?? 'contributor-one',
        }),
      ),
    } as any,
  );

  return { service, database };
}

describe('IdentityService auth policy', () => {
  it('returns username in login auth user DTO for active contributors', async () => {
    const { service } = createService();

    await expect(
      service.login(
        {
          email: 'contributor@example.com',
          password: 'Password123!',
        },
        {},
      ),
    ).resolves.toMatchObject({
      user: {
        username: 'contributor-one',
        role: 'contributor',
      },
      tokens: {
        accessToken: 'access-token',
      },
    });
  });

  it('allows pending contributors to login and refresh', async () => {
    const pendingContributor = {
      ...activeContributor,
      status: 'pending',
      username: null,
    } as User;
    const { service, database } = createService(pendingContributor);
    database.user.update.mockResolvedValue(pendingContributor);

    await expect(
      service.login(
        {
          email: 'contributor@example.com',
          password: 'Password123!',
        },
        {},
      ),
    ).resolves.toMatchObject({
      user: {
        username: 'contributor-one',
        status: 'pending',
      },
    });
    await expect(service.refresh('refresh-token')).resolves.toMatchObject({
      accessToken: 'access-token',
    });
  });

  it.each(['suspended', 'deactivated'])(
    'rejects %s contributors during login',
    async (status) => {
      const { service } = createService({
        ...activeContributor,
        status,
      } as User);

      await expect(
        service.login(
          {
            email: 'contributor@example.com',
            password: 'Password123!',
          },
          {},
        ),
      ).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_ACTIVE',
        statusCode: 403,
      });
    },
  );

  it('rejects invalid credentials as 401', async () => {
    const { service } = createService(null);

    await expect(
      service.login(
        {
          email: 'missing@example.com',
          password: 'Password123!',
        },
        {},
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
  });
});
