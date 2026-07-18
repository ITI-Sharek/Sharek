import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';

import { hashToken } from '../../../shared/auth/token-hash';
import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { ForgotPasswordRequest } from '../dto/forgot-password.request';
import { ResetPasswordRequest } from '../dto/reset-password.request';
import { EmailVerificationSender } from '../integrations/email-verification.sender';
import { PasswordHasher } from '../security/password-hasher.service';

const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailVerificationSender: EmailVerificationSender,
  ) {}

  async forgotPassword(
    input: ForgotPasswordRequest,
  ): Promise<{ message: string; resetExpiresAt: Date }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.user.findUnique({ where: { email } });
    const message =
      'If an account with that email exists, a reset code has been sent';

    if (!user || !user.password_hash) {
      return {
        message,
        resetExpiresAt: new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS),
      };
    }

    const { expiresAt } = await this.issueOtp(user);
    return { message, resetExpiresAt: expiresAt };
  }

  async resetPassword(input: ResetPasswordRequest): Promise<{ message: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.user.findUnique({ where: { email } });

    if (!user) {
      throw this.invalidResetCodeError();
    }

    const resetOtp = await this.database.passwordResetOtp.findFirst({
      where: {
        user_id: user.id,
        consumed_at: null,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!resetOtp || resetOtp.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      throw this.invalidResetCodeError();
    }

    if (resetOtp.code_hash !== hashToken(input.code.trim())) {
      await this.database.passwordResetOtp.update({
        where: { id: resetOtp.id },
        data: { attempts: { increment: 1 } },
      });
      throw this.invalidResetCodeError();
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.database.user.update({
      where: { id: user.id },
      data: { password_hash: passwordHash },
    });
    await this.database.passwordResetOtp.update({
      where: { id: resetOtp.id },
      data: { consumed_at: new Date() },
    });
    await this.database.authSession.updateMany({
      where: { user_id: user.id, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    return { message: 'Password has been reset successfully' };
  }

  private async issueOtp(user: {
    id: string;
    email: string;
    first_name: string;
    preferred_language: 'en' | 'ar';
  }): Promise<{ expiresAt: Date }> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS);

    await this.database.passwordResetOtp.updateMany({
      where: { user_id: user.id, consumed_at: null },
      data: { consumed_at: new Date() },
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
      language: user.preferred_language,
    });

    return { expiresAt };
  }

  private invalidResetCodeError(): ApplicationError {
    return new ApplicationError(
      'Password reset code is invalid or expired',
      'PASSWORD_RESET_INVALID',
      400,
    );
  }
}
