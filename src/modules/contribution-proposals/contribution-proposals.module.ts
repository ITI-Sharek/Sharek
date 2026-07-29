import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { ContributionProposalsController } from './contribution-proposals.controller';
import { ContributionProposalsService } from './contribution-proposals.service';

@Module({
  imports: [ProjectsModule],
  controllers: [ContributionProposalsController],
  providers: [ContributionProposalsService],
  exports: [ContributionProposalsService],
})
export class ContributionProposalsModule {}
