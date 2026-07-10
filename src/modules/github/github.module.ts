import { Module } from '@nestjs/common';

import { GitHubOAuthService } from './application/use-cases/github-oauth.service';
import { GitHubRepositoryService } from './application/use-cases/github-repository.service';
import { GitHubApiClient } from './infrastructure/integrations/github-api.client';
import { GitHubTokenEncryptionService } from './infrastructure/security/github-token-encryption.service';
import { GitHubOAuthController } from './presentation/http/controllers/github-oauth.controller';

@Module({
  controllers: [GitHubOAuthController],
  providers: [
    GitHubOAuthService,
    GitHubRepositoryService,
    GitHubApiClient,
    GitHubTokenEncryptionService,
  ],
  exports: [GitHubOAuthService, GitHubRepositoryService],
})
export class GithubModule {}
