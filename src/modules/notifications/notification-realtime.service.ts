import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationEvent,
  NotificationEventType,
  UserRole,
} from '@prisma/client';

import { createRealtimeEventEnvelope } from '../../shared/realtime/realtime-event-envelope';
import { RealtimePublisherService } from '../../shared/realtime/realtime-publisher.service';
import { DatabaseService } from '../../shared/database/database.service';
import {
  NotificationAudience,
  NotificationPresenterService,
} from './notification-presenter.service';

export type NotificationPublicationOutcome =
  | 'published'
  | 'unavailable'
  | 'retry_exhausted'
  | 'disabled'
  | 'not_found';

@Injectable()
export class NotificationRealtimeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly presenter: NotificationPresenterService,
    private readonly publisher: RealtimePublisherService,
    private readonly config: ConfigService = new ConfigService(),
  ) {}

  async publishCreated(notificationId: string): Promise<boolean> {
    if (!this.publisher.isEnabled()) return false;

    const event = await this.database.notificationEvent.findFirst({
      where: {
        notification_id: notificationId,
        event_type: NotificationEventType.created,
      },
      orderBy: { aggregate_version: 'desc' },
    });
    if (!event) return false;
    return (await this.publishEvent(event)) === 'published';
  }

  async publishReadStateChanged(event: NotificationEvent): Promise<boolean> {
    if (!this.publisher.isEnabled()) return false;
    return (await this.publishEvent(event)) === 'published';
  }

  async publishEvent(
    event: NotificationEvent,
  ): Promise<NotificationPublicationOutcome> {
    if (!this.publisher.isEnabled()) return 'disabled';

    const eventType =
      event.event_type === NotificationEventType.created
        ? 'notification.created'
        : 'notification.read_state_changed';
    const notification = await this.database.notification.findUnique({
      where: { id: event.notification_id },
    });
    if (!notification) return 'not_found';

    const user = await this.database.user.findUnique({
      where: { id: notification.user_id },
      select: { preferred_language: true, role: true },
    });
    const language = user?.preferred_language === 'ar' ? 'ar' : 'en';
    const audience = this.notificationAudience(user?.role);
    const presentation = this.presenter.present(notification, language, {
      audience,
    });
    const envelope = createRealtimeEventEnvelope({
      eventId: event.id,
      type: eventType,
      occurredAt: event.occurred_at,
      aggregateId: notification.id,
      aggregateVersion: event.aggregate_version,
      payload: { notification: presentation },
    });
    const delivered = this.publisher.publishToUser(notification.user_id, envelope);

    return this.recordAttempt(event, delivered);
  }

  async recordFailedAttempt(
    event: NotificationEvent,
    errorCode: 'REALTIME_RECOVERY_ERROR' = 'REALTIME_RECOVERY_ERROR',
  ): Promise<NotificationPublicationOutcome> {
    if (!this.publisher.isEnabled()) return 'disabled';
    return this.recordAttempt(event, false, errorCode);
  }

  private async recordAttempt(
    event: NotificationEvent,
    delivered: boolean,
    errorCode: 'REALTIME_UNAVAILABLE' | 'REALTIME_RECOVERY_ERROR' =
      'REALTIME_UNAVAILABLE',
  ): Promise<NotificationPublicationOutcome> {
    const nextAttempts = event.publish_attempts + 1;
    const exhausted =
      !delivered && nextAttempts >= this.maxPublishAttempts();
    try {
      await this.database.notificationEvent.update({
        where: { id: event.id },
        data: delivered
          ? {
              published_at: new Date(),
              publish_attempts: { increment: 1 },
              last_publish_error_code: null,
            }
          : {
              publish_attempts: { increment: 1 },
              last_publish_error_code: exhausted
                ? 'REALTIME_RETRY_EXHAUSTED'
                : errorCode,
            },
      });
    } catch {
      // Publication is best effort; the durable row/event must not be rolled
      // back because an outbox bookkeeping update was unavailable.
    }

    if (delivered) return 'published';
    return exhausted ? 'retry_exhausted' : 'unavailable';
  }

  private maxPublishAttempts(): number {
    return Math.max(
      1,
      this.config.get<number>('NOTIFICATION_EVENT_MAX_PUBLISH_ATTEMPTS', 5),
    );
  }

  private notificationAudience(
    role: UserRole | undefined,
  ): NotificationAudience | undefined {
    if (role === UserRole.owner) return 'owner';
    if (role === UserRole.contributor) return 'contributor';
    if (role === UserRole.admin) return 'admin';
    return undefined;
  }
}
