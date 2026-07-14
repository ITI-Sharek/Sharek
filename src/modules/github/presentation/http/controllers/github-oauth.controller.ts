import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../../../shared/auth/guards/access-token.guard';
import { ApplicationError } from '../../../../../shared/errors/application.error';
import { GitHubOAuthService } from '../../../application/use-cases/github-oauth.service';
import { GitHubRepositoryService } from '../../../application/use-cases/github-repository.service';
import { GitHubOAuthCallbackRequest } from '../requests/github-oauth-callback.request';
import { GitHubRepositoriesQueryRequest } from '../requests/github-repositories-query.request';

@Controller('github')
export class GitHubOAuthController {
  constructor(
    private readonly gitHubOAuthService: GitHubOAuthService,
    private readonly gitHubRepositoryService: GitHubRepositoryService,
  ) { }

  @UseGuards(AccessTokenGuard)
  @Get('oauth/start')
  startOAuth(@CurrentUser() user: AuthenticatedUser) {
    return this.gitHubOAuthService.startOAuth(user.id);
  }

  @Get('oauth/callback')
  callbackFromRedirect(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.gitHubOAuthService.connectWithCallback(code, state);
  }

  @Post('oauth/callback')
  callbackFromFrontend(@Body() body: GitHubOAuthCallbackRequest) {
    return this.gitHubOAuthService.connectWithCallback(body.code, body.state);
  }

  @UseGuards(AccessTokenGuard)
  @Get('account')
  getAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.gitHubOAuthService.getAccount(user.id);
  }

  @UseGuards(AccessTokenGuard)
  @Get('repositories')
  listRepositories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GitHubRepositoriesQueryRequest,
  ) {
    return this.gitHubRepositoryService.listRepositoryPage(user.id, {
      page: query.page,
      perPage: query.perPage,
    });
  }

  @UseGuards(AccessTokenGuard)
  @Get('readme')
  async getReadme(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fullName') fullName: string,
  ) {
    this.assertFullName(fullName);
    const content = await this.gitHubRepositoryService.getRepositoryReadme(
      user.id,
      fullName,
    );
    return {
      fullName,
      content,
      hasReadme: content !== null,
    };
  }

  @UseGuards(AccessTokenGuard)
  @Get('repository/description')
  async getRepositoryDescription(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fullName') fullName: string,
  ) {
    this.assertFullName(fullName);
    const description = await this.gitHubRepositoryService.getRepositoryDescription(
      user.id,
      fullName,
    );
    return {
      fullName,
      description,
    };
  }

  @UseGuards(AccessTokenGuard)
  @Get('repository/statistics')
  async getRepositoryStatistics(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fullName') fullName: string,
  ) {
    this.assertFullName(fullName);
    return this.gitHubRepositoryService.fetchRepositoryStatistics(
      user.id,
      fullName,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Get('repository/contribution-activity')
  async getContributionActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fullName') fullName: string,
  ) {
    this.assertFullName(fullName);
    return this.gitHubRepositoryService.fetchContributionActivity(
      user.id,
      fullName,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Get('repository/commit-signals')
  async getCommitSignals(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fullName') fullName: string,
    @Query('author') author?: string,
  ) {
    this.assertFullName(fullName);
    return this.gitHubRepositoryService.fetchCommitSignals(
      user.id,
      fullName,
      author,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Delete('account')
  async disconnect(@CurrentUser() user: AuthenticatedUser) {
    await this.gitHubOAuthService.disconnect(user.id);
    return {
      success: true,
    };
  }

  private assertFullName(fullName: string | undefined): void {
    if (!fullName?.trim()) {
      throw new ApplicationError(
        'fullName query parameter is required',
        'GITHUB_REPOSITORY_FULL_NAME_REQUIRED',
        400,
      );
    }
  }
}

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
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3001',
    );
    const callbackUrl = new URL('/auth/callback', frontendUrl);
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
