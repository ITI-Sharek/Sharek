import { Module } from '@nestjs/common';

import { ApplicationsModule } from '../applications/applications.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MatchingService } from './matching.service';

/**
 * Matching owns no tables. Every fact it ranks on is read through the exported
 * service of the module that owns it, which is why this module is all imports
 * and one service.
 */
@Module({
  imports: [
    SubscriptionsModule,
    SkillProfilesModule,
    ContributionTasksModule,
    ApplicationsModule,
    ReputationModule,
  ],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
