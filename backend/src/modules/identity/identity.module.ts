import { Module } from '@nestjs/common';

import { GithubModule } from '../github/github.module';
import { AuthService } from './services/auth.service';
import { IdentityUsernameService } from './services/identity-username.service';
import { PasswordResetService } from './services/password-reset.service';
import { SessionService } from './services/session.service';
import { SocialAuthService } from './services/social-auth.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { EmailVerificationSender } from './integrations/email-verification.sender';
import { PasswordHasher } from './security/password-hasher.service';
import { SessionTokenService } from './security/session-token.service';
import { ManualAuthController } from './controllers/manual-auth.controller';
import { SessionController } from './controllers/session.controller';
import { GitHubAuthController } from './controllers/github-auth.controller';
import { GoogleAuthController } from './controllers/google-auth.controller';

@Module({
  imports: [GithubModule],
  controllers: [
    ManualAuthController,
    SessionController,
    GitHubAuthController,
    GoogleAuthController,
  ],
  providers: [
    AuthService,
    IdentityUsernameService,
    PasswordResetService,
    SessionService,
    SocialAuthService,
    GoogleOAuthService,
    EmailVerificationSender,
    PasswordHasher,
    SessionTokenService,
  ],
  exports: [IdentityUsernameService],
})
export class IdentityModule {}
