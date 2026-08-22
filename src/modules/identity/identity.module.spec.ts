import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { DatabaseModule } from '../../shared/database/database.module';
import { SocialAuthService } from './services/social-auth.service';
import { IdentityModule } from './identity.module';

// IdentityModule must instantiate with only its non-cyclic dependencies.
// It imports GithubModule one-way (SocialAuthService -> GitHubOAuthService);
// nothing in github imports identity back, so no forwardRef is required.
describe('IdentityModule instantiation', () => {
  it('compiles without forwardRef', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        IdentityModule,
      ],
    }).compile();

    expect(moduleRef.get(IdentityModule)).toBeInstanceOf(IdentityModule);
    expect(moduleRef.get(SocialAuthService)).toBeInstanceOf(SocialAuthService);
    await moduleRef.close();
  });
});
