import { Module } from '@nestjs/common';

import { MatchingModule } from '../matching/matching.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ContributorDashboardController } from './contributor-dashboard.controller';
import { ContributorDashboardService } from './contributor-dashboard.service';

@Module({
  imports: [MatchingModule, ReputationModule, SubscriptionsModule],
  controllers: [ContributorDashboardController],
  providers: [ContributorDashboardService],
})
export class DashboardModule {}
