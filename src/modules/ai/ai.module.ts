import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { AdvisoryFitClient } from './integrations/advisory-fit.client';
import { FastApiSkillProfileClient } from './integrations/fastapi-skill-profile.client';
import { MaterialAnalysisClient } from './integrations/material-analysis.client';
import { SkillGapGuidanceClient } from './integrations/skill-gap-guidance.client';
import { ContributorMatchingClient } from './integrations/contributor-matching.client';

@Module({
  providers: [
    AiService,
    FastApiSkillProfileClient,
    AdvisoryFitClient,
    MaterialAnalysisClient,
    SkillGapGuidanceClient,
    ContributorMatchingClient,
  ],
  exports: [AiService],
})
export class AiModule {}
