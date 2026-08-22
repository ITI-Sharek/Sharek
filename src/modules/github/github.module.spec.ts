import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { DatabaseModule } from '../../shared/database/database.module';
import { GitHubAppService } from './services/github-app.service';
import { GithubModule } from './github.module';

// GithubModule must instantiate with only its non-cyclic dependencies. It
// must not need IdentityModule: the GitHub-identity read it used to reach
// through identity now lives in the github-identity leaf module.
describe('GithubModule instantiation', () => {
  it('compiles without forwardRef and without identity', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        GithubModule,
      ],
    }).compile();

    expect(moduleRef.get(GithubModule)).toBeInstanceOf(GithubModule);
    expect(moduleRef.get(GitHubAppService)).toBeInstanceOf(GitHubAppService);
    await moduleRef.close();
  });
});
