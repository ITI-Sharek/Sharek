import { forwardRef, Module } from '@nestjs/common';

import { GithubModule } from '../github/github.module';
import { AuthService } from './services/auth.service';
import { IdentityAccountStatusService } from './services/identity-account-status.service';
import { IdentityUsernameService } from './services/identity-username.service';
import { PasswordResetService } from './services/password-reset.service';
import { SessionService } from './services/session.service';
import { SocialAuthService } from './services/social-auth.service';
import { UsernameSuggestionService } from './services/username-suggestion.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { AccountSettingsService } from './services/account-settings.service';
import { PaymentCustomerProfileService } from './services/payment-customer-profile.service';
import { EmailVerificationSender } from './integrations/email-verification.sender';
import { PasswordHasher } from './security/password-hasher.service';
import { SessionTokenService } from './security/session-token.service';
import { ManualAuthController } from './controllers/manual-auth.controller';
import { SessionController } from './controllers/session.controller';
import { GitHubAuthController } from './controllers/github-auth.controller';
import { GoogleAuthController } from './controllers/google-auth.controller';

@Module({
  imports: [forwardRef(() => GithubModule)],
  controllers: [
    ManualAuthController,
    SessionController,
    GitHubAuthController,
    GoogleAuthController,
  ],
  providers: [
    AuthService,
    AccountSettingsService,
    PaymentCustomerProfileService,
    IdentityAccountStatusService,
    IdentityUsernameService,
    PasswordResetService,
    SessionService,
    SocialAuthService,
    UsernameSuggestionService,
    GoogleOAuthService,
    EmailVerificationSender,
    PasswordHasher,
    SessionTokenService,
  ],
  exports: [
    IdentityAccountStatusService,
    IdentityUsernameService,
    PaymentCustomerProfileService,
  ],
})
export class IdentityModule {}
