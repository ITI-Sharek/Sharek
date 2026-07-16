import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { GithubModule } from '../github/github.module';
import { SkillProfilesService } from './skill-profiles.service';
import { SkillProfileGenerationService } from './services/skill-profile-generation.service';
import { SkillProfileSummaryService } from './services/skill-profile-summary.service';
import { SkillProfileGenerationRepository } from './repositories/skill-profile-generation.repository';
import { SkillProfileGenerationQueue } from './jobs/skill-profile-generation.queue';
import { SkillProfileGenerationWorker } from './jobs/skill-profile-generation.worker';
import { SkillProfilesController } from './controllers/skill-profiles.controller';

@Module({
  imports: [AiModule, GithubModule],
  controllers: [SkillProfilesController],
  providers: [
    SkillProfilesService,
    SkillProfileSummaryService,
    SkillProfileGenerationService,
    SkillProfileGenerationWorker,
    SkillProfileGenerationQueue,
    SkillProfileGenerationRepository,
  ],
  exports: [SkillProfilesService, SkillProfileSummaryService],
})
export class SkillProfilesModule {}
