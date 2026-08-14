import { Module } from '@nestjs/common';

import { ApplicationsModule } from '../applications/applications.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MatchingService } from './matching.service';
import { RecommendationsController } from './recommendations.controller';
import { RecommendedTasksService } from './recommended-tasks.service';

/**
 * Matching owns `AiMatchResult` and nothing else. Every fact it ranks on is read
 * through the exported service of the module that owns it.
 *
 * `MatchRanker` is deliberately unbound: the AI ranker lives in AI_Agents, and
 * its absence is a supported state. Binding it here later is a one-line change.
 */
@Module({
  imports: [
    SubscriptionsModule,
    SkillProfilesModule,
    ContributionTasksModule,
    ApplicationsModule,
    ReputationModule,
  ],
  controllers: [RecommendationsController],
  providers: [MatchingService, RecommendedTasksService],
  exports: [MatchingService],
})
export class MatchingModule {}
