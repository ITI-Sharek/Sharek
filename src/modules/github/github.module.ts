import { Module } from '@nestjs/common';

import { GitHubIdentityModule } from '../github-identity/github-identity.module';

import { GitHubOAuthService } from './services/github-oauth.service';
import { GitHubAccountService } from './services/github-account.service';
import { GitHubEvidenceService } from './services/github-evidence.service';
import { GitHubRepositoryService } from './services/github-repository.service';
import { GitHubApiClient } from './integrations/github-api.client';
import { GitHubAppApiClient } from './integrations/github-app-api.client';
import { GitHubAppCredentialsService } from './security/github-app-credentials.service';
import { GitHubTokenEncryptionService } from './security/github-token-encryption.service';
import { GitHubOAuthBrowserCallbackController } from './controllers/github-oauth-browser-callback.controller';
import { GitHubOAuthController } from './controllers/github-oauth.controller';
import { GitHubAppController } from './controllers/github-app.controller';
import { GitHubAppCallbackController } from './controllers/github-app-callback.controller';
import { GitHubAppService } from './services/github-app.service';
import { GitHubAppWebhookController } from './controllers/github-app-webhook.controller';
import { GitHubAppWebhookService } from './services/github-app-webhook.service';
import { GitHubEvidenceCutoverService } from './services/github-evidence-cutover.service';
import { GitHubLegacyCleanupService } from './services/github-legacy-cleanup.service';

@Module({
  imports: [GitHubIdentityModule],
  controllers: [
    GitHubOAuthController,
    GitHubOAuthBrowserCallbackController,
    GitHubAppController,
    GitHubAppCallbackController,
    GitHubAppWebhookController,
  ],
  providers: [
    GitHubOAuthService,
    GitHubAccountService,
    GitHubEvidenceService,
    GitHubRepositoryService,
    GitHubApiClient,
    GitHubAppApiClient,
    GitHubAppCredentialsService,
    GitHubTokenEncryptionService,
    GitHubAppService,
    GitHubAppWebhookService,
    GitHubEvidenceCutoverService,
    GitHubLegacyCleanupService,
  ],
  exports: [
    GitHubOAuthService,
    GitHubAccountService,
    GitHubEvidenceService,
    GitHubRepositoryService,
    GitHubAppService,
  ],
})
export class GithubModule {}
