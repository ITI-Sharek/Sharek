import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { ContributionProposalsController } from './contribution-proposals.controller';
import { ContributionProposalsService } from './contribution-proposals.service';
import { ProposalEligibilityService } from './services/proposal-eligibility.service';

@Module({
  imports: [
    ProjectsModule,
    ContributionTasksModule,
    NotificationsModule,
    AiModule,
    EligibilityModule,
  ],
  controllers: [ContributionProposalsController],
  providers: [ContributionProposalsService, ProposalEligibilityService],
  exports: [ContributionProposalsService],
})
export class ContributionProposalsModule {}
