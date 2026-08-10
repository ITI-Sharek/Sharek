import { Injectable } from '@nestjs/common';
import {
  Notification,
  NotificationEvent,
  NotificationEventType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class NotificationEventsService {
  appendCreated(
    transaction: Prisma.TransactionClient,
    notification: Notification,
  ): Promise<NotificationEvent> {
    return transaction.notificationEvent.create({
      data: {
        notification_id: notification.id,
        user_id: notification.user_id,
        event_type: NotificationEventType.created,
        aggregate_version: notification.aggregate_version,
      },
    });
  }

  appendReadStateChanged(
    transaction: Prisma.TransactionClient,
    notification: Notification,
  ): Promise<NotificationEvent> {
    return transaction.notificationEvent.create({
      data: {
        notification_id: notification.id,
        user_id: notification.user_id,
        event_type: NotificationEventType.read_state_changed,
        aggregate_version: notification.aggregate_version,
      },
    });
  }
}
