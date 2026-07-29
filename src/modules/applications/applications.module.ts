import { forwardRef, Module } from '@nestjs/common';

import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ContributorProfilesModule } from '../contributor-profiles/contributor-profiles.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationReviewWindowQueue } from './jobs/application-review-window.queue';
import { ApplicationReviewWindowWorker } from './jobs/application-review-window.worker';
import { ApplicationReviewWindowService } from './services/application-review-window.service';

@Module({
  imports: [
    forwardRef(() => ContributionTasksModule),
    ContributorProfilesModule,
    IdentityModule,
    NotificationsModule,
    SkillProfilesModule,
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationReviewWindowService,
    ApplicationReviewWindowQueue,
    ApplicationReviewWindowWorker,
  ],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
