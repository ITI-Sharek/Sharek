import { LanguageCode, User, UserRole, UserStatus } from '@prisma/client';

import { hashToken } from '../../../../shared/auth/token-hash';
import { IdentityService } from './identity.service';

function createService() {
  const database = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationOtp: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const passwordHasher = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const sessionTokenService = {
    generate: jest.fn().mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenHash: 'access-token-hash',
      refreshTokenHash: 'refresh-token-hash',
    }),
    hash: jest.fn().mockReturnValue('refresh-token-hash'),
  };
  const identityUsernameService = {
    assertAvailable: jest.fn().mockResolvedValue(undefined),
    checkAvailability: jest.fn(),
    ensureContributorUsernameForUser: jest.fn().mockImplementation((user: User) =>
      Promise.resolve(
        user.role === UserRole.contributor
          ? {
              ...user,
              username: user.username ?? 'contributor-one',
            }
          : user,
      ),
    ),
  };
  const emailVerificationSender = {
    sendOtp: jest.fn(),
  };

  const service = new IdentityService(
    database as never,
    passwordHasher as never,
    sessionTokenService as never,
    identityUsernameService as never,
    emailVerificationSender as never,
  );

  return {
    database,
    emailVerificationSender,
    identityUsernameService,
    passwordHasher,
    service,
    sessionTokenService,
  };
}

