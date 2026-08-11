import { forwardRef, Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContributorMatchingController } from './matching.controller';
import { ContributorRecommendationsController } from './recommendations.controller';
import { ContributorMatchingService } from './matching.service';
import { ContributorMatchingQueue } from './jobs/contributor-matching.queue';
import { ContributorMatchingWorker } from './jobs/contributor-matching.worker';

@Module({
  imports: [
    AiModule,
    forwardRef(() => ContributionTasksModule),
    ReputationModule,
    SkillProfilesModule,
    SubscriptionsModule,
    NotificationsModule,
  ],
  controllers: [ContributorMatchingController, ContributorRecommendationsController],
  providers: [
    ContributorMatchingService,
    ContributorMatchingQueue,
    ContributorMatchingWorker,
  ],
  exports: [ContributorMatchingService],
})
export class MatchingModule {}
