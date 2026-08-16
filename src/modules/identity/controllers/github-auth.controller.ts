import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { SocialAuthService } from '../services/social-auth.service';
import { SocialAuthCallbackRequest } from '../dto/social-auth-callback.request';
import { SocialAuthStartRequest } from '../dto/social-auth-start.request';
import { parseSocialAuthRedirectQuery } from '../validators/social-auth-redirect-query.validator';

@Controller('auth/github')
export class GitHubAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('start')
  startGitHub(@Query() query: SocialAuthStartRequest) {
    return this.socialAuthService.startGitHub(query.role, query.intent);
  }

  @Get('callback')
  completeGitHubGet(
    @Query() rawQuery: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const query = parseSocialAuthRedirectQuery(rawQuery);
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3001');
    const callbackUrl = new URL('/auth/callback', frontendUrl);
    callbackUrl.searchParams.set('provider', 'github');
    if (query.code) callbackUrl.searchParams.set('code', query.code);
    if (query.state) callbackUrl.searchParams.set('state', query.state);
    if (query.error) callbackUrl.searchParams.set('error', query.error);
    if (query.errorDescription) {
      callbackUrl.searchParams.set('error_description', query.errorDescription);
    }

    response.redirect(callbackUrl.toString());
  }

  @Post('callback')
  completeGitHubPost(
    @Body() body: SocialAuthCallbackRequest,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeGitHub({
      code: body.code,
      state: body.state,
      context: {
        userAgent: this.getUserAgent(request),
        ipAddress: request.ip,
      },
    });
  }

  @UseGuards(AccessTokenGuard)
  @Post('account/callback')
  completeGitHubAccountConnection(
    @Body() body: SocialAuthCallbackRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.socialAuthService.connectGitHubAccount({
      userId: user.id,
      code: body.code,
      state: body.state,
    });
  }

  @UseGuards(AccessTokenGuard)
  @Delete('account')
  async disconnectGitHubAccount(@CurrentUser() user: AuthenticatedUser) {
    await this.socialAuthService.disconnectGitHubAccount(user.id);
    return { success: true };
  }

  private getUserAgent(request: Request): string | undefined {
    const userAgent = request.headers['user-agent'];
    return Array.isArray(userAgent) ? userAgent[0] : userAgent;
  }
}
