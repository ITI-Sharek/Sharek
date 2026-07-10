import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { IdentityService } from '../../../application/use-cases/identity.service';
import { SocialAuthService } from '../../../application/use-cases/social-auth.service';
import { RegisterRequest } from '../requests/register.request';
import { LoginRequest } from '../requests/login.request';
import { ResendEmailVerificationRequest } from '../requests/resend-email-verification.request';
import { RefreshSessionRequest } from '../requests/refresh-session.request';
import { AssignRoleRequest } from '../requests/assign-role.request';
import { SocialAuthCallbackRequest } from '../requests/social-auth-callback.request';
import { SocialAuthStartRequest } from '../requests/social-auth-start.request';
import { VerifyEmailRequest } from '../requests/verify-email.request';
import { AccessTokenGuard } from '../../../../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../../../shared/auth/roles.decorator';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../../../../shared/auth/authenticated-request';

@Controller('auth')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Post('register')
  register(@Body() body: RegisterRequest, @Req() request: Request) {
    return this.identityService.register(body, this.getRequestContext(request));
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

  @Post('refresh')
  refresh(@Body() body: RefreshSessionRequest) {
    return this.identityService.refresh(body.refreshToken);
  }

  @Get('google/start')
  startGoogle(@Query() query: SocialAuthStartRequest) {
    return this.socialAuthService.startGoogle(query.role);
  }

  @Get('google/callback')
  completeGoogleGet(
    @Query() query: SocialAuthCallbackRequest,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeGoogle({
      code: query.code,
      state: query.state,
      context: this.getRequestContext(request),
    });
  }

  @Post('google/callback')
  completeGooglePost(
    @Body() body: SocialAuthCallbackRequest,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeGoogle({
      code: body.code,
      state: body.state,
      context: this.getRequestContext(request),
    });
  }

  @Get('github/start')
  startGitHub(@Query() query: SocialAuthStartRequest) {
    return this.socialAuthService.startGitHub(query.role);
  }

  @Get('github/callback')
  completeGitHubGet(
    @Query() query: SocialAuthCallbackRequest,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeGitHub({
      code: query.code,
      state: query.state,
      context: this.getRequestContext(request),
    });
  }

  @Post('github/callback')
  completeGitHubPost(
    @Body() body: SocialAuthCallbackRequest,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeGitHub({
      code: body.code,
      state: body.state,
      context: this.getRequestContext(request),
    });
  }

  @UseGuards(AccessTokenGuard)
  @Post('logout')
  async logout(@Req() request: AuthenticatedRequest) {
    await this.identityService.logout(request.authSessionId);
    return {
      success: true,
    };
  }

  @UseGuards(AccessTokenGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.identityService.getCurrentUser(user.id);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('admin')
  @Patch('users/:id/role')
  assignRole(@Param('id') userId: string, @Body() body: AssignRoleRequest) {
    return this.identityService.assignRole(userId, body.role);
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
