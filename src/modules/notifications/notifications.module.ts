import { Module } from '@nestjs/common';

import { NotificationEventsService } from './notification-events.service';
import { NotificationPresenterService } from './notification-presenter.service';
import { NotificationsService } from './notifications.service';
import { NotificationClock, NotificationInboxService } from './notification-inbox.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsController } from './notifications.controller';
import { RealtimeModule } from '../../shared/realtime/realtime.module';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationEventRecoveryService } from './notification-event-recovery.service';
import { NotificationEventRecoveryQueue } from './jobs/notification-event-recovery.queue';
import { NotificationEventRecoveryWorker } from './jobs/notification-event-recovery.worker';
import { NotificationRetentionService } from './notification-retention.service';
import { NotificationRetentionQueue } from './jobs/notification-retention.queue';
import { NotificationRetentionWorker } from './jobs/notification-retention.worker';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [
    NotificationEventsService,
    NotificationPresenterService,
    NotificationsService,
    NotificationInboxService,
    NotificationClock,
    NotificationPreferencesService,
    NotificationRealtimeService,
    NotificationEventRecoveryService,
    NotificationEventRecoveryQueue,
    NotificationEventRecoveryWorker,
    NotificationRetentionService,
    NotificationRetentionQueue,
    NotificationRetentionWorker,
  ],
  exports: [NotificationsService, NotificationInboxService, NotificationPreferencesService],
})
export class NotificationsModule {}
