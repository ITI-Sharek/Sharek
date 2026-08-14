import { forwardRef, Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { ApplicationsModule } from '../applications/applications.module';
import { ContributionTasksController } from './controllers/contribution-tasks.controller';
import { PublicContributionRequestsController } from './controllers/public-contribution-requests.controller';
import { ContributionRequestPublicationService } from './services/contribution-request-publication.service';
import { ContributionRequestSkillRequirementsService } from './services/contribution-request-skill-requirements.service';
import { ContributionTasksService } from './services/contribution-tasks.service';
import { PublicContributionRequestsService } from './services/public-contribution-requests.service';
import { ContributionRequestReputationFactsService } from './services/contribution-request-reputation-facts.service';
import { SkillGapGuidanceContextService } from './services/skill-gap-guidance-context.service';

@Module({
  imports: [
    forwardRef(() => ProjectsModule),
    forwardRef(() => ApplicationsModule),
  ],
  controllers: [ContributionTasksController, PublicContributionRequestsController],
  providers: [
    ContributionTasksService,
    ContributionRequestPublicationService,
    ContributionRequestSkillRequirementsService,
    PublicContributionRequestsService,
    ContributionRequestReputationFactsService,
    SkillGapGuidanceContextService,
  ],
  exports: [
    ContributionTasksService,
    ContributionRequestSkillRequirementsService,
    ContributionRequestReputationFactsService,
    SkillGapGuidanceContextService,
  ],
})
export class ContributionTasksModule {}
