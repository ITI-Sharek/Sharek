import { Module } from '@nestjs/common';

import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { AdminSkillReviewsController } from './controllers/admin-skill-reviews.controller';

@Module({
  imports: [SkillProfilesModule],
  controllers: [AdminSkillReviewsController],
})
export class AdminModule {}
