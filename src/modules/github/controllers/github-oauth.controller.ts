import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { GitHubOAuthService } from '../services/github-oauth.service';
import { GitHubEvidenceService } from '../services/github-evidence.service';
import { GitHubRepositoryService } from '../services/github-repository.service';
import { GitHubOAuthCallbackRequest } from '../dto/github-oauth-callback.request';
import {
  GitHubCommitSignalsQueryRequest,
  GitHubRepositoryQueryRequest,
} from '../dto/github-repository-query.request';
import { GitHubRepositoriesQueryRequest } from '../dto/github-repositories-query.request';

@Controller('github')
export class GitHubOAuthController {
  constructor(
    private readonly gitHubOAuthService: GitHubOAuthService,
    private readonly gitHubRepositoryService: GitHubRepositoryService,
    private readonly gitHubEvidenceService: GitHubEvidenceService,
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
    @Query() query: GitHubRepositoryQueryRequest,
  ) {
    const content = await this.gitHubEvidenceService.getRepositoryReadme(
      user.id,
      query.fullName,
    );
    return {
      fullName: query.fullName,
      content,
      hasReadme: content !== null,
    };
  }

  @UseGuards(AccessTokenGuard)
  @Get('repository/description')
  async getRepositoryDescription(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GitHubRepositoryQueryRequest,
  ) {
    const description = await this.gitHubEvidenceService.getRepositoryDescription(
      user.id,
      query.fullName,
    );
    return {
      fullName: query.fullName,
      description,
    };
  }

  @UseGuards(AccessTokenGuard)
  @Get('repository/statistics')
  async getRepositoryStatistics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GitHubRepositoryQueryRequest,
  ) {
    return this.gitHubEvidenceService.fetchRepositoryStatistics(
      user.id,
      query.fullName,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Get('repository/contribution-activity')
  async getContributionActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GitHubRepositoryQueryRequest,
  ) {
    return this.gitHubEvidenceService.fetchContributionActivity(
      user.id,
      query.fullName,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Get('repository/commit-signals')
  async getCommitSignals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GitHubCommitSignalsQueryRequest,
  ) {
    return this.gitHubEvidenceService.fetchCommitSignals(
      user.id,
      query.fullName,
      query.author,
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
