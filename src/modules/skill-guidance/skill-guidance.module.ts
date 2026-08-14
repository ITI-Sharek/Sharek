import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { SkillGapGuidanceController } from './skill-guidance.controller';
import { SkillGapGuidanceService } from './skill-guidance.service';
import { EligibilityGuidanceController } from './controllers/eligibility-guidance.controller';
import { EligibilityGuidanceService } from './services/eligibility-guidance.service';
import { EligibilityGuidanceProcessorService } from './services/eligibility-guidance-processor.service';
import { EligibilityGuidanceQueue } from './jobs/eligibility-guidance.queue';
import { EligibilityGuidanceWorker } from './jobs/eligibility-guidance.worker';

@Module({
  imports: [AiModule, ContributionTasksModule, SkillProfilesModule],
  controllers: [SkillGapGuidanceController, EligibilityGuidanceController],
  providers: [
    SkillGapGuidanceService,
    EligibilityGuidanceService,
    EligibilityGuidanceProcessorService,
    EligibilityGuidanceQueue,
    EligibilityGuidanceWorker,
  ],
  exports: [EligibilityGuidanceService],
})
export class SkillGuidanceModule {}
