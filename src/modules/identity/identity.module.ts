import { Module } from '@nestjs/common';

import { IdentityService } from './application/use-cases/identity.service';
import { IdentityUsernameService } from './application/use-cases/identity-username.service';
import { PasswordHasher } from './infrastructure/security/password-hasher.service';
import { SessionTokenService } from './infrastructure/security/session-token.service';
import { IdentityController } from './presentation/http/controllers/identity.controller';

@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    IdentityUsernameService,
    PasswordHasher,
    SessionTokenService,
  ],
  exports: [IdentityUsernameService],
})
export class IdentityModule {}
