import { Module } from '@nestjs/common';

import { GitHubOAuthService } from './application/use-cases/github-oauth.service';
import { GitHubProfileStatusReaderService } from './application/use-cases/github-profile-status-reader.service';
import { GitHubRepositoryService } from './application/use-cases/github-repository.service';
import { GitHubApiClient } from './infrastructure/integrations/github-api.client';
import { GitHubTokenEncryptionService } from './infrastructure/security/github-token-encryption.service';
import {
  GitHubOAuthBrowserCallbackController,
  GitHubOAuthController,
} from './presentation/http/controllers/github-oauth.controller';

@Module({
  controllers: [GitHubOAuthController, GitHubOAuthBrowserCallbackController],
  providers: [
    GitHubOAuthService,
    GitHubProfileStatusReaderService,
    GitHubRepositoryService,
    GitHubApiClient,
    GitHubTokenEncryptionService,
  ],
  exports: [GitHubOAuthService, GitHubRepositoryService, GitHubProfileStatusReaderService],
})
export class GithubModule {}
