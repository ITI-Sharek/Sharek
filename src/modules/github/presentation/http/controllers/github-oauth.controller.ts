import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../../../shared/auth/guards/access-token.guard';
import { GitHubOAuthService } from '../../../application/use-cases/github-oauth.service';
import { GitHubRepositoryService } from '../../../application/use-cases/github-repository.service';
import { GitHubOAuthCallbackRequest } from '../requests/github-oauth-callback.request';

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
  listRepositories(@CurrentUser() user: AuthenticatedUser) {
    return this.gitHubRepositoryService.listRepositories(user.id);
  }

  @UseGuards(AccessTokenGuard)
  @Get('readme')
  async getReadme(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fullName') fullName: string,
  ) {
    if (!fullName) {
      throw new Error('fullName query parameter is required');
    }
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
    if (!fullName) {
      throw new Error('fullName query parameter is required');
    }
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
    if (!fullName) {
      throw new Error('fullName query parameter is required');
    }
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
    if (!fullName) {
      throw new Error('fullName query parameter is required');
    }
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
    if (!fullName) {
      throw new Error('fullName query parameter is required');
    }
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
}
