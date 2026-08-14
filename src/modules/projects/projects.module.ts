import { forwardRef, Module } from '@nestjs/common';

import { ApplicationsModule } from '../applications/applications.module';
import { GithubModule } from '../github/github.module';
import { IdentityModule } from '../identity/identity.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PublicProjectsController } from './public-projects.controller';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectPublicationService } from './services/project-publication.service';
import { PublicProjectsService } from './services/public-projects.service';

@Module({
  imports: [
    forwardRef(() => ApplicationsModule),
    GithubModule,
    IdentityModule,
    forwardRef(() => SubscriptionsModule),
  ],
  controllers: [ProjectsController, PublicProjectsController],
  providers: [
    ProjectsService,
    ProjectPublicationService,
    PublicProjectsService,
  ],
  exports: [ProjectsService, ProjectPublicationService],
})
export class ProjectsModule {}
