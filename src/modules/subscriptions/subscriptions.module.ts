import { forwardRef, Module } from '@nestjs/common';

import { ApplicationsModule } from '../applications/applications.module';
import { ProjectsModule } from '../projects/projects.module';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionStatusService } from './subscription-status.service';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * `EntitlementsService` has no module dependencies at all, which is what lets
 * every enforcement point depend on it. The status endpoint does need usage
 * counts, and those belong to whichever module owns the thing being counted, so
 * the two forward references below exist for the read side only.
 */
@Module({
  imports: [forwardRef(() => ProjectsModule), forwardRef(() => ApplicationsModule)],
  controllers: [SubscriptionsController],
  providers: [EntitlementsService, SubscriptionStatusService],
  exports: [EntitlementsService],
})
export class SubscriptionsModule {}
