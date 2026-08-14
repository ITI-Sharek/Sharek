import { forwardRef, Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ProjectsModule } from '../projects/projects.module';
import { ApplicationsModule } from '../applications/applications.module';
import { ContributionTasksController } from './controllers/contribution-tasks.controller';
import { PublicContributionRequestsController } from './controllers/public-contribution-requests.controller';
import { ContributionRequestPublicationService } from './services/contribution-request-publication.service';
import { ContributionRequestSkillRequirementsService } from './services/contribution-request-skill-requirements.service';
import { RequirementInferenceProcessorService } from './services/requirement-inference-processor.service';
import { RequirementInferenceQueue } from './jobs/requirement-inference.queue';
import { RequirementInferenceWorker } from './jobs/requirement-inference.worker';
import { ContributionTasksService } from './services/contribution-tasks.service';
import { PublicContributionRequestsService } from './services/public-contribution-requests.service';
import { ContributionRequestReputationFactsService } from './services/contribution-request-reputation-facts.service';
import { SkillGapGuidanceContextService } from './services/skill-gap-guidance-context.service';

@Module({
  imports: [
    forwardRef(() => ProjectsModule),
    forwardRef(() => ApplicationsModule),
    AiModule,
  ],
  controllers: [ContributionTasksController, PublicContributionRequestsController],
  providers: [
    ContributionTasksService,
    ContributionRequestPublicationService,
    ContributionRequestSkillRequirementsService,
    RequirementInferenceProcessorService,
    RequirementInferenceQueue,
    RequirementInferenceWorker,
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
