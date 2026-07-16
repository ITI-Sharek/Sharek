import { Module } from '@nestjs/common';

import { GithubModule } from '../github/github.module';
import { IdentityModule } from '../identity/identity.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { ContributorProfilesController } from './contributor-profiles.controller';
import { ContributorProfilesService } from './contributor-profiles.service';

@Module({
  imports: [IdentityModule, GithubModule, SkillProfilesModule, ReputationModule],
  controllers: [ContributorProfilesController],
  providers: [ContributorProfilesService],
})
export class ContributorProfilesModule {}
