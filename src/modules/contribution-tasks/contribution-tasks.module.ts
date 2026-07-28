import { forwardRef, Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { ApplicationsModule } from '../applications/applications.module';
import { ContributionTasksController } from './controllers/contribution-tasks.controller';
import { PublicContributionRequestsController } from './controllers/public-contribution-requests.controller';
import { ContributionRequestPublicationService } from './services/contribution-request-publication.service';
import { ContributionTasksService } from './services/contribution-tasks.service';
import { PublicContributionRequestsService } from './services/public-contribution-requests.service';

@Module({
  imports: [
    forwardRef(() => ProjectsModule),
    forwardRef(() => ApplicationsModule),
  ],
  controllers: [ContributionTasksController, PublicContributionRequestsController],
  providers: [
    ContributionTasksService,
    ContributionRequestPublicationService,
    PublicContributionRequestsService,
  ],
  exports: [ContributionTasksService],
})
export class ContributionTasksModule {}
