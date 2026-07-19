import { Module } from '@nestjs/common';

import { GitHubOAuthService } from './services/github-oauth.service';
import { GitHubAccountService } from './services/github-account.service';
import { GitHubEvidenceService } from './services/github-evidence.service';
import { GitHubRemediationService } from './services/github-remediation.service';
import { GitHubRepositoryService } from './services/github-repository.service';
import { GitHubApiClient } from './integrations/github-api.client';
import { GitHubTokenEncryptionService } from './security/github-token-encryption.service';
import {
  GitHubOAuthBrowserCallbackController,
  GitHubOAuthController,
} from './controllers/github-oauth.controller';

@Module({
  controllers: [GitHubOAuthController, GitHubOAuthBrowserCallbackController],
  providers: [
    GitHubOAuthService,
    GitHubAccountService,
    GitHubEvidenceService,
    GitHubRemediationService,
    GitHubRepositoryService,
    GitHubApiClient,
    GitHubTokenEncryptionService,
  ],
  exports: [
    GitHubOAuthService,
    GitHubAccountService,
    GitHubEvidenceService,
    GitHubRepositoryService,
  ],
})
export class GithubModule {}
