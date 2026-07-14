import { Module } from '@nestjs/common';

import { SkillProfileGenerator } from './application/ports/skill-profile-generator.port';
import { FastApiSkillProfileGeneratorClient } from './infrastructure/integrations/fastapi-skill-profile-generator.client';

@Module({
  providers: [
    FastApiSkillProfileGeneratorClient,
    {
      provide: SkillProfileGenerator,
      useExisting: FastApiSkillProfileGeneratorClient,
    },
  ],
  exports: [SkillProfileGenerator],
})
export class AiModule {}
