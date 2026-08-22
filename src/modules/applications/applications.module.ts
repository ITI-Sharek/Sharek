import { forwardRef, Module } from '@nestjs/common';

import { AssignmentConversationsModule } from '../assignment-conversations/assignment-conversations.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ContributorProfilesModule } from '../contributor-profiles/contributor-profiles.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { AiModule } from '../ai/ai.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { AdvisoryFitAssessmentQueue } from './jobs/advisory-fit-assessment.queue';
import { AdvisoryFitAssessmentWorker } from './jobs/advisory-fit-assessment.worker';
import { AdvisoryFitAssessmentProcessorService } from './services/advisory-fit-assessment-processor.service';
import { AdvisoryFitAssessmentReaperService } from './services/advisory-fit-assessment-reaper.service';
import { ApplicationReviewWindowQueue } from './jobs/application-review-window.queue';
import { ApplicationReviewWindowWorker } from './jobs/application-review-window.worker';
import { ApplicationReviewWindowService } from './services/application-review-window.service';
import { AdvisoryFitAssessmentService } from './services/advisory-fit-assessment.service';
import { ApplicationReputationFactsService } from './services/application-reputation-facts.service';
import { ApplicationDailyQuotaService } from './services/application-daily-quota.service';
import { ApplicationDeliveryContextService } from './services/application-delivery-context.service';
import { ApplicationReplayService } from './services/application-replay.service';

@Module({
  imports: [
    forwardRef(() => ContributionTasksModule),
    AssignmentConversationsModule,
    AiModule,
    ContributorProfilesModule,
    forwardRef(() => EligibilityModule),
    IdentityModule,
    NotificationsModule,
    SkillProfilesModule,
    forwardRef(() => SubscriptionsModule),
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    AdvisoryFitAssessmentService,
    ApplicationReviewWindowService,
    AdvisoryFitAssessmentQueue,
    AdvisoryFitAssessmentWorker,
    AdvisoryFitAssessmentProcessorService,
    AdvisoryFitAssessmentReaperService,
    ApplicationReviewWindowQueue,
    ApplicationReviewWindowWorker,
    ApplicationReputationFactsService,
    ApplicationDailyQuotaService,
    ApplicationDeliveryContextService,
    ApplicationReplayService,
  ],
  exports: [
    ApplicationsService,
    ApplicationReputationFactsService,
    ApplicationDailyQuotaService,
    ApplicationDeliveryContextService,
  ],
})
export class ApplicationsModule {}
