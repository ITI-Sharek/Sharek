import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { GithubModule } from '../github/github.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SkillProfilesService } from './skill-profiles.service';
import { SkillProfileGenerationService } from './services/skill-profile-generation.service';
import { SkillProfileSummaryService } from './services/skill-profile-summary.service';
import { SkillProfilesReviewService } from './services/skill-profiles-review.service';
import { SkillProfileGenerationRepository } from './repositories/skill-profile-generation.repository';
import { SkillProfileGenerationQueue } from './jobs/skill-profile-generation.queue';
import { SkillProfileGenerationWorker } from './jobs/skill-profile-generation.worker';
import { SkillProfilesController } from './controllers/skill-profiles.controller';

@Module({
  imports: [AiModule, GithubModule, IdentityModule, NotificationsModule],
  controllers: [SkillProfilesController],
  providers: [
    SkillProfilesService,
    SkillProfileSummaryService,
    SkillProfilesReviewService,
    SkillProfileGenerationService,
    SkillProfileGenerationWorker,
    SkillProfileGenerationQueue,
    SkillProfileGenerationRepository,
  ],
  exports: [
    SkillProfilesService,
    SkillProfileSummaryService,
    SkillProfilesReviewService,
  ],
})
export class SkillProfilesModule {}
