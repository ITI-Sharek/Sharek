import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { FastApiSkillProfileClient } from './integrations/fastapi-skill-profile.client';

@Module({
  providers: [AiService, FastApiSkillProfileClient],
  exports: [AiService],
})
export class AiModule {}
