import { NotificationType } from '@prisma/client';

import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('creates a skill-review notification with review metadata', async () => {
    const createdAt = new Date('2026-07-19T10:00:00.000Z');
    const database = {
      notification: {
        create: jest.fn().mockResolvedValue({
          id: 'notification-1',
          user_id: 'user-1',
          type: NotificationType.skill_review,
          title: 'Skill profile approved',
          message:
            'Your TypeScript skill was approved. Your contributor account is now active.',
          metadata: {
            skillProfileId: 'skill-1',
            skillName: 'TypeScript',
            approved: true,
            activated: true,
          },
          is_read: false,
          read_at: null,
          created_at: createdAt,
        }),
      },
    };
    const gateway = {
      emitNotification: jest.fn().mockReturnValue(true),
    };
    const service = new NotificationsService(database as never, gateway as never);

    await expect(
      service.createSkillReviewNotification({
        userId: 'user-1',
        skillProfileId: 'skill-1',
        skillName: 'TypeScript',
        approved: true,
        activated: true,
      }),
    ).resolves.toEqual({
      notificationId: 'notification-1',
      created: true,
      deliveredRealtime: true,
      notification: {
        notificationId: 'notification-1',
        userId: 'user-1',
        type: 'skill_review',
        title: 'Skill profile approved',
        message:
          'Your TypeScript skill was approved. Your contributor account is now active.',
        metadata: {
          skillProfileId: 'skill-1',
          skillName: 'TypeScript',
          approved: true,
          activated: true,
        },
        isRead: false,
        readAt: null,
        createdAt,
      },
    });
    expect(database.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        type: NotificationType.skill_review,
        title: 'Skill profile approved',
        message:
          'Your TypeScript skill was approved. Your contributor account is now active.',
        metadata: {
          skillProfileId: 'skill-1',
          skillName: 'TypeScript',
          approved: true,
          activated: true,
        },
      },
    });
    expect(gateway.emitNotification).toHaveBeenCalledWith({
      notificationId: 'notification-1',
      userId: 'user-1',
      type: 'skill_review',
      title: 'Skill profile approved',
      message:
        'Your TypeScript skill was approved. Your contributor account is now active.',
      metadata: {
        skillProfileId: 'skill-1',
        skillName: 'TypeScript',
        approved: true,
        activated: true,
      },
      isRead: false,
      readAt: null,
      createdAt,
    });
  });

  it('deduplicates Application notifications by Application and action', async () => {
    const createdAt = new Date('2026-07-28T12:00:00.000Z');
    const persisted = {
      id: 'notification-application-1',
      user_id: 'owner-1',
      type: NotificationType.application_status,
      title: 'New Application received',
      message:
        'A contributor submitted an Application for your Contribution Request.',
      metadata: {
        applicationId: 'application-1',
        contributionRequestId: 'request-1',
        action: 'submitted',
      },
      deduplication_key: 'application:application-1:submitted',
      is_read: false,
      read_at: null,
      created_at: createdAt,
    };
    const database = {
      notification: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(persisted),
        create: jest.fn().mockResolvedValue(persisted),
      },
    };
    const gateway = { emitNotification: jest.fn().mockReturnValue(true) };
    const service = new NotificationsService(database as never, gateway as never);
    const input = {
      userId: 'owner-1',
      applicationId: 'application-1',
      contributionRequestId: 'request-1',
      action: 'submitted' as const,
    };

    await expect(service.createApplicationNotification(input)).resolves.toMatchObject({
      created: true,
      deliveredRealtime: true,
    });
    await expect(service.createApplicationNotification(input)).resolves.toMatchObject({
      created: false,
      deliveredRealtime: false,
    });
    expect(database.notification.create).toHaveBeenCalledTimes(1);
    expect(gateway.emitNotification).toHaveBeenCalledTimes(1);
  });
});
