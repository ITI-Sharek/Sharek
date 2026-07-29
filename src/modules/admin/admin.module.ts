import { Module } from '@nestjs/common';

import { ApplicationsModule } from '../applications/applications.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { ContributorProfilesModule } from '../contributor-profiles/contributor-profiles.module';
import { ProjectsModule } from '../projects/projects.module';
import { AdminContributorFieldsController } from './controllers/admin-contributor-fields.controller';
import { AdminExperienceLevelsController } from './controllers/admin-experience-levels.controller';
import { AdminPublishedProjectOwnersController } from './controllers/admin-published-project-owners.controller';
import { AdminSkillReviewsController } from './controllers/admin-skill-reviews.controller';
import { DecisionFeedbackReportsController } from './controllers/decision-feedback-reports.controller';
import { DecisionFeedbackReportsService } from './services/decision-feedback-reports.service';

@Module({
  imports: [
    ApplicationsModule,
    SkillProfilesModule,
    ContributorProfilesModule,
    ProjectsModule,
  ],
  controllers: [
    AdminSkillReviewsController,
    AdminContributorFieldsController,
    AdminExperienceLevelsController,
    AdminPublishedProjectOwnersController,
    DecisionFeedbackReportsController,
  ],
  providers: [DecisionFeedbackReportsService],
})
export class AdminModule {}
