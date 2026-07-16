import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';

import { IdentityService } from '../../../application/use-cases/identity.service';
import { RegisterRequest } from '../requests/register.request';
import { LoginRequest } from '../requests/login.request';
import { ForgotPasswordRequest } from '../requests/forgot-password.request';
import { ResetPasswordRequest } from '../requests/reset-password.request';
import { ResendEmailVerificationRequest } from '../requests/resend-email-verification.request';
import { VerifyEmailRequest } from '../requests/verify-email.request';
import { UsernameAvailabilityRequest } from '../requests/username-availability.request';

@Controller('auth')
export class ManualAuthController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('register')
  register(@Body() body: RegisterRequest, @Req() request: Request) {
    return this.identityService.register(body, this.getRequestContext(request));
  }

  @Get('username-availability')
  checkUsernameAvailability(@Query() query: UsernameAvailabilityRequest) {
    return this.identityService.checkUsernameAvailability(query.username);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: VerifyEmailRequest, @Req() request: Request) {
    return this.identityService.verifyEmail(body, this.getRequestContext(request));
  }

  @Post('verify-email/resend')
  resendEmailVerification(@Body() body: ResendEmailVerificationRequest) {
    return this.identityService.resendEmailVerification(body);
  }

  @Post('login')
  login(@Body() body: LoginRequest, @Req() request: Request) {
    return this.identityService.login(body, this.getRequestContext(request));
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordRequest) {
    return this.identityService.forgotPassword(body);
  }

  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordRequest) {
    return this.identityService.resetPassword(body);
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
