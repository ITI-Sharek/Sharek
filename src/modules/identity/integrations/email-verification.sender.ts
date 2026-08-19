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
  language?: 'en' | 'ar';
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
      const isAr = message.language === 'ar';
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: message.to,
        subject: isAr ? 'رمز التوثيق من Share-k' : 'Verify your Share-k email',
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
      const isAr = message.language === 'ar';
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: message.to,
        subject: isAr ? 'إعادة تعيين كلمة مرور Share-k' : 'Reset your Share-k password',
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

  async sendIdentityVerificationApproved(message: {
    to: string;
    firstName: string;
    language?: 'en' | 'ar';
  }): Promise<void> {
    if (!this.isConfigured()) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ApplicationError(
          'Email delivery is not configured',
          'EMAIL_DELIVERY_NOT_CONFIGURED',
          500,
        );
      }

      this.logger.warn(
        `Identity verification approved notification for ${message.to}`,
      );
      return;
    }

    try {
      const isAr = message.language === 'ar';
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: message.to,
        subject: isAr ? 'تم توثيق هويتك بنجاح في Share-k' : 'Your Share-k identity verification has been approved',
        text: this.getIdentityApprovedTextBody(message),
        html: this.getIdentityApprovedHtmlBody(message),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send identity approval email to ${message.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ApplicationError(
        'Identity approval email could not be sent',
        'IDENTITY_APPROVAL_EMAIL_SEND_FAILED',
        502,
      );
    }
  }

  async sendIdentityVerificationRejected(message: {
    to: string;
    firstName: string;
    reason?: string;
    language?: 'en' | 'ar';
  }): Promise<void> {
    if (!this.isConfigured()) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ApplicationError(
          'Email delivery is not configured',
          'EMAIL_DELIVERY_NOT_CONFIGURED',
          500,
        );
      }

      this.logger.warn(
        `Identity verification rejected notification for ${message.to}: ${message.reason ?? 'No reason provided'}`,
      );
      return;
    }

    try {
      const isAr = message.language === 'ar';
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: message.to,
        subject: isAr ? 'تحديث بشأن طلب توثيق الهوية في Share-k' : 'Update on your Share-k identity verification',
        text: this.getIdentityRejectedTextBody(message),
        html: this.getIdentityRejectedHtmlBody(message),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send identity rejection email to ${message.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ApplicationError(
        'Identity rejection email could not be sent',
        'IDENTITY_REJECTION_EMAIL_SEND_FAILED',
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
    const isAr = message.language === 'ar';
    return isAr ? [
      `مرحباً ${message.firstName}،`,
      '',
      `رمز التوثيق الخاص بك في Share-k هو: ${message.code}`,
      `صلاحية هذا الرمز تنتهي في: ${message.expiresAt.toLocaleString('ar-SA')}`,
      '',
      'إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة بأمان.',
    ].join('\n') : [
      `Hi ${message.firstName},`,
      '',
      `Your Share-k verification code is ${message.code}.`,
      `It expires at ${message.expiresAt.toLocaleString('en-US')}.`,
      '',
      'If you did not create a Share-k account, you can ignore this email.',
    ].join('\n');
  }

  private getHtmlBody(message: EmailVerificationMessage): string {
    const isAr = message.language === 'ar';
    const content = isAr ? `
      <div class="greeting">مرحباً ${this.escapeHtml(message.firstName)}،</div>
      <p>شكراً لتسجيلك في Share-k. لإكمال عملية التسجيل، يرجى استخدام رمز التوثيق التالي:</p>
      <div class="otp-container">
        <p class="otp-code" dir="ltr">${message.code}</p>
      </div>
      <p style="color: #64748b; font-size: 14px;">صلاحية هذا الرمز تنتهي في: <span dir="ltr">${message.expiresAt.toLocaleString('ar-SA')}</span></p>
      <p style="margin-top: 30px; font-size: 14px;">إذا لم تقم بإنشاء حساب في Share-k، يمكنك تجاهل هذه الرسالة بأمان.</p>
    ` : `
      <div class="greeting">Hi ${this.escapeHtml(message.firstName)},</div>
      <p>Thank you for registering at Share-k. To complete your registration, please use the following verification code:</p>
      <div class="otp-container">
        <p class="otp-code" dir="ltr">${message.code}</p>
      </div>
      <p style="color: #64748b; font-size: 14px;">This code expires at: <span dir="ltr">${message.expiresAt.toLocaleString('en-US')}</span></p>
      <p style="margin-top: 30px; font-size: 14px;">If you did not create a Share-k account, you can safely ignore this email.</p>
    `;
    return this.getBaseTemplate(isAr ? 'توثيق حسابك في Share-k' : 'Verify your Share-k account', content, isAr);
  }

  private getPasswordResetTextBody(message: EmailVerificationMessage): string {
    const isAr = message.language === 'ar';
    return isAr ? [
      `مرحباً ${message.firstName}،`,
      '',
      `لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك. رمز التحقق هو: ${message.code}`,
      `صلاحية هذا الرمز تنتهي في: ${message.expiresAt.toLocaleString('ar-SA')}`,
      '',
      'إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان.',
    ].join('\n') : [
      `Hi ${message.firstName},`,
      '',
      `We received a request to reset your password. Your reset code is ${message.code}.`,
      `It expires at ${message.expiresAt.toLocaleString('en-US')}.`,
      '',
      'If you did not request a password reset, you can safely ignore this email.',
    ].join('\n');
  }

  private getPasswordResetHtmlBody(message: EmailVerificationMessage): string {
    const isAr = message.language === 'ar';
    const content = isAr ? `
      <div class="greeting">مرحباً ${this.escapeHtml(message.firstName)}،</div>
      <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في Share-k. يرجى استخدام الرمز التالي للمتابعة:</p>
      <div class="otp-container">
        <p class="otp-code" dir="ltr">${message.code}</p>
      </div>
      <p style="color: #64748b; font-size: 14px;">صلاحية هذا الرمز تنتهي في: <span dir="ltr">${message.expiresAt.toLocaleString('ar-SA')}</span></p>
      <p style="margin-top: 30px; font-size: 14px;">إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان.</p>
    ` : `
      <div class="greeting">Hi ${this.escapeHtml(message.firstName)},</div>
      <p>We received a request to reset your password for your Share-k account. Please use the following code to proceed:</p>
      <div class="otp-container">
        <p class="otp-code" dir="ltr">${message.code}</p>
      </div>
      <p style="color: #64748b; font-size: 14px;">This code expires at: <span dir="ltr">${message.expiresAt.toLocaleString('en-US')}</span></p>
      <p style="margin-top: 30px; font-size: 14px;">If you did not request a password reset, you can safely ignore this email.</p>
    `;
    return this.getBaseTemplate(isAr ? 'إعادة تعيين كلمة المرور' : 'Reset your password', content, isAr);
  }

  private getIdentityApprovedTextBody(message: { firstName: string; language?: 'en' | 'ar' }): string {
    const isAr = message.language === 'ar';
    return isAr
      ? [
          `مرحباً ${message.firstName}،`,
          '',
          'تهانينا! تمت مراجعة مستند الهوية الخاص بك وتوثيقه بنجاح.',
          'تظهر الآن شارة التوثيق (Verified) على ملفك الشخصي العام في Share-k.',
          '',
          'شكراً لمساهمتك معنا في مجتمع Share-k!',
        ].join('\n')
      : [
          `Hi ${message.firstName},`,
          '',
          'Congratulations! Your identity document has been verified successfully.',
          'Your public profile on Share-k now proudly displays the Verified Identity badge.',
          '',
          'Thank you for being part of the Share-k community!',
        ].join('\n');
  }

  private getIdentityApprovedHtmlBody(message: { firstName: string; language?: 'en' | 'ar' }): string {
    const isAr = message.language === 'ar';
    const content = isAr
      ? `
      <div class="greeting">مرحباً ${this.escapeHtml(message.firstName)}،</div>
      <p style="font-size: 16px; color: #059669; font-weight: 600;">تهانينا! تم توثيق هويتك بنجاح.</p>
      <p>تمت مراجعة مستند الهوية الوطنية الخاص بك والموافقة عليه من قبل فريق Share-k. أصبح ملفك الشخصي الآن يحمل شارة التوثيق المعتمدة.</p>
      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; font-size: 16px; font-weight: bold; color: #065f46;">✓ تم تفعيل شارة الهوية الموثقة</p>
      </div>
      <p style="margin-top: 20px; font-size: 14px;">شكراً لثقتكم ومساهمتكم في مجتمع Share-k.</p>
    `
      : `
      <div class="greeting">Hi ${this.escapeHtml(message.firstName)},</div>
      <p style="font-size: 16px; color: #059669; font-weight: 600;">Congratulations! Your identity has been verified.</p>
      <p>Your national identity document has been reviewed and approved by the Share-k team. Your profile now features the official Verified Identity badge.</p>
      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; font-size: 16px; font-weight: bold; color: #065f46;">✓ Verified Identity Badge Active</p>
      </div>
      <p style="margin-top: 20px; font-size: 14px;">Thank you for building trust in the Share-k community.</p>
    `;
    return this.getBaseTemplate(isAr ? 'تم توثيق هويتك بنجاح' : 'Identity Verification Approved', content, isAr);
  }

  private getIdentityRejectedTextBody(message: { firstName: string; reason?: string; language?: 'en' | 'ar' }): string {
    const isAr = message.language === 'ar';
    const reasonText = message.reason?.trim()
      ? message.reason
      : isAr
        ? 'المستند المرفوع غير واضح أو لا يطابق معايير التوثيق.'
        : 'The uploaded document was unclear or did not meet our verification criteria.';

    return isAr
      ? [
          `مرحباً ${message.firstName}،`,
          '',
          'نود إعلامك بأنه بعد مراجعة مستند الهوية المرفوع، لم نتمكن من إتمام التوثيق في الوقت الحالي.',
          '',
          `سبب الرفض: ${reasonText}`,
          '',
          'يمكنك إعادة رفع مستند جديد أو صورة أوضح في أي وقت من خلال إعدادات الحساب -> توثيق الهوية.',
        ].join('\n')
      : [
          `Hi ${message.firstName},`,
          '',
          'We reviewed your identity document submission, but unfortunately we could not approve it at this time.',
          '',
          `Reason: ${reasonText}`,
          '',
          'You can submit a new, clearer photo or document anytime from your Account Settings -> Identity Verification.',
        ].join('\n');
  }

  private getIdentityRejectedHtmlBody(message: { firstName: string; reason?: string; language?: 'en' | 'ar' }): string {
    const isAr = message.language === 'ar';
    const reasonText = message.reason?.trim()
      ? message.reason
      : isAr
        ? 'المستند المرفوع غير واضح أو لا يطابق معايير التوثيق.'
        : 'The uploaded document was unclear or did not meet our verification criteria.';

    const content = isAr
      ? `
      <div class="greeting">مرحباً ${this.escapeHtml(message.firstName)}،</div>
      <p>نود إعلامك بأنه بعد مراجعة مستند الهوية المرفوع، لم نتمكن من توثيق حسابك في الوقت الحالي.</p>
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px; font-weight: bold; color: #991b1b;">سبب الرفض:</p>
        <p style="margin: 6px 0 0; font-size: 14px; color: #7f1d1d;">${this.escapeHtml(reasonText)}</p>
      </div>
      <p>يمكنك التقاط صورة أوضح أو رفع مستند آخر عبر الانتقال إلى <strong>إعدادات الحساب &gt; توثيق الهوية</strong>.</p>
      <p style="margin-top: 20px; font-size: 14px; color: #64748b;">إذا كانت لديك أي استفسارات، يمكنك التواصل مع فريق الدعم.</p>
    `
      : `
      <div class="greeting">Hi ${this.escapeHtml(message.firstName)},</div>
      <p>After reviewing your submitted identity document, we were unable to complete verification at this time.</p>
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px; font-weight: bold; color: #991b1b;">Rejection reason:</p>
        <p style="margin: 6px 0 0; font-size: 14px; color: #7f1d1d;">${this.escapeHtml(reasonText)}</p>
      </div>
      <p>You can re-upload a clear copy by visiting <strong>Account Settings &gt; Identity Verification</strong>.</p>
      <p style="margin-top: 20px; font-size: 14px; color: #64748b;">If you have any questions, feel free to reach out to our support team.</p>
    `;
    return this.getBaseTemplate(isAr ? 'تحديث بشأن طلب توثيق الهوية' : 'Identity Verification Update', content, isAr);
  }

  private getBaseTemplate(title: string, content: string, isAr: boolean): string {
    const dir = isAr ? 'rtl' : 'ltr';
    const lang = isAr ? 'ar' : 'en';
    const align = isAr ? 'right' : 'left';
    const footerMsg = isAr 
      ? 'هذه الرسالة تم إرسالها تلقائياً من نظام Share-k، يرجى عدم الرد عليها.'
      : 'This is an automated message from Share-k, please do not reply.';

    return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      padding: 20px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      border-top: 6px solid #059669;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #0f172a;
      text-decoration: none;
    }
    .logo span {
      color: #059669;
    }
    .content {
      color: #334155;
      font-size: 16px;
      line-height: 1.6;
      text-align: ${align};
    }
    .greeting {
      font-size: 20px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 20px;
    }
    .otp-container {
      background-color: #f1f5f9;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 30px 0;
    }
    .otp-code {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #0f172a;
      margin: 0;
      font-family: monospace;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">Share<span>-k</span></div>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        ${footerMsg}
      </div>
    </div>
  </div>
</body>
</html>`;
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
