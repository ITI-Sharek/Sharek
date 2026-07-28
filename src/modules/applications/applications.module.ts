import { forwardRef, Module } from '@nestjs/common';

import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [
    forwardRef(() => ContributionTasksModule),
    IdentityModule,
    NotificationsModule,
    SkillProfilesModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
