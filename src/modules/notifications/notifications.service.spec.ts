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

  it('persists an Application notification on the caller transaction and defers realtime delivery until commit', async () => {
    const notification = {
      id: 'notification-transaction-1',
      user_id: 'contributor-1',
      type: NotificationType.application_status,
      title: 'Application accepted',
      message: 'Your Application was accepted and an Assignment was created.',
      metadata: {
        applicationId: 'application-1',
        contributionRequestId: 'request-1',
        action: 'accepted',
      },
      deduplication_key: 'application:application-1:accepted',
      is_read: false,
      read_at: null,
      created_at: new Date('2026-07-29T12:00:00.000Z'),
    };
    const database = { notification: { findUnique: jest.fn(), create: jest.fn() } };
    const transaction = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(notification),
      },
    };
    const gateway = { emitNotification: jest.fn().mockReturnValue(true) };
    const service = new NotificationsService(database as never, gateway as never);

    const result = await service.createApplicationNotification(
      {
        userId: 'contributor-1',
        applicationId: 'application-1',
        contributionRequestId: 'request-1',
        action: 'accepted',
      },
      { transaction: transaction as never, emitRealtime: false },
    );

    expect(result.created).toBe(true);
    expect(transaction.notification.create).toHaveBeenCalledTimes(1);
    expect(database.notification.create).not.toHaveBeenCalled();
    expect(gateway.emitNotification).not.toHaveBeenCalled();

    service.emitApplicationNotifications([result.notification]);
    expect(gateway.emitNotification).toHaveBeenCalledWith(result.notification);
  });

  it('persists and deduplicates a Proposal response notification on the caller transaction', async () => {
    const notification = {
      id: 'notification-proposal-1',
      user_id: 'contributor-1',
      type: NotificationType.proposal_status,
      title: 'Proposal accepted',
      message:
        'The Project owner accepted your Contribution Proposal and created an attributed draft Contribution Request.',
      metadata: {
        proposalId: 'proposal-1',
        projectId: 'project-1',
        action: 'accepted',
        resultingContributionRequestId: 'request-1',
      },
      deduplication_key: 'proposal:proposal-1:accepted',
      is_read: false,
      read_at: null,
      created_at: new Date('2026-07-30T12:00:00.000Z'),
    };
    const database = {
      notification: { findUnique: jest.fn(), create: jest.fn() },
    };
    const transaction = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(notification),
      },
    };
    const gateway = { emitNotification: jest.fn().mockReturnValue(true) };
    const service = new NotificationsService(
      database as never,
      gateway as never,
    );

    const result = await service.createProposalNotification(
      {
        userId: 'contributor-1',
        proposalId: 'proposal-1',
        projectId: 'project-1',
        action: 'accepted',
        resultingContributionRequestId: 'request-1',
      },
      { transaction: transaction as never, emitRealtime: false },
    );

    expect(result.created).toBe(true);
    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'contributor-1',
        type: NotificationType.proposal_status,
        deduplication_key: 'proposal:proposal-1:accepted',
      }),
    });
    expect(database.notification.create).not.toHaveBeenCalled();
    expect(gateway.emitNotification).not.toHaveBeenCalled();

    service.emitProposalNotifications([result.notification]);
    expect(gateway.emitNotification).toHaveBeenCalledWith(result.notification);
  });

  it.each([
    [
      'accepted',
      'Application accepted',
      'Your Application was accepted and an Assignment was created.',
    ],
    [
      'declined_by_owner',
      'Application declined by owner',
      'The Project owner declined your Application. This decision affects only this Application.',
    ],
    [
      'not_selected',
      'Another contributor was selected',
      'Another contributor was selected for this Contribution Request. This does not affect your eligibility or reputation.',
    ],
    [
      'owner_review_reminder',
      'Application awaiting review',
      'An Application for your Contribution Request has been waiting for review for 3 days.',
    ],
    [
      'expired',
      'Application review window expired',
      'Your Application expired because it was not reviewed within 7 days. This is not an owner rejection and does not affect your eligibility or reputation.',
    ],
  ] as const)(
    'creates a distinct, deduplicated %s Application notification',
    async (action, title, message) => {
      const createdAt = new Date('2026-07-29T12:00:00.000Z');
      const persisted = {
        id: `notification-${action}`,
        user_id: 'contributor-1',
        type: NotificationType.application_status,
        title,
        message,
        metadata: {
          applicationId: 'application-1',
          contributionRequestId: 'request-1',
          action,
        },
        deduplication_key: `application:application-1:${action}`,
        is_read: false,
        read_at: null,
        created_at: createdAt,
      };
      const database = {
        notification: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(persisted),
        },
      };
      const gateway = { emitNotification: jest.fn().mockReturnValue(false) };
      const service = new NotificationsService(
        database as never,
        gateway as never,
      );

      await expect(
        service.createApplicationNotification({
          userId: 'contributor-1',
          applicationId: 'application-1',
          contributionRequestId: 'request-1',
          action,
        }),
      ).resolves.toMatchObject({ created: true });

      expect(database.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title,
          message,
          deduplication_key: `application:application-1:${action}`,
        }),
      });
    },
  );
});