describe('IdentityService', () => {
  it('registers a pending user and sends an email verification OTP', async () => {
    const { database, emailVerificationSender, passwordHasher, service } = createService();
    const user = getUser({ status: UserStatus.pending });

    database.user.findUnique.mockResolvedValue(null);
    passwordHasher.hash.mockResolvedValue('hashed-password');
    database.user.create.mockResolvedValue(user);
    database.emailVerificationOtp.updateMany.mockResolvedValue({ count: 0 });
    database.emailVerificationOtp.create.mockResolvedValue({});

    const result = await service.register(
      {
        email: 'Owner@Example.com',
        password: 'Password123!',
        username: 'sharek-owner',
        firstName: 'Sharek',
        lastName: 'Owner',
        role: UserRole.owner,
        preferredLanguage: LanguageCode.en,
      },
      {},
    );

    expect(database.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'owner@example.com',
        username: 'sharek-owner',
        password_hash: 'hashed-password',
        status: UserStatus.pending,
      }),
    });
    expect(database.emailVerificationOtp.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: user.id,
        code_hash: expect.any(String),
        expires_at: expect.any(Date),
      }),
    });
    expect(emailVerificationSender.sendOtp).toHaveBeenCalledWith({
      to: 'owner@example.com',
      firstName: 'Sharek',
      code: expect.stringMatching(/^\d{6}$/),
      expiresAt: expect.any(Date),
    });
    expect(result).toMatchObject({
      emailVerificationRequired: true,
      user: {
        email: 'owner@example.com',
        status: UserStatus.pending,
      },
    });
    expect(result).not.toHaveProperty('tokens');
  });

  it('rejects register when the username is already taken', async () => {
    const { database, identityUsernameService, passwordHasher, service } =
      createService();

    database.user.findUnique.mockResolvedValue(null);
    identityUsernameService.assertAvailable.mockRejectedValue({
      code: 'USERNAME_TAKEN',
      statusCode: 409,
    });

    await expect(
      service.register(
        {
          email: 'owner@example.com',
          password: 'Password123!',
          username: 'sharek-owner',
          firstName: 'Sharek',
          lastName: 'Owner',
          role: UserRole.owner,
          preferredLanguage: LanguageCode.en,
        },
        {},
      ),
    ).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
      statusCode: 409,
    });
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(database.user.create).not.toHaveBeenCalled();
  });

  it('verifies a valid OTP, activates the user, and creates a session', async () => {
    const { database, service } = createService();
    const pendingUser = getUser({ status: UserStatus.pending });
    const activeUser = getUser({ status: UserStatus.active });

    database.user.findUnique.mockResolvedValue(pendingUser);
    database.emailVerificationOtp.findFirst.mockResolvedValue({
      id: 'otp-id',
      code_hash: hashToken('123456'),
      attempts: 0,
    });
    database.user.update.mockResolvedValue(activeUser);
    database.emailVerificationOtp.update.mockResolvedValue({});
    database.authSession.create.mockResolvedValue({});

    const result = await service.verifyEmail(
      {
        email: 'owner@example.com',
        code: '123456',
      },
      {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
    );

    expect(database.user.update).toHaveBeenCalledWith({
      where: {
        id: pendingUser.id,
      },
      data: expect.objectContaining({
        status: UserStatus.active,
      }),
    });
    expect(database.emailVerificationOtp.update).toHaveBeenCalledWith({
      where: {
        id: 'otp-id',
      },
      data: {
        consumed_at: expect.any(Date),
      },
    });
    expect(database.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: activeUser.id,
        access_token_hash: 'access-token-hash',
        refresh_token_hash: 'refresh-token-hash',
      }),
    });
    expect(result.tokens).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(result.user.status).toBe(UserStatus.active);
  });

  it('rejects pending owner login before email verification', async () => {
    const { database, passwordHasher, service } = createService();

    database.user.findUnique.mockResolvedValue(
      getUser({ status: UserStatus.pending, password_hash: 'hashed-password' }),
    );
    passwordHasher.verify.mockResolvedValue(true);

    await expect(
      service.login(
        {
          email: 'owner@example.com',
          password: 'Password123!',
        },
        {},
      ),
    ).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      statusCode: 403,
    });
  });

  it('returns username in login auth user DTO for active contributors', async () => {
    const { database, passwordHasher, service } = createService();
    const activeContributor = getUser({
      email: 'contributor@example.com',
      username: 'contributor-one',
      role: UserRole.contributor,
      status: UserStatus.active,
    });

    database.user.findUnique.mockResolvedValue(activeContributor);
    database.user.update.mockResolvedValue(activeContributor);
    database.authSession.create.mockResolvedValue({});
    passwordHasher.verify.mockResolvedValue(true);

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
        role: UserRole.contributor,
      },
      tokens: {
        accessToken: 'access-token',
      },
    });
  });

  it('allows pending contributors to login and refresh', async () => {
    const { database, passwordHasher, service } = createService();
    const pendingContributor = getUser({
      email: 'contributor@example.com',
      username: null,
      role: UserRole.contributor,
      status: UserStatus.pending,
    });

    database.user.findUnique.mockResolvedValue(pendingContributor);
    database.user.update.mockResolvedValue(pendingContributor);
    database.authSession.create.mockResolvedValue({});
    database.authSession.findFirst.mockResolvedValue({
      id: 'session-1',
      user: pendingContributor,
    });
    database.authSession.update.mockResolvedValue({ id: 'session-1' });
    passwordHasher.verify.mockResolvedValue(true);

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
        status: UserStatus.pending,
      },
    });
    await expect(service.refresh('refresh-token')).resolves.toMatchObject({
      accessToken: 'access-token',
    });
  });

  it.each([UserStatus.suspended, UserStatus.deactivated])(
    'rejects %s contributors during login',
    async (status) => {
      const { database, passwordHasher, service } = createService();

      database.user.findUnique.mockResolvedValue(
        getUser({
          role: UserRole.contributor,
          status,
        }),
      );
      passwordHasher.verify.mockResolvedValue(true);

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
    const { database, service } = createService();

    database.user.findUnique.mockResolvedValue(null);

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

function getUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-id',
    email: 'owner@example.com',
    username: null,
    password_hash: 'hashed-password',
    first_name: 'Sharek',
    last_name: 'Owner',
    avatar_url: null,
    role: UserRole.owner,
    status: UserStatus.active,
    preferred_language: LanguageCode.en,
    created_at: new Date('2026-07-09T00:00:00Z'),
    updated_at: new Date('2026-07-09T00:00:00Z'),
    last_login_at: null,
    ...overrides,
  } as User;
}
