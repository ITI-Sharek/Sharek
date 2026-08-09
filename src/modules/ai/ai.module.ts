import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { AdvisoryFitClient } from './integrations/advisory-fit.client';
import { FastApiSkillProfileClient } from './integrations/fastapi-skill-profile.client';
import { MaterialAnalysisClient } from './integrations/material-analysis.client';

@Module({
  providers: [
    AiService,
    FastApiSkillProfileClient,
    AdvisoryFitClient,
    MaterialAnalysisClient,
  ],
  exports: [AiService],
})
export class AiModule {}
