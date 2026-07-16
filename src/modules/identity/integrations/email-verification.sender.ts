import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { ApplicationError } from '../../../shared/errors/application.error';

interface EmailVerificationMessage {
  to: string;
  firstName: string;
  code: string;
  expiresAt: Date;
}

@Injectable()
export class EmailVerificationSender {
  private readonly logger = new Logger(EmailVerificationSender.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  async sendOtp(message: EmailVerificationMessage): Promise<void> {
    if (!this.isConfigured()) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ApplicationError(
          'Email delivery is not configured',
          'EMAIL_DELIVERY_NOT_CONFIGURED',
          500,
        );
      }

      this.logger.warn(
        `Email verification OTP for ${message.to}: ${message.code}`,
      );
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: message.to,
        subject: 'Verify your Share-k email',
        text: this.getTextBody(message),
        html: this.getHtmlBody(message),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${message.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ApplicationError(
        'Verification email could not be sent',
        'EMAIL_VERIFICATION_SEND_FAILED',
        502,
      );
    }
  }

  async sendPasswordResetOtp(message: EmailVerificationMessage): Promise<void> {
    if (!this.isConfigured()) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ApplicationError(
          'Email delivery is not configured',
          'EMAIL_DELIVERY_NOT_CONFIGURED',
          500,
        );
      }

      this.logger.warn(
        `Password reset OTP for ${message.to}: ${message.code}`,
      );
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: message.to,
        subject: 'Reset your Share-k password',
        text: this.getPasswordResetTextBody(message),
        html: this.getPasswordResetHtmlBody(message),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${message.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ApplicationError(
        'Password reset email could not be sent',
        'PASSWORD_RESET_EMAIL_SEND_FAILED',
        502,
      );
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER') ?? '';
    const pass = this.config.get<string>('SMTP_PASS') ?? '';

    this.transporter = nodemailer.createTransport({
      host: this.getRequiredConfig('SMTP_HOST'),
      port,
      secure: this.getBooleanConfig('SMTP_SECURE', port === 465),
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }

  private isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SMTP_HOST') &&
        this.config.get<string>('SMTP_USER') &&
        this.config.get<string>('SMTP_PASS') &&
        this.config.get<string>('EMAIL_FROM'),
    );
  }

  private getFromAddress(): string {
    return this.getRequiredConfig('EMAIL_FROM');
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new ApplicationError(`${key} is not configured`, 'EMAIL_NOT_CONFIGURED', 500);
    }

    return value;
  }

  private getBooleanConfig(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key);

    if (!value) {
      return fallback;
    }

    return ['true', '1', 'yes'].includes(value.toLowerCase());
  }

  private getTextBody(message: EmailVerificationMessage): string {
    return [
      `Hi ${message.firstName},`,
      '',
      `Your Share-k verification code is ${message.code}.`,
      `It expires at ${message.expiresAt.toISOString()}.`,
      '',
      'If you did not create a Share-k account, you can ignore this email.',
    ].join('\n');
  }

  private getHtmlBody(message: EmailVerificationMessage): string {
    return `
      <p>Hi ${this.escapeHtml(message.firstName)},</p>
      <p>Your Share-k verification code is:</p>
      <p><strong style="font-size: 24px; letter-spacing: 4px;">${message.code}</strong></p>
      <p>This code expires at ${message.expiresAt.toISOString()}.</p>
      <p>If you did not create a Share-k account, you can ignore this email.</p>
    `;
  }

  private getPasswordResetTextBody(message: EmailVerificationMessage): string {
    return [
      `Hi ${message.firstName},`,
      '',
      `Your Share-k password reset code is ${message.code}.`,
      `It expires at ${message.expiresAt.toISOString()}.`,
      '',
      'If you did not request a password reset, you can ignore this email.',
    ].join('\n');
  }

  private getPasswordResetHtmlBody(message: EmailVerificationMessage): string {
    return `
      <p>Hi ${this.escapeHtml(message.firstName)},</p>
      <p>Your Share-k password reset code is:</p>
      <p><strong style="font-size: 24px; letter-spacing: 4px;">${message.code}</strong></p>
      <p>This code expires at ${message.expiresAt.toISOString()}.</p>
      <p>If you did not request a password reset, you can ignore this email.</p>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
