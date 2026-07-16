import { Module } from '@nestjs/common';

import { GithubModule } from '../github/github.module';
import { IdentityService } from './application/use-cases/identity.service';
import { IdentityUsernameService } from './application/use-cases/identity-username.service';
import { SocialAuthService } from './application/use-cases/social-auth.service';
import { GoogleOAuthService } from './application/use-cases/google-oauth.service';
import { EmailVerificationSender } from './infrastructure/integrations/email-verification.sender';

import { PasswordHasher } from './infrastructure/security/password-hasher.service';
import { SessionTokenService } from './infrastructure/security/session-token.service';
import { ManualAuthController } from './presentation/http/controllers/manual-auth.controller';
import { SessionController } from './presentation/http/controllers/session.controller';
import { GitHubAuthController } from './presentation/http/controllers/github-auth.controller';
import { GoogleAuthController } from './presentation/http/controllers/google-auth.controller';

@Module({
  imports: [GithubModule],
  controllers: [
    ManualAuthController,
    SessionController,
    GitHubAuthController,
    GoogleAuthController,
  ],
  providers: [
    IdentityService,
    IdentityUsernameService,
    SocialAuthService,
    GoogleOAuthService,
    EmailVerificationSender,
    PasswordHasher,
    SessionTokenService,
  ],
  exports: [IdentityUsernameService],
})
export class IdentityModule {}
