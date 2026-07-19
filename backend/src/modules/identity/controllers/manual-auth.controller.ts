import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { AuthService } from '../services/auth.service';
import { PasswordResetService } from '../services/password-reset.service';
import { RegisterRequest } from '../dto/register.request';
import { LoginRequest } from '../dto/login.request';
import { ForgotPasswordRequest } from '../dto/forgot-password.request';
import { ResetPasswordRequest } from '../dto/reset-password.request';
import { ResendEmailVerificationRequest } from '../dto/resend-email-verification.request';
import { VerifyEmailRequest } from '../dto/verify-email.request';
import { UsernameAvailabilityRequest } from '../dto/username-availability.request';
import {
  PublicAuthSessionDto,
  toPublicAuthSession,
} from '../dto/auth-session.dto';
import { RefreshCookieService } from '../security/refresh-cookie.service';

@Controller('auth')
export class ManualAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly refreshCookieService: RefreshCookieService,
  ) {}

  @Post('register')
  register(@Body() body: RegisterRequest, @Req() request: Request) {
    return this.authService.register(body, this.getRequestContext(request));
  }

  @Get('username-availability')
  checkUsernameAvailability(@Query() query: UsernameAvailabilityRequest) {
    return this.authService.checkUsernameAvailability(query.username);
  }

  @Post('verify-email')
  async verifyEmail(
    @Body() body: VerifyEmailRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicAuthSessionDto> {
    const session = await this.authService.verifyEmail(
      body,
      this.getRequestContext(request),
    );
    this.refreshCookieService.issue(
      response,
      session.tokens.refreshToken,
      session.tokens.refreshExpiresAt,
    );

    return toPublicAuthSession(session);
  }

  @Post('verify-email/resend')
  resendEmailVerification(@Body() body: ResendEmailVerificationRequest) {
    return this.authService.resendEmailVerification(body);
  }

  @Post('login')
  async login(
    @Body() body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicAuthSessionDto> {
    const session = await this.authService.login(
      body,
      this.getRequestContext(request),
    );
    this.refreshCookieService.issue(
      response,
      session.tokens.refreshToken,
      session.tokens.refreshExpiresAt,
    );

    return toPublicAuthSession(session);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordRequest) {
    return this.passwordResetService.forgotPassword(body);
  }

  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordRequest) {
    return this.passwordResetService.resetPassword(body);
  }

  private getRequestContext(request: Request) {
    return {
      userAgent: this.getUserAgent(request),
      ipAddress: request.ip,
    };
  }

  private getUserAgent(request: Request): string | undefined {
    const userAgent = request.headers['user-agent'];
    return Array.isArray(userAgent) ? userAgent[0] : userAgent;
  }
}
