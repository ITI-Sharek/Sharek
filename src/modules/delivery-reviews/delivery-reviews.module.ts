import { Module } from '@nestjs/common';

import { ApplicationsModule } from '../applications/applications.module';
import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeliveryReviewsController } from './delivery-reviews.controller';
import { DeliveryApprovedEventsService } from './delivery-approved-events.service';
import { DeliveryReviewsService } from './delivery-reviews.service';
import { DeliveryReputationFactsService } from './delivery-reputation-facts.service';
import { ReputationModule } from '../reputation/reputation.module';
import { DeliveryReputationProjectionService } from './delivery-reputation-projection.service';
import { DeliveryReputationQueue } from './jobs/delivery-reputation.queue';
import { DeliveryReputationWorker } from './jobs/delivery-reputation.worker';

@Module({
  imports: [
    ApplicationsModule,
    ContributionTasksModule,
    NotificationsModule,
    ReputationModule,
  ],
  controllers: [DeliveryReviewsController],
  providers: [
    DeliveryReviewsService,
    DeliveryApprovedEventsService,
    DeliveryReputationFactsService,
    DeliveryReputationProjectionService,
    DeliveryReputationQueue,
    DeliveryReputationWorker,
  ],
  exports: [DeliveryApprovedEventsService, DeliveryReputationFactsService],
})
export class DeliveryReviewsModule {}
