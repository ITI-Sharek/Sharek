import { NotificationEventType, NotificationType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { NotificationRealtimeService } from './notification-realtime.service';

describe('NotificationRealtimeService', () => {
  const occurredAt = new Date('2026-08-09T10:00:00.000Z');
  const notification = {
    id: 'notification-1',
    user_id: 'user-1',
    type: NotificationType.application_status,
    template_key: 'application.accepted',
    template_version: 1,
    parameters: {
      applicationId: 'application-1',
      contributionRequestId: 'request-1',
    },
    deep_link: '/applications/application-1',
    priority: 'attention',
    title: null,
    message: null,
    metadata: null,
    deduplication_key: null,
    is_read: false,
    read_at: null,
    aggregate_version: 1,
    created_at: occurredAt,
    updated_at: occurredAt,
  };
  const event = {
    id: 'event-1',
    notification_id: notification.id,
    user_id: notification.user_id,
    event_type: NotificationEventType.created,
    aggregate_version: 1,
    occurred_at: occurredAt,
    published_at: null,
    publish_attempts: 0,
    last_publish_error_code: null,
  };
  const presentation = {
    notificationId: notification.id,
    type: notification.type,
    templateKey: notification.template_key,
    templateVersion: 1,
    title: 'Application accepted',
    body: 'Your Application was accepted.',
    deepLink: notification.deep_link,
    priority: notification.priority,
    isRead: false,
    readAt: null,
    createdAt: occurredAt,
    aggregateVersion: 1,
  };

  function createService(enabled = true) {
    const database = {
      notificationEvent: {
        findFirst: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue(event),
      },
      notification: {
        findUnique: jest.fn().mockResolvedValue(notification),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          preferred_language: 'en',
          role: 'contributor',
        }),
      },
    };
    const presenter = { present: jest.fn().mockReturnValue(presentation) };
    const publisher = {
      isEnabled: jest.fn().mockReturnValue(enabled),
      publishToUser: jest.fn().mockReturnValue(true),
    };
    return {
      service: new NotificationRealtimeService(
        database as never,
        presenter as never,
        publisher as never,
      ),
      database,
      presenter,
      publisher,
    };
  }

  it('publishes a created event as a stable shared envelope and records success', async () => {
    const { service, database, presenter, publisher } = createService();

    await expect(service.publishCreated(notification.id)).resolves.toBe(true);

    expect(database.notificationEvent.findFirst).toHaveBeenCalledWith({
      where: {
        notification_id: notification.id,
        event_type: NotificationEventType.created,
      },
      orderBy: { aggregate_version: 'desc' },
    });
    expect(presenter.present).toHaveBeenCalledWith(notification, 'en', {
      audience: 'contributor',
    });
    expect(publisher.publishToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        eventId: 'event-1',
        type: 'notification.created',
        version: 1,
        occurredAt: occurredAt.toISOString(),
        aggregateId: notification.id,
        aggregateVersion: 1,
        payload: { notification: presentation },
      }),
    );
    expect(database.notificationEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: {
        published_at: expect.any(Date) as Date,
        publish_attempts: { increment: 1 },
        last_publish_error_code: null,
      },
    });
  });

  it('publishes read-state changes under the second shared envelope type', async () => {
    const { service, publisher } = createService();
    const readStateEvent = {
      ...event,
      id: 'event-read-1',
      event_type: NotificationEventType.read_state_changed,
      aggregate_version: 2,
    };

    await expect(service.publishEvent(readStateEvent as never)).resolves.toBe(
      'published',
    );

    expect(publisher.publishToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        eventId: 'event-read-1',
        type: 'notification.read_state_changed',
        aggregateVersion: 2,
      }),
    );
  });

  it('does not touch the outbox when realtime is intentionally disabled', async () => {
    const { service, database, publisher } = createService(false);

    await expect(service.publishCreated(notification.id)).resolves.toBe(false);

    expect(publisher.publishToUser).not.toHaveBeenCalled();
    expect(database.notificationEvent.findFirst).not.toHaveBeenCalled();
    expect(database.notificationEvent.update).not.toHaveBeenCalled();
  });

  it('records a failed attempt without changing the durable notification', async () => {
    const { service, database, publisher } = createService();
    publisher.publishToUser.mockReturnValue(false);

    await expect(
      service.publishReadStateChanged(event as never),
    ).resolves.toBe(false);

    expect(database.notificationEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: {
        publish_attempts: { increment: 1 },
        last_publish_error_code: 'REALTIME_UNAVAILABLE',
      },
    });
  });

  it('marks the final bounded failure with a safe operational code', async () => {
    const { database, publisher } = createService();
    publisher.publishToUser.mockReturnValue(false);

    await expect(
      new NotificationRealtimeService(
        database as never,
        { present: jest.fn().mockReturnValue(presentation) } as never,
        publisher as never,
        new ConfigService({ NOTIFICATION_EVENT_MAX_PUBLISH_ATTEMPTS: 5 }),
      ).publishEvent({ ...event, publish_attempts: 4 } as never),
    ).resolves.toBe('retry_exhausted');

    expect(database.notificationEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: {
        publish_attempts: { increment: 1 },
        last_publish_error_code: 'REALTIME_RETRY_EXHAUSTED',
      },
    });
  });
});
