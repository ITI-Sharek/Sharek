import { Module } from '@nestjs/common';

import { IdentityService } from './application/use-cases/identity.service';
import { PasswordHasher } from './infrastructure/security/password-hasher.service';
import { SessionTokenService } from './infrastructure/security/session-token.service';
import { IdentityController } from './presentation/http/controllers/identity.controller';

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, PasswordHasher, SessionTokenService],
})
export class IdentityModule {}
