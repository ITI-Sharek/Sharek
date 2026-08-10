import { ConfigService } from '@nestjs/config';

import { NotificationRetentionService } from './notification-retention.service';

const DAY_MS = 24 * 60 * 60 * 1_000;

describe('NotificationRetentionService', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');
  const notifications = new Map<
    string,
    { id: string; user_id: string; created_at: Date }
  >();
  const retentionDays = new Map<string, number>();
  const database = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    notification: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    notifications.clear();
    retentionDays.clear();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.$queryRaw.mockResolvedValue([]);
    database.notification.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(notifications.get(where.id) ?? null),
    );
    database.notificationPreference.findUnique.mockImplementation(
      ({ where }: { where: { user_id: string } }) =>
        Promise.resolve(
          retentionDays.has(where.user_id)
            ? { retention_days: retentionDays.get(where.user_id) }
            : null,
        ),
    );
    database.notification.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('purges only rows strictly older than each 30/90/180/365-day cutoff', async () => {
    const candidates = [30, 90, 180, 365].flatMap((days) => {
      const userId = `user-${days}`;
      retentionDays.set(userId, days);
      const cutoff = new Date(now.getTime() - days * DAY_MS);
      const expiredId = `expired-${days}`;
      const boundaryId = `boundary-${days}`;
      notifications.set(expiredId, {
        id: expiredId,
        user_id: userId,
        created_at: new Date(cutoff.getTime() - 1),
      });
      notifications.set(boundaryId, {
        id: boundaryId,
        user_id: userId,
        created_at: cutoff,
      });
      return [notifications.get(expiredId), notifications.get(boundaryId)];
    });
    database.$queryRaw.mockResolvedValue(candidates);

    const service = new NotificationRetentionService(
      database as never,
      new ConfigService({ NOTIFICATION_RETENTION_BATCH_SIZE: 100 }),
    );

    await expect(service.purgeExpired(now)).resolves.toEqual({
      purged: 4,
      skipped: 4,
    });
    expect(database.notification.deleteMany).toHaveBeenCalledTimes(4);
    expect(
      database.notification.deleteMany.mock.calls.map(
        ([input]) => input.where.id,
      ),
    ).toEqual(['expired-30', 'expired-90', 'expired-180', 'expired-365']);
  });

  it('uses the recipient current preference when it changed after candidate selection', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-1',
      created_at: new Date('2026-06-01T12:00:00.000Z'),
    };
    notifications.set(notification.id, notification);
    database.$queryRaw.mockResolvedValue([notification]);
    retentionDays.set(notification.user_id, 90);

    const service = new NotificationRetentionService(
      database as never,
      new ConfigService({ NOTIFICATION_RETENTION_BATCH_SIZE: 1 }),
    );

    await expect(service.purgeExpired(now)).resolves.toEqual({
      purged: 0,
      skipped: 1,
    });
    expect(database.notification.deleteMany).not.toHaveBeenCalled();

    retentionDays.set(notification.user_id, 30);
    await expect(service.purgeExpired(now)).resolves.toEqual({
      purged: 1,
      skipped: 0,
    });
  });

  it('queries a bounded batch and deletes only Notification rows so events cascade', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-1',
      created_at: new Date('2026-01-01T12:00:00.000Z'),
    };
    notifications.set(notification.id, notification);
    database.$queryRaw.mockResolvedValue([notification]);
    retentionDays.set(notification.user_id, 90);

    const service = new NotificationRetentionService(
      database as never,
      new ConfigService({ NOTIFICATION_RETENTION_BATCH_SIZE: 7 }),
    );

    await service.purgeExpired(now);

    const query = database.$queryRaw.mock.calls[0]?.[0] as {
      strings?: string[];
    };
    expect(query.strings?.join('')).toContain('LIMIT');
    expect(database.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        id: notification.id,
        created_at: { lt: expect.any(Date) },
      },
    });
    expect(database).not.toHaveProperty('notificationEvent.deleteMany');
  });
});
