import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { GithubModule } from '../github/github.module';
import { SkillProfileGenerationRepository } from './application/ports/skill-profile-generation.repository';
import { SkillProfileGenerationJobQueue } from './application/ports/skill-profile-generation-job-queue';
import { GetSkillProfileGenerationUseCase } from './application/use-cases/get-skill-profile-generation.use-case';
import { SkillProfileGenerationProcessorService } from './application/use-cases/skill-profile-generation-processor.service';
import { SkillProfileSummaryReaderService } from './application/use-cases/skill-profile-summary-reader.service';
import { StartSkillProfileGenerationUseCase } from './application/use-cases/start-skill-profile-generation.use-case';
import { PrismaSkillProfileGenerationRepository } from './infrastructure/persistence/prisma-skill-profile-generation.repository';
import { BullMqSkillProfileGenerationQueue } from './infrastructure/jobs/skill-profile-generation.queue';
import { SkillProfileGenerationWorker } from './infrastructure/jobs/skill-profile-generation.worker';
import { SkillProfilesController } from './presentation/http/controllers/skill-profiles.controller';

@Module({
  imports: [AiModule, GithubModule],
  controllers: [SkillProfilesController],
  providers: [
    SkillProfileSummaryReaderService,
    StartSkillProfileGenerationUseCase,
    GetSkillProfileGenerationUseCase,
    SkillProfileGenerationProcessorService,
    SkillProfileGenerationWorker,
    BullMqSkillProfileGenerationQueue,
    {
      provide: SkillProfileGenerationJobQueue,
      useExisting: BullMqSkillProfileGenerationQueue,
    },
    {
      provide: SkillProfileGenerationRepository,
      useClass: PrismaSkillProfileGenerationRepository,
    },
  ],
  exports: [SkillProfileSummaryReaderService],
})
export class SkillProfilesModule {}
