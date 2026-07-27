import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

import { ApplicationError } from '../../../shared/errors/application.error';
import { GitHubAppService } from '../services/github-app.service';

@Controller('auth/github/app')
export class GitHubAppCallbackController {
  constructor(
    private readonly gitHubAppService: GitHubAppService,
    private readonly config: ConfigService,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const returnUrl = new URL(
      this.config.get<string>(
        'GITHUB_APP_FRONTEND_RETURN_URL',
        'http://localhost:3001/profile/github',
      ),
    );
    if (providerError || !code || !state) {
      returnUrl.searchParams.set('error', 'GITHUB_APP_STATE_INVALID');
      response.redirect(returnUrl.toString());
      return;
    }

    try {
      const attemptId = await this.gitHubAppService.processBrowserCallback(
        code,
        state,
      );
      returnUrl.searchParams.set('attemptId', attemptId);
    } catch (error) {
      returnUrl.searchParams.set(
        'error',
        error instanceof ApplicationError
          ? error.code
          : 'GITHUB_APP_PROVIDER_UNAVAILABLE',
      );
    }
    response.redirect(returnUrl.toString());
  }
}
