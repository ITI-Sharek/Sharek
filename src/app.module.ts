import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './modules/admin/admin.module';
import { AssignmentConversationsModule } from './modules/assignment-conversations/assignment-conversations.module';
import { AiModule } from './modules/ai/ai.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ContributionProposalsModule } from './modules/contribution-proposals/contribution-proposals.module';
import { ContributionTasksModule } from './modules/contribution-tasks/contribution-tasks.module';
import { ContributorProfilesModule } from './modules/contributor-profiles/contributor-profiles.module';
import { DeliveryReviewsModule } from './modules/delivery-reviews/delivery-reviews.module';
import { GithubModule } from './modules/github/github.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { SkillProfilesModule } from './modules/skill-profiles/skill-profiles.module';
import { SkillGuidanceModule } from './modules/skill-guidance/skill-guidance.module';
import { MatchingModule } from './modules/matching/matching.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AuthModule } from './shared/auth/auth.module';
import { envValidationSchema } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { EventsModule } from './shared/events/events.module';
import { ObservabilityModule } from './shared/observability/observability.module';
import { RealtimeModule } from './shared/realtime/realtime.module';

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
    RealtimeModule,
    DatabaseModule,
    AuthModule,
    EventsModule,
    HealthModule,
    IdentityModule,
    GithubModule,
    NotificationsModule,
    SkillProfilesModule,
    SubscriptionsModule,
    ProjectsModule,
    ContributionTasksModule,
    ContributorProfilesModule,
    ApplicationsModule,
    MaterialsModule,
    ContributionProposalsModule,
    DeliveryReviewsModule,
    ReputationModule,
    AdminModule,
    AiModule,
    AssignmentConversationsModule,
    SkillGuidanceModule,
    MatchingModule,
  ],
})
export class AppModule { }
