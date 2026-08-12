import { forwardRef, Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { ApplicationsModule } from '../applications/applications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MatchingModule } from '../matching/matching.module';
import { ContributionTasksController } from './controllers/contribution-tasks.controller';
import { PublicContributionRequestsController } from './controllers/public-contribution-requests.controller';
import { ContributionRequestPublicationService } from './services/contribution-request-publication.service';
import { ContributionTasksService } from './services/contribution-tasks.service';
import { PublicContributionRequestsService } from './services/public-contribution-requests.service';
import { ContributionRequestReputationFactsService } from './services/contribution-request-reputation-facts.service';
import { SkillGapGuidanceContextService } from './services/skill-gap-guidance-context.service';

@Module({
  imports: [
    forwardRef(() => ProjectsModule),
    forwardRef(() => ApplicationsModule),
    SubscriptionsModule,
    forwardRef(() => MatchingModule),
  ],
  controllers: [ContributionTasksController, PublicContributionRequestsController],
  providers: [
    ContributionTasksService,
    ContributionRequestPublicationService,
    PublicContributionRequestsService,
    ContributionRequestReputationFactsService,
    SkillGapGuidanceContextService,
  ],
  exports: [
    ContributionTasksService,
    ContributionRequestReputationFactsService,
    SkillGapGuidanceContextService,
  ],
})
export class ContributionTasksModule {}
