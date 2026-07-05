import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { GitHubOAuthService } from '../../../application/use-cases/github-oauth.service';
import { GitHubRepositoryService } from '../../../application/use-cases/github-repository.service';
import { GitHubOAuthCallbackRequest } from '../requests/github-oauth-callback.request';
import { AccessTokenGuard } from '../../../../../shared/auth/guards/access-token.guard';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-request';

@Controller('github')
export class GitHubOAuthController {
  constructor(
    private readonly gitHubOAuthService: GitHubOAuthService,
    private readonly gitHubRepositoryService: GitHubRepositoryService,
  ) {}

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
  @Delete('account')
  async disconnect(@CurrentUser() user: AuthenticatedUser) {
    await this.gitHubOAuthService.disconnect(user.id);
    return {
      success: true,
    };
  }
}
