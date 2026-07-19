import { Injectable } from '@nestjs/common';
import { LanguageCode, Prisma, UserRole, UserStatus } from '@prisma/client';
import { randomInt } from 'crypto';

import { AuthSessionDto, AuthUserDto } from '../dto/auth-session.dto';
import { EmailVerificationRequiredDto } from '../dto/email-verification.dto';
import { toAuthUserDto } from '../mappers/auth-user.mapper';
import { RegisterRequest } from '../dto/register.request';
import { LoginRequest } from '../dto/login.request';
import { ResendEmailVerificationRequest } from '../dto/resend-email-verification.request';
import { VerifyEmailRequest } from '../dto/verify-email.request';
import { hashToken } from '../../../shared/auth/token-hash';
import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { EmailVerificationSender } from '../integrations/email-verification.sender';
import { PasswordHasher } from '../security/password-hasher.service';
import { IdentityUsernameService } from './identity-username.service';
import { SessionService } from './session.service';

const EMAIL_VERIFICATION_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionService: SessionService,
    private readonly identityUsernameService: IdentityUsernameService,
    private readonly emailVerificationSender: EmailVerificationSender,
  ) {}

  async register(
    input: RegisterRequest,
    _context: RequestContext,
  ): Promise<EmailVerificationRequiredDto> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.database.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new ApplicationError('Email is already registered', 'EMAIL_TAKEN', 409);
    }

    const username = input.username.trim();
    await this.identityUsernameService.assertAvailable(username);

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.createRegisteredUser(input, email, username, passwordHash);
    const verification = await this.issueEmailVerificationOtp(user);

    return {
      user: toAuthUserDto(user),
      emailVerificationRequired: true,
      verificationExpiresAt: verification.expiresAt,
    };
  }

  checkUsernameAvailability(username: string) {
    return this.identityUsernameService.checkAvailability(username);
  }

  private async createRegisteredUser(
    input: RegisterRequest,
    email: string,
    username: string,
    passwordHash: string,
  ) {
    try {
      return await this.database.user.create({
        data: {
          email,
          username,
          password_hash: passwordHash,
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          role: input.role,
          status: 'pending',
          preferred_language: input.preferredLanguage ?? LanguageCode.en,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'username')) {
        throw new ApplicationError(
          'Username is already taken',
          'USERNAME_TAKEN',
          409,
        );
      }

      if (this.isUniqueConstraintError(error, 'email')) {
        throw new ApplicationError(
          'Email is already registered',
          'EMAIL_TAKEN',
          409,
        );
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown, field: string): boolean {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError ||
        (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002')
      )
    ) {
      return false;
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'meta' in error &&
      typeof error.meta === 'object' &&
      error.meta !== null &&
      'target' in error.meta
    ) {
      const target = error.meta.target;
      return Array.isArray(target) && target.includes(field);
    }

    return true;
  }

  async verifyEmail(
    input: VerifyEmailRequest,
    context: RequestContext,
  ): Promise<AuthSessionDto> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new ApplicationError(
        'Email verification code is invalid or expired',
        'EMAIL_VERIFICATION_INVALID',
        400,
      );
    }

    if (user.status === 'active') {
      throw new ApplicationError(
        'Email is already verified',
        'EMAIL_ALREADY_VERIFIED',
        409,
      );
    }

    const verification = await this.database.emailVerificationOtp.findFirst({
      where: {
        user_id: user.id,
        consumed_at: null,
        expires_at: {
          gt: new Date(),
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (!verification || verification.attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      throw new ApplicationError(
        'Email verification code is invalid or expired',
        'EMAIL_VERIFICATION_INVALID',
        400,
      );
    }

    if (verification.code_hash !== hashToken(input.code.trim())) {
      await this.database.emailVerificationOtp.update({
        where: {
          id: verification.id,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      throw new ApplicationError(
        'Email verification code is invalid or expired',
        'EMAIL_VERIFICATION_INVALID',
        400,
      );
    }

    const updatedUser = await this.database.user.update({
      where: {
        id: user.id,
      },
      data: {
        status: 'active',
        last_login_at: new Date(),
      },
    });
    await this.database.emailVerificationOtp.update({
      where: {
        id: verification.id,
      },
      data: {
        consumed_at: new Date(),
      },
    });

    const publicUser = await this.ensurePublicAuthUser(updatedUser);

    return {
      user: toAuthUserDto(publicUser),
      tokens: await this.sessionService.create(updatedUser.id, context),
    };
  }

  async resendEmailVerification(
    input: ResendEmailVerificationRequest,
  ): Promise<EmailVerificationRequiredDto> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new ApplicationError('User was not found', 'USER_NOT_FOUND', 404);
    }

    if (user.status === 'active') {
      throw new ApplicationError(
        'Email is already verified',
        'EMAIL_ALREADY_VERIFIED',
        409,
      );
    }

    const verification = await this.issueEmailVerificationOtp(user);

    const publicUser = await this.ensurePublicAuthUser(user);

    return {
      user: toAuthUserDto(publicUser),
      emailVerificationRequired: true,
      verificationExpiresAt: verification.expiresAt,
    };
  }

  async login(input: LoginRequest, context: RequestContext): Promise<AuthSessionDto> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: {
        email,
      },
    });

    if (
      !user ||
      !user.password_hash ||
      !(await this.passwordHasher.verify(input.password, user.password_hash))
    ) {
      throw new ApplicationError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    if (user.status === 'pending' && user.role !== UserRole.contributor) {
      throw new ApplicationError(
        'Email verification is required before login',
        'EMAIL_VERIFICATION_REQUIRED',
        403,
      );
    }

    if (!this.sessionService.canAuthenticate(user)) {
      throw new ApplicationError('Account is not active', 'ACCOUNT_NOT_ACTIVE', 403);
    }

    const updatedUser = await this.database.user.update({
      where: {
        id: user.id,
      },
      data: {
        last_login_at: new Date(),
      },
    });

    const publicUser = await this.ensurePublicAuthUser(updatedUser);

    return {
      user: toAuthUserDto(publicUser),
      tokens: await this.sessionService.create(user.id, context),
    };
  }

  async getCurrentUser(userId: string): Promise<AuthUserDto> {
    const user = await this.database.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new ApplicationError('User was not found', 'USER_NOT_FOUND', 404);
    }

    const publicUser = await this.ensurePublicAuthUser(user);

    return toAuthUserDto(publicUser);
  }

  async assignRole(
    actorUserId: string,
    userId: string,
    role: UserRole,
  ): Promise<AuthUserDto> {
    const actor = await this.database.user.findUnique({
      where: {
        id: actorUserId,
      },
    });

    if (actor?.role !== UserRole.admin || actor.status !== UserStatus.active) {
      throw new ApplicationError(
        'Admin authorization is required',
        'ADMIN_ROLE_REQUIRED',
        403,
      );
    }

    const existingUser = await this.database.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      throw new ApplicationError('User was not found', 'USER_NOT_FOUND', 404);
    }

    const user = await this.database.user.update({
      where: {
        id: userId,
      },
      data: {
        role,
      },
    });

    return toAuthUserDto(user);
  }

  private async issueEmailVerificationOtp(user: {
    id: string;
    email: string;
    first_name: string;
    preferred_language: 'en' | 'ar';
  }): Promise<{ expiresAt: Date }> {
    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_OTP_TTL_MS);

    await this.database.emailVerificationOtp.updateMany({
      where: {
        user_id: user.id,
        consumed_at: null,
      },
      data: {
        consumed_at: new Date(),
      },
    });
    await this.database.emailVerificationOtp.create({
      data: {
        user_id: user.id,
        code_hash: hashToken(code),
        expires_at: expiresAt,
      },
    });
    await this.emailVerificationSender.sendOtp({
      to: user.email,
      firstName: user.first_name,
      code,
      expiresAt,
      language: user.preferred_language,
    });

    return {
      expiresAt,
    };
  }

  private generateOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private async ensurePublicAuthUser(user: Parameters<typeof toAuthUserDto>[0]) {
    return this.identityUsernameService.ensureContributorUsernameForUser(user);
  }
}
