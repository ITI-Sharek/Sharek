import { Module } from '@nestjs/common';

import { GitHubOAuthService } from './application/use-cases/github-oauth.service';
import { GitHubProfileStatusReaderService } from './application/use-cases/github-profile-status-reader.service';
import { GitHubRepositoryService } from './application/use-cases/github-repository.service';
import { GitHubTokenEncryptionService } from './infrastructure/security/github-token-encryption.service';
import { GitHubOAuthController } from './presentation/http/controllers/github-oauth.controller';

@Module({
  controllers: [GitHubOAuthController],
  providers: [
    GitHubOAuthService,
    GitHubProfileStatusReaderService,
    GitHubRepositoryService,
    GitHubTokenEncryptionService,
  ],
  exports: [GitHubRepositoryService, GitHubProfileStatusReaderService],
})
export class GithubModule {}
