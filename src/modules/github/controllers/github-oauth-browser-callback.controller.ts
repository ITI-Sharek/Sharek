import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Controller('auth/github/callback')
export class GitHubOAuthBrowserCallbackController {
  constructor(private readonly config: ConfigService) {}

  @Get('repository')
  redirectRepositoryConnectCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() response: Response,
  ): void {
    const callbackUrl = new URL(
      '/auth/callback',
      this.config.get<string>('FRONTEND_URL', 'http://localhost:3001'),
    );
    callbackUrl.searchParams.set('provider', 'github');

    if (error) {
      callbackUrl.searchParams.set('error', error);
      if (errorDescription) {
        callbackUrl.searchParams.set('error_description', errorDescription);
      }
    } else {
      if (code) callbackUrl.searchParams.set('code', code);
      if (state) callbackUrl.searchParams.set('state', state);
    }

    response.redirect(callbackUrl.toString());
  }
}
