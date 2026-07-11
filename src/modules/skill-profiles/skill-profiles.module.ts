import { Module } from '@nestjs/common';

import { SkillProfileSummaryReaderService } from './application/use-cases/skill-profile-summary-reader.service';

@Module({
  providers: [SkillProfileSummaryReaderService],
  exports: [SkillProfileSummaryReaderService],
})
export class SkillProfilesModule {}
