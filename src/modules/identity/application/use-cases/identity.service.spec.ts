import { LanguageCode, UserRole, UserStatus } from '@prisma/client';

import { hashToken } from '../../../../shared/auth/token-hash';
import { IdentityService } from './identity.service';

describe('IdentityService', () => {
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
    },
  };
  const passwordHasher = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const sessionTokenService = {
    generate: jest.fn(),
  };
  const emailVerificationSender = {
    sendOtp: jest.fn(),
  };
  const service = new IdentityService(
    database as never,
    passwordHasher as never,
    sessionTokenService as never,
    emailVerificationSender as never,
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

  it('registers a pending user and sends an email verification OTP', async () => {
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

  it('verifies a valid OTP, activates the user, and creates a session', async () => {
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

  it('rejects login before email verification', async () => {
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
});

function getUser(overrides: {
  status: UserStatus;
  password_hash?: string | null;
}) {
  return {
    id: 'user-id',
    email: 'owner@example.com',
    password_hash: overrides.password_hash ?? 'hashed-password',
    first_name: 'Sharek',
    last_name: 'Owner',
    avatar_url: null,
    role: UserRole.owner,
    status: overrides.status,
    preferred_language: LanguageCode.en,
    created_at: new Date('2026-07-09T00:00:00Z'),
    updated_at: new Date('2026-07-09T00:00:00Z'),
    last_login_at: null,
  };
}
