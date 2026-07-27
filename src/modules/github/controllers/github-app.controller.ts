import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import {
  CompleteGitHubAppInstallationRequest,
  GitHubAppRepositoriesQueryRequest,
  StartGitHubAppInstallationRequest,
} from '../dto/github-app-installation.dto';
import { GitHubAppService } from '../services/github-app.service';

@UseGuards(AccessTokenGuard)
@Controller('github/app')
export class GitHubAppController {
  constructor(private readonly gitHubAppService: GitHubAppService) {}

  @Post('installations/start')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartGitHubAppInstallationRequest,
  ) {
    return this.gitHubAppService.startConnection(
      user.id,
      body.flowType,
      body.installationLinkId,
    );
  }

  @Post('installations/callback')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CompleteGitHubAppInstallationRequest,
  ) {
    return this.gitHubAppService.completeConnection(
      user.id,
      body.attemptId,
      body.providerInstallationId,
    );
  }

  @Get('installations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.gitHubAppService.listInstallationLinks(user.id);
  }

  @Get('installations/attempts/:attemptId')
  getConnectionAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
  ) {
    return this.gitHubAppService.getConnectionAttempt(user.id, attemptId);
  }

  @Get('repositories')
  repositories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GitHubAppRepositoriesQueryRequest,
  ) {
    return this.gitHubAppService.listSelectedRepositories(
      user.id,
      query.installationLinkId,
      query.page,
      query.perPage,
    );
  }

  @Delete('installations/:installationLinkId')
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('installationLinkId', new ParseUUIDPipe({ version: '4' }))
    installationLinkId: string,
  ) {
    return this.gitHubAppService.disconnect(user.id, installationLinkId);
  }
}
