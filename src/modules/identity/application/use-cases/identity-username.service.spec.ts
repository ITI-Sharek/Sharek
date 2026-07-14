import { User } from '@prisma/client';

import { IdentityUsernameService } from './identity-username.service';

const baseUser = {
  id: 'user-1',
  email: 'Jane.Doe@example.com',
  username: null,
  password_hash: 'hash',
  first_name: 'Jane',
  last_name: 'Doe',
  avatar_url: null,
  role: 'contributor',
  status: 'active',
  preferred_language: 'en',
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: null,
} as User;

function createService(database: {
  findUnique?: jest.Mock;
  update?: jest.Mock;
}) {
  return new IdentityUsernameService({
    user: {
      findUnique: database.findUnique ?? jest.fn(),
      update: database.update ?? jest.fn(),
    },
  } as any);
}

describe('IdentityUsernameService', () => {
  it('returns an existing contributor username unchanged', async () => {
    const user = {
      ...baseUser,
      username: 'jane-doe',
    };
    const service = createService({});

    await expect(service.ensureContributorUsernameForUser(user)).resolves.toBe(user);
  });

  it('reports an available username', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = createService({ findUnique });

    await expect(service.checkAvailability('jane-doe')).resolves.toEqual({
      available: true,
      suggestion: null,
      reason: null,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        username: 'jane-doe',
      },
    });
  });

  it('reports invalid and reserved usernames without querying the database', async () => {
    const findUnique = jest.fn();
    const service = createService({ findUnique });

    await expect(service.checkAvailability('Jane')).resolves.toMatchObject({
      available: false,
      reason: 'invalid_format',
    });
    await expect(service.checkAvailability('admin')).resolves.toMatchObject({
      available: false,
      reason: 'reserved',
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('reports taken usernames with a suggested alternative', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(baseUser)
      .mockResolvedValueOnce(null);
    const service = createService({ findUnique });

    await expect(service.checkAvailability('jane-doe')).resolves.toEqual({
      available: false,
      suggestion: 'jane-doe-1',
      reason: 'taken',
    });
  });

  it('returns a normalized OAuth username only when it is available', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = createService({ findUnique });

    await expect(service.getAvailableUsernameOrNull('JaneDoe')).resolves.toBe(
      'janedoe',
    );
    await expect(service.getAvailableUsernameOrNull('Admin')).resolves.toBeNull();
  });

  it('returns a suffixed suggestion when an OAuth username is taken', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(baseUser)
      .mockResolvedValueOnce(null);
    const service = createService({ findUnique });

    await expect(service.getAvailableUsernameOrNull('JaneDoe')).resolves.toBe(
      'janedoe-1',
    );
  });

  it('retries deterministic suffixes after username collisions', async () => {
    const findUnique = jest.fn().mockResolvedValue(baseUser);
    const update = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({
        ...baseUser,
        username: 'jane-doe-1',
      });
    const service = createService({ findUnique, update });

    await expect(service.ensureContributorUsernameForUser(baseUser)).resolves.toMatchObject({
      username: 'jane-doe-1',
    });
    expect(update).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'user-1',
      },
      data: {
        username: 'jane-doe',
      },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'user-1',
      },
      data: {
        username: 'jane-doe-1',
      },
    });
  });

  it('returns 409 after all deterministic candidates collide', async () => {
    const findUnique = jest.fn().mockResolvedValue(baseUser);
    const update = jest.fn().mockRejectedValue({ code: 'P2002' });
    const service = createService({ findUnique, update });

    await expect(service.ensureContributorUsernameForUser(baseUser)).rejects.toMatchObject({
      code: 'USERNAME_CONFLICT',
      statusCode: 409,
    });
    expect(update).toHaveBeenCalledTimes(11);
  });

  it('returns 422 when source data cannot produce a valid username', async () => {
    const service = createService({});

    await expect(
      service.ensureContributorUsernameForUser({
        ...baseUser,
        first_name: '!',
        last_name: '',
        email: '@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_PROFILE_SOURCE',
      statusCode: 422,
    });
  });
});
