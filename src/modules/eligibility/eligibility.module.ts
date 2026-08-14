import { forwardRef, Module } from '@nestjs/common';

import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { EligibilityController } from './eligibility.controller';
import { EligibilityService } from './services/eligibility.service';

@Module({
  imports: [
    forwardRef(() => ContributionTasksModule),
    forwardRef(() => SkillProfilesModule),
  ],
  controllers: [EligibilityController],
  providers: [EligibilityService],
  exports: [EligibilityService],
})
export class EligibilityModule {}
