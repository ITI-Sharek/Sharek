import { Injectable } from '@nestjs/common';
import { LanguageCode, Prisma, UserRole } from '@prisma/client';
import { randomInt } from 'crypto';

import { AuthSessionDto, AuthTokensDto, AuthUserDto } from '../dto/auth-session.dto';
import { EmailVerificationRequiredDto } from '../dto/email-verification.dto';
import { toAuthUserDto } from '../mappers/auth-user.mapper';
import { RegisterRequest } from '../../presentation/http/requests/register.request';
import { LoginRequest } from '../../presentation/http/requests/login.request';
import { ForgotPasswordRequest } from '../../presentation/http/requests/forgot-password.request';
import { ResetPasswordRequest } from '../../presentation/http/requests/reset-password.request';
import { ResendEmailVerificationRequest } from '../../presentation/http/requests/resend-email-verification.request';
import { VerifyEmailRequest } from '../../presentation/http/requests/verify-email.request';
import { hashToken } from '../../../../shared/auth/token-hash';
import { DatabaseService } from '../../../../shared/database/database.service';
import { ApplicationError } from '../../../../shared/errors/application.error';
import { EmailVerificationSender } from '../../infrastructure/integrations/email-verification.sender';
import { PasswordHasher } from '../../infrastructure/security/password-hasher.service';
import { SessionTokenService } from '../../infrastructure/security/session-token.service';
import { IdentityUsernameService } from './identity-username.service';

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionTokenService: SessionTokenService,
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
      tokens: await this.createSession(updatedUser.id, context),
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

    if (!this.canAuthenticate(user)) {
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
      tokens: await this.createSession(user.id, context),
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const tokenHash = this.sessionTokenService.hash(refreshToken);
    const session = await this.database.authSession.findFirst({
      where: {
        refresh_token_hash: tokenHash,
        revoked_at: null,
        refresh_expires_at: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session || !this.canAuthenticate(session.user)) {
      throw new ApplicationError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN', 401);
    }

    await this.ensurePublicAuthUser(session.user);

    const tokens = this.sessionTokenService.generate();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.database.authSession.update({
      where: {
        id: session.id,
      },
      data: {
        access_token_hash: tokens.accessTokenHash,
        refresh_token_hash: tokens.refreshTokenHash,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      refreshExpiresAt,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.database.authSession.update({
      where: {
        id: sessionId,
      },
      data: {
        revoked_at: new Date(),
      },
    });
  }

  async forgotPassword(
    input: ForgotPasswordRequest,
  ): Promise<{ message: string; resetExpiresAt: Date }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: {
        email,
      },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.password_hash) {
      return {
        message: 'If an account with that email exists, a reset code has been sent',
        resetExpiresAt: new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS),
      };
    }

    const { expiresAt } = await this.issuePasswordResetOtp(user);

    return {
      message: 'If an account with that email exists, a reset code has been sent',
      resetExpiresAt: expiresAt,
    };
  }

  async resetPassword(
    input: ResetPasswordRequest,
  ): Promise<{ message: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new ApplicationError(
        'Password reset code is invalid or expired',
        'PASSWORD_RESET_INVALID',
        400,
      );
    }

    const resetOtp = await this.database.passwordResetOtp.findFirst({
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

    if (!resetOtp || resetOtp.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      throw new ApplicationError(
        'Password reset code is invalid or expired',
        'PASSWORD_RESET_INVALID',
        400,
      );
    }

    if (resetOtp.code_hash !== hashToken(input.code.trim())) {
      await this.database.passwordResetOtp.update({
        where: {
          id: resetOtp.id,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      throw new ApplicationError(
        'Password reset code is invalid or expired',
        'PASSWORD_RESET_INVALID',
        400,
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);

    await this.database.user.update({
      where: {
        id: user.id,
      },
      data: {
        password_hash: passwordHash,
      },
    });

    await this.database.passwordResetOtp.update({
      where: {
        id: resetOtp.id,
      },
      data: {
        consumed_at: new Date(),
      },
    });

    // Revoke all existing sessions for security
    await this.database.authSession.updateMany({
      where: {
        user_id: user.id,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
      },
    });

    return {
      message: 'Password has been reset successfully',
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

  async assignRole(userId: string, role: UserRole): Promise<AuthUserDto> {
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
    });

    return {
      expiresAt,
    };
  }

  private async issuePasswordResetOtp(user: {
    id: string;
    email: string;
    first_name: string;
  }): Promise<{ expiresAt: Date }> {
    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS);

    await this.database.passwordResetOtp.updateMany({
      where: {
        user_id: user.id,
        consumed_at: null,
      },
      data: {
        consumed_at: new Date(),
      },
    });
    await this.database.passwordResetOtp.create({
      data: {
        user_id: user.id,
        code_hash: hashToken(code),
        expires_at: expiresAt,
      },
    });
    await this.emailVerificationSender.sendPasswordResetOtp({
      to: user.email,
      firstName: user.first_name,
      code,
      expiresAt,
    });

    return {
      expiresAt,
    };
  }

  private generateOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private async createSession(
    userId: string,
    context: RequestContext,
  ): Promise<AuthTokensDto> {
    const tokens = this.sessionTokenService.generate();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.database.authSession.create({
      data: {
        user_id: userId,
        access_token_hash: tokens.accessTokenHash,
        refresh_token_hash: tokens.refreshTokenHash,
        user_agent: context.userAgent,
        ip_address: context.ipAddress,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      refreshExpiresAt,
    };
  }

  private canAuthenticate(user: {
    role: UserRole;
    status: string;
  }): boolean {
    return user.status === 'active' || (user.role === 'contributor' && user.status === 'pending');
  }

  private async ensurePublicAuthUser(user: Parameters<typeof toAuthUserDto>[0]) {
    return this.identityUsernameService.ensureContributorUsernameForUser(user);
  }
}
