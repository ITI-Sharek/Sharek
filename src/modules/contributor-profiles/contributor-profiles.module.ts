import { Module } from '@nestjs/common';

import { BadgesModule } from '../badges/badges.module';
import { GithubModule } from '../github/github.module';
import { IdentityModule } from '../identity/identity.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import {
  ContributorExperienceLevelsController,
  ContributorFieldsController,
  ContributorProfileAvatarsController,
  ContributorProfilesController,
} from './contributor-profiles.controller';
import { ContributorProfilesService } from './contributor-profiles.service';

@Module({
  imports: [
    IdentityModule,
    GithubModule,
    SkillProfilesModule,
    ReputationModule,
    BadgesModule,
  ],
  controllers: [
    ContributorProfilesController,
    ContributorFieldsController,
    ContributorExperienceLevelsController,
    ContributorProfileAvatarsController,
  ],
  providers: [ContributorProfilesService],
  exports: [ContributorProfilesService],
})
export class ContributorProfilesModule {}
