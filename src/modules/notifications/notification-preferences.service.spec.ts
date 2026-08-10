import { NotificationType } from '@prisma/client';

import { NotificationPreferencesService } from './notification-preferences.service';

describe('NotificationPreferencesService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  function preference(overrides: Record<string, unknown> = {}) {
    return {
      user_id: userId,
      retention_days: 90,
      quiet_hours_enabled: false,
      quiet_start_local: null,
      quiet_end_local: null,
      quiet_timezone: null,
      revision: 1,
      created_at: new Date('2026-08-08T10:00:00.000Z'),
      updated_at: new Date('2026-08-08T10:00:00.000Z'),
      categories: [],
      ...overrides,
    };
  }

  it('returns default retention and category policy when no row exists', async () => {
    const database = {
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new NotificationPreferencesService(database as never);

    const result = await service.get(userId);

    expect(result.retentionDays).toBe(90);
    expect(result.revision).toBe(1);
    expect(result.quietHours).toEqual({
      enabled: false,
      startLocal: null,
      endLocal: null,
      timeZone: null,
    });
    expect(result.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: NotificationType.application_status,
          requiredInApp: true,
          inAppEnabled: true,
          browserEnabled: false,
        }),
        expect.objectContaining({
          type: NotificationType.task_recommendation,
          requiredInApp: false,
          inAppEnabled: true,
          browserEnabled: false,
        }),
      ]),
    );
  });

  it('accepts overnight quiet hours and persists a revisioned partial update', async () => {
    const updated = preference({
      retention_days: 180,
      quiet_hours_enabled: true,
      quiet_start_local: new Date('1970-01-01T22:00:00.000Z'),
      quiet_end_local: new Date('1970-01-01T07:00:00.000Z'),
      quiet_timezone: 'Africa/Cairo',
      revision: 2,
      categories: [
        {
          user_id: userId,
          type: NotificationType.task_recommendation,
          in_app_enabled: false,
          browser_enabled: false,
        },
      ],
    });
    const transaction = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(preference()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationCategoryPreference: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const database = {
      ...transaction,
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction)),
    };
    transaction.notificationPreference.findUnique
      .mockResolvedValueOnce(preference())
      .mockResolvedValueOnce(updated);
    const service = new NotificationPreferencesService(database as never);

    const result = await service.update(userId, {
      expectedRevision: 1,
      retentionDays: 180,
      quietHours: {
        enabled: true,
        startLocal: '22:00',
        endLocal: '07:00',
        timeZone: 'Africa/Cairo',
      },
      categories: [
        {
          type: NotificationType.task_recommendation,
          inAppEnabled: false,
          browserEnabled: false,
        },
      ],
    });

    expect(result.retentionDays).toBe(180);
    expect(result.quietHours.startLocal).toBe('22:00');
    expect(result.quietHours.endLocal).toBe('07:00');
    expect(result.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: NotificationType.task_recommendation,
          inAppEnabled: false,
        }),
      ]),
    );
    expect(transaction.notificationPreference.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: userId, revision: 1 },
        data: expect.objectContaining({
          retention_days: 180,
          quiet_hours_enabled: true,
          quiet_timezone: 'Africa/Cairo',
          revision: { increment: 1 },
        }),
      }),
    );
  });

  it('rejects required category disablement, invalid time zones, and stale revisions', async () => {
    const current = preference();
    const database = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const service = new NotificationPreferencesService(database as never);
    database.$transaction.mockImplementation(
      async (callback: (tx: typeof database) => unknown) => callback(database),
    );

    await expect(
      service.update(userId, {
        expectedRevision: 1,
        categories: [
          {
            type: NotificationType.application_status,
            inAppEnabled: false,
            browserEnabled: false,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_REQUIRED_CATEGORY' });

    await expect(
      service.update(userId, {
        expectedRevision: 1,
        quietHours: {
          enabled: true,
          startLocal: '22:00',
          endLocal: '07:00',
          timeZone: 'Not/AZone',
        },
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_TIME_ZONE_INVALID' });

    await expect(
      service.update(userId, { expectedRevision: 2, retentionDays: 30 }),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_PREFERENCES_REVISION_CONFLICT',
    });
    expect(database.notificationPreference.updateMany).not.toHaveBeenCalled();
  });
});
