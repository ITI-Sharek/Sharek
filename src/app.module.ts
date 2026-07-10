import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { ContributionTasksModule } from './modules/contribution-tasks/contribution-tasks.module';
import { DeliveryReviewsModule } from './modules/delivery-reviews/delivery-reviews.module';
import { GithubModule } from './modules/github/github.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { SkillProfilesModule } from './modules/skill-profiles/skill-profiles.module';
import { AuthModule } from './shared/auth/auth.module';
import { envValidationSchema } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { EventsModule } from './shared/events/events.module';
import { ObservabilityModule } from './shared/observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    ObservabilityModule,
    DatabaseModule,
    AuthModule,
    EventsModule,
    HealthModule,
    IdentityModule,
    GithubModule,
    SkillProfilesModule,
    ProjectsModule,
    ContributionTasksModule,
    ApplicationsModule,
    DeliveryReviewsModule,
    ReputationModule,
    AdminModule,
    AiModule,
  ],
})
export class AppModule { }
