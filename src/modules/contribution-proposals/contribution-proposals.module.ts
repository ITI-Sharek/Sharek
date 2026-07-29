import { Module } from '@nestjs/common';

import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ProjectsModule } from '../projects/projects.module';
import { ContributionProposalsController } from './contribution-proposals.controller';
import { ContributionProposalsService } from './contribution-proposals.service';

@Module({
  imports: [ProjectsModule, ContributionTasksModule],
  controllers: [ContributionProposalsController],
  providers: [ContributionProposalsService],
  exports: [ContributionProposalsService],
})
export class ContributionProposalsModule {}
