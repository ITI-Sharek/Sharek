import { Module } from '@nestjs/common';

import { ApplicationsModule } from '../applications/applications.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { AiModule } from '../ai/ai.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MatchRanker } from './match-ranker';
import { AiMatchRanker } from './integrations/ai-match-ranker';
import { MatchingService } from './matching.service';
import { RecommendationsController } from './recommendations.controller';
import { RecommendedTasksService } from './recommended-tasks.service';
import { OwnerContributorMatchingController } from './owner-contributor-matching.controller';
import { OwnerContributorMatchingService } from './owner-contributor-matching.service';

/**
 * Matching owns `AiMatchResult` and nothing else. Every fact it ranks on is read
 * through the exported service of the module that owns it.
 *
 * `MatchRanker` is bound to the AI ranking agent, behind `MATCH_RANKER_ENABLED`
 * which defaults to off. The deterministic shortlist is a complete answer on
 * its own, so the ranker only ever changes the order — never which Requests a
 * contributor sees.
 */
@Module({
  imports: [
    SubscriptionsModule,
    SkillProfilesModule,
    ContributionTasksModule,
    ApplicationsModule,
    ReputationModule,
    AiModule,
  ],
  controllers: [RecommendationsController, OwnerContributorMatchingController],
  providers: [
    MatchingService,
    RecommendedTasksService,
    OwnerContributorMatchingService,
    // Binds the port. Off unless MATCH_RANKER_ENABLED; every failure mode
    // falls back to the deterministic order.
    { provide: MatchRanker, useClass: AiMatchRanker },
  ],
  exports: [MatchingService, RecommendedTasksService],
})
export class MatchingModule {}
