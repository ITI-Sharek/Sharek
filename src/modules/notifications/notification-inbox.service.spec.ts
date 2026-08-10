import { NotificationType } from '@prisma/client';

import { NotificationClock, NotificationInboxService } from './notification-inbox.service';

describe('NotificationInboxService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const firstId = '22222222-2222-4222-8222-222222222222';
  const secondId = '33333333-3333-4333-8333-333333333333';
  const thirdId = '66666666-6666-4666-8666-666666666666';
  const firstCreatedAt = new Date('2026-08-08T10:00:00.000Z');
  const secondCreatedAt = new Date('2026-08-08T09:00:00.000Z');
  const fixedClock = {
    now: () => new Date('2026-08-08T12:00:00.000Z'),
  } as NotificationClock;

  function notification(id: string, createdAt: Date, isRead = false) {
    return {
      id,
      user_id: userId,
      type: NotificationType.application_status,
      template_key: 'application.accepted',
      template_version: 1,
      parameters: {
        applicationId: '44444444-4444-4444-8444-444444444444',
        contributionRequestId: '55555555-5555-4555-8555-555555555555',
      },
      deep_link: '/applications/44444444-4444-4444-8444-444444444444',
      priority: 'attention',
      title: null,
      message: null,
      metadata: null,
      deduplication_key: null,
      is_read: isRead,
      read_at: isRead ? createdAt : null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
    };
  }

  it('lists retained notifications with a stable opaque cursor and recipient filter', async () => {
    const database = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ preferred_language: 'en' }),
      },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({ retention_days: 90 }),
      },
      notification: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            notification(firstId, firstCreatedAt),
            notification(secondId, secondCreatedAt),
            notification(thirdId, new Date('2026-08-08T08:00:00.000Z')),
          ]),
      },
    };
    const presenter = {
      present: jest.fn((item) => ({
        notificationId: item.id,
        type: item.type,
        templateKey: item.template_key,
        templateVersion: item.template_version,
        title: 'Application accepted',
        body: 'Your Application was accepted and an Assignment was created.',
        deepLink: item.deep_link,
        priority: item.priority,
        isRead: item.is_read,
        readAt: item.read_at,
        createdAt: item.created_at,
        aggregateVersion: item.aggregate_version,
      })),
    };
    const service = new NotificationInboxService(
      database as never,
      presenter as never,
      undefined,
      fixedClock,
    );

    const result = await service.list(userId, {
      limit: 2,
      type: NotificationType.application_status,
    });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(database.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: userId,
          type: NotificationType.application_status,
          created_at: {
            gte: new Date('2026-05-10T12:00:00.000Z'),
          },
        }),
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );
  });

  it('rejects malformed cursors before querying another user\'s inbox', async () => {
    const database = {
      user: { findUnique: jest.fn() },
      notificationPreference: { findUnique: jest.fn() },
      notification: { findMany: jest.fn() },
    };
    const service = new NotificationInboxService(database as never, {
      present: jest.fn(),
    } as never);

    await expect(
      service.list(userId, { cursor: 'not-a-server-cursor' }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_CURSOR_INVALID' });
    expect(database.notification.findMany).not.toHaveBeenCalled();
  });

  it('counts only retained unread notifications for the authenticated recipient', async () => {
    const database = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({ retention_days: 30 }),
      },
      notification: {
        count: jest.fn().mockResolvedValue(3),
      },
    };
    const service = new NotificationInboxService(
      database as never,
      { present: jest.fn() } as never,
      undefined,
      fixedClock,
    );

    await expect(service.unreadCount(userId)).resolves.toEqual({ unreadCount: 3 });
    expect(database.notification.count).toHaveBeenCalledWith({
      where: {
        user_id: userId,
        is_read: false,
        created_at: { gte: new Date('2026-07-09T12:00:00.000Z') },
      },
    });
  });

  it('can count only unread conversation activity notifications for the chat badge', async () => {
    const database = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({ retention_days: 90 }),
      },
      notification: {
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const service = new NotificationInboxService(
      database as never,
      { present: jest.fn() } as never,
      undefined,
      fixedClock,
    );

    await expect(
      service.unreadCount(userId, { type: NotificationType.conversation_activity }),
    ).resolves.toEqual({ unreadCount: 2 });
    expect(database.notification.count).toHaveBeenCalledWith({
      where: {
        user_id: userId,
        is_read: false,
        created_at: { gte: new Date('2026-05-10T12:00:00.000Z') },
        type: NotificationType.conversation_activity,
      },
    });
  });

  it('persists one read-state event for a real transition and is idempotent on replay', async () => {
    const unread = notification(firstId, firstCreatedAt, false);
    const read = notification(firstId, firstCreatedAt, true);
    read.aggregate_version = 2;
    const transaction = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({ retention_days: 90 }),
      },
      notification: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(unread)
          .mockResolvedValueOnce(read)
          .mockResolvedValueOnce(read),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const database = {
      ...transaction,
      user: {
        findUnique: jest.fn().mockResolvedValue({ preferred_language: 'en' }),
      },
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction)),
    };
    const presenter = {
      present: jest.fn((item) => ({
        notificationId: item.id,
        type: item.type,
        templateKey: item.template_key,
        templateVersion: item.template_version,
        title: 'Application accepted',
        body: 'body',
        deepLink: item.deep_link,
        priority: item.priority,
        isRead: item.is_read,
        readAt: item.read_at,
        createdAt: item.created_at,
        aggregateVersion: item.aggregate_version,
      })),
    };
    const notificationRealtime = {
      publishReadStateChanged: jest.fn(),
    };
    const service = new NotificationInboxService(
      database as never,
      presenter as never,
      undefined,
      fixedClock,
      notificationRealtime as never,
    );

    await expect(
      service.setReadState(userId, firstId, 'read'),
    ).resolves.toMatchObject({ isRead: true, aggregateVersion: 2 });
    expect(transaction.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        notification_id: firstId,
        user_id: userId,
        event_type: 'read_state_changed',
        aggregate_version: 2,
      },
    });
    expect(notificationRealtime.publishReadStateChanged).toHaveBeenCalledWith({
      id: 'event-1',
    });

    await expect(
      service.setReadState(userId, firstId, 'read'),
    ).resolves.toMatchObject({ isRead: true, aggregateVersion: 2 });
    expect(transaction.notification.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.notificationEvent.create).toHaveBeenCalledTimes(1);
    expect(notificationRealtime.publishReadStateChanged).toHaveBeenCalledTimes(1);
  });

  it('marks only the caller snapshot read and emits one event per changed item', async () => {
    const first = notification(firstId, firstCreatedAt, false);
    const second = notification(secondId, secondCreatedAt, false);
    const transaction = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({ retention_days: 90 }),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([first, second]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event' }),
      },
    };
    const database = {
      ...transaction,
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction)),
    };
    const service = new NotificationInboxService(
      database as never,
      { present: jest.fn() } as never,
      undefined,
      fixedClock,
    );

    await expect(service.markAllRead(userId)).resolves.toEqual({
      updatedCount: 2,
      snapshotAt: '2026-08-08T12:00:00.000Z',
    });
    expect(transaction.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: userId,
          is_read: false,
          created_at: expect.objectContaining({
            lte: new Date('2026-08-08T12:00:00.000Z'),
          }),
        }),
      }),
    );
    expect(transaction.notification.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.notificationEvent.create).toHaveBeenCalledTimes(2);
  });
});
