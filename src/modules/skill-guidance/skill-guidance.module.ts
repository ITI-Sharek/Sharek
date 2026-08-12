import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { SkillGapGuidanceController } from './skill-guidance.controller';
import { SkillGapGuidanceService } from './skill-guidance.service';

@Module({
  imports: [AiModule, ContributionTasksModule, SkillProfilesModule],
  controllers: [SkillGapGuidanceController],
  providers: [SkillGapGuidanceService],
})
export class SkillGuidanceModule {}
