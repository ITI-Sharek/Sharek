import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { AdvisoryFitClient } from './integrations/advisory-fit.client';
import { FastApiSkillProfileClient } from './integrations/fastapi-skill-profile.client';

@Module({
  providers: [AiService, FastApiSkillProfileClient, AdvisoryFitClient],
  exports: [AiService],
})
export class AiModule {}
