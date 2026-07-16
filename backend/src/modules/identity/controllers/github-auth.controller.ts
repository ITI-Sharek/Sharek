import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

import { SocialAuthService } from '../services/social-auth.service';
import { SocialAuthCallbackRequest } from '../dto/social-auth-callback.request';
import { SocialAuthStartRequest } from '../dto/social-auth-start.request';

@Controller('auth/github')
export class GitHubAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('start')
  startGitHub(@Query() query: SocialAuthStartRequest) {
    return this.socialAuthService.startGitHub(query.role);
  }

  @Get('callback')
  completeGitHubGet(
    @Query() query: SocialAuthCallbackRequest,
    @Res() response: Response,
  ) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3001');
    const callbackUrl = new URL('/auth/callback', frontendUrl);
    callbackUrl.searchParams.set('provider', 'github');
    if (query.code) callbackUrl.searchParams.set('code', query.code);
    if (query.state) callbackUrl.searchParams.set('state', query.state);

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

  private getUserAgent(request: Request): string | undefined {
    const userAgent = request.headers['user-agent'];
    return Array.isArray(userAgent) ? userAgent[0] : userAgent;
  }
}
