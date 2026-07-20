import { Module } from '@nestjs/common';

import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { ContributorProfilesModule } from '../contributor-profiles/contributor-profiles.module';
import { ProjectsModule } from '../projects/projects.module';
import { AdminContributorFieldsController } from './controllers/admin-contributor-fields.controller';
import { AdminPublishedProjectOwnersController } from './controllers/admin-published-project-owners.controller';
import { AdminSkillReviewsController } from './controllers/admin-skill-reviews.controller';

@Module({
  imports: [SkillProfilesModule, ContributorProfilesModule, ProjectsModule],
  controllers: [
    AdminSkillReviewsController,
    AdminContributorFieldsController,
    AdminPublishedProjectOwnersController,
  ],
})
export class AdminModule {}
