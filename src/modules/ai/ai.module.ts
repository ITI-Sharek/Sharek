import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { AdvisoryFitClient } from './integrations/advisory-fit.client';
import { FastApiSkillProfileClient } from './integrations/fastapi-skill-profile.client';
import { MaterialAnalysisClient } from './integrations/material-analysis.client';
import { RequirementInferenceClient } from './integrations/requirement-inference.client';
import { SkillGapGuidanceClient } from './integrations/skill-gap-guidance.client';

@Module({
  providers: [
    AiService,
    FastApiSkillProfileClient,
    AdvisoryFitClient,
    MaterialAnalysisClient,
    SkillGapGuidanceClient,
    RequirementInferenceClient,
  ],
  exports: [AiService],
})
export class AiModule {}
