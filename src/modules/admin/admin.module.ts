import { Module } from '@nestjs/common';

import { ApplicationsModule } from '../applications/applications.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { ContributorProfilesModule } from '../contributor-profiles/contributor-profiles.module';
import { IdentityModule } from '../identity/identity.module';
import { ProjectsModule } from '../projects/projects.module';
import {
  AdminContributorFieldCategoriesController,
  AdminContributorFieldsController,
} from './controllers/admin-contributor-fields.controller';
import { AdminExperienceLevelsController } from './controllers/admin-experience-levels.controller';
import { AdminIdentityVerificationController } from './controllers/admin-identity-verification.controller';
import { AdminPublishedProjectOwnersController } from './controllers/admin-published-project-owners.controller';
import { AdminSkillReviewsController } from './controllers/admin-skill-reviews.controller';
import { DecisionFeedbackReportsController } from './controllers/decision-feedback-reports.controller';
import { AdminIdentityVerificationService } from './services/admin-identity-verification.service';
import { DecisionFeedbackReportsService } from './services/decision-feedback-reports.service';

@Module({
  imports: [
    ApplicationsModule,
    SkillProfilesModule,
    ContributorProfilesModule,
    ProjectsModule,
    IdentityModule,
  ],
  controllers: [
    AdminSkillReviewsController,
    AdminIdentityVerificationController,
    AdminContributorFieldsController,
    AdminContributorFieldCategoriesController,
    AdminExperienceLevelsController,
    AdminPublishedProjectOwnersController,
    DecisionFeedbackReportsController,
  ],
  providers: [
    DecisionFeedbackReportsService,
    AdminIdentityVerificationService,
  ],
})
export class AdminModule {}
