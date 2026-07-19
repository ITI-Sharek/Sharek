import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

import { SocialAuthService } from '../services/social-auth.service';
import { SocialAuthCallbackRequest } from '../dto/social-auth-callback.request';
import { SocialAuthStartRequest } from '../dto/social-auth-start.request';
import { parseSocialAuthRedirectQuery } from '../validators/social-auth-redirect-query.validator';

@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('start')
  startGoogle(@Query() query: SocialAuthStartRequest) {
    return this.socialAuthService.startGoogle(query.role);
  }

  @Get('callback')
  completeGoogleGet(
    @Query() rawQuery: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const query = parseSocialAuthRedirectQuery(rawQuery);
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3001');
    const callbackUrl = new URL('/auth/callback', frontendUrl);
    callbackUrl.searchParams.set('provider', 'google');
    if (query.code) callbackUrl.searchParams.set('code', query.code);
    if (query.state) callbackUrl.searchParams.set('state', query.state);
    if (query.error) callbackUrl.searchParams.set('error', query.error);
    if (query.errorDescription) {
      callbackUrl.searchParams.set('error_description', query.errorDescription);
    }

    response.redirect(callbackUrl.toString());
  }

  @Post('callback')
  completeGooglePost(
    @Body() body: SocialAuthCallbackRequest,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeGoogle({
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
