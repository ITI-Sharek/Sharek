import { Module } from '@nestjs/common';

import { GithubModule } from '../github/github.module';
import { IdentityService } from './application/use-cases/identity.service';
import { IdentityUsernameService } from './application/use-cases/identity-username.service';
import { SocialAuthService } from './application/use-cases/social-auth.service';
import { EmailVerificationSender } from './infrastructure/integrations/email-verification.sender';

import { PasswordHasher } from './infrastructure/security/password-hasher.service';
import { SessionTokenService } from './infrastructure/security/session-token.service';
import { IdentityController } from './presentation/http/controllers/identity.controller';

@Module({
  imports: [GithubModule],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    IdentityUsernameService,
    SocialAuthService,
    EmailVerificationSender,
    PasswordHasher,
    SessionTokenService,
  ],
  exports: [IdentityUsernameService],
})
export class IdentityModule {}
