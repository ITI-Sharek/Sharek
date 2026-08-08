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

  it('creates one persisted skill-profile generation notification per status', async () => {
    const createdAt = new Date('2026-08-08T10:00:00.000Z');
    const persisted = {
      id: 'notification-generation-1',
      user_id: 'user-1',
      type: NotificationType.skill_profile_generation,
      title: 'Skill analysis ready for review',
      message:
        'Your skill analysis is complete. 3 skills are waiting for admin review.',
      metadata: {
        generationId: 'generation-1',
        status: 'ready_for_review',
        skillCount: 3,
        selectedRepositoryCount: 2,
      },
      deduplication_key:
        'skill-profile-generation:generation-1:ready_for_review',
      is_read: false,
      read_at: null,
      created_at: createdAt,
    };
    const database = {
      notification: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(persisted),
        create: jest.fn().mockResolvedValue(persisted),
      },
    };
    const gateway = { emitNotification: jest.fn().mockReturnValue(true) };
    const service = new NotificationsService(database as never, gateway as never);
    const input = {
      userId: 'user-1',
      generationId: 'generation-1',
      status: 'ready_for_review' as const,
      skillCount: 3,
      selectedRepositoryCount: 2,
    };

    await expect(service.createSkillProfileGenerationNotification(input)).resolves.toMatchObject({
      notificationId: persisted.id,
      created: true,
      deliveredRealtime: true,
    });
    await expect(service.createSkillProfileGenerationNotification(input)).resolves.toMatchObject({
      notificationId: persisted.id,
      created: false,
      deliveredRealtime: false,
    });
    expect(database.notification.create).toHaveBeenCalledTimes(1);
    expect(gateway.emitNotification).toHaveBeenCalledTimes(1);
  });

  it('persists a ready-for-review inbox item for every active admin', async () => {
    const createdAt = new Date('2026-08-08T10:00:00.000Z');
    const contributorNotification = {
      id: 'notification-contributor-1',
      user_id: 'user-1',
      type: NotificationType.skill_profile_generation,
      title: 'Skill analysis ready for review',
      message: 'Your skill analysis is complete.',
      metadata: { generationId: 'generation-2', status: 'ready_for_review' },
      is_read: false,
      read_at: null,
      created_at: createdAt,
    };
    const adminNotification = {
      ...contributorNotification,
      id: 'notification-admin-1',
      user_id: 'admin-1',
      title: 'Skill analysis awaiting admin review',
      message: 'A contributor has a completed skill analysis with 2 skills waiting for your review.',
      metadata: {
        generationId: 'generation-2',
        status: 'ready_for_review',
        skillCount: 2,
        audience: 'admin',
      },
    };
    const database = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
      },
      notification: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest
          .fn()
          .mockResolvedValueOnce(contributorNotification)
          .mockResolvedValueOnce(adminNotification),
      },
    };
    const gateway = { emitNotification: jest.fn().mockReturnValue(true) };
    const service = new NotificationsService(database as never, gateway as never);

    await expect(
      service.createSkillProfileGenerationNotification({
        userId: 'user-1',
        generationId: 'generation-2',
        status: 'ready_for_review',
        skillCount: 2,
      }),
    ).resolves.toMatchObject({
      notificationId: contributorNotification.id,
      created: true,
    });

    expect(database.user.findMany).toHaveBeenCalledWith({
      where: { role: 'admin', status: 'active' },
      select: { id: true },
    });
    expect(database.notification.create).toHaveBeenCalledTimes(2);
    expect(database.notification.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        user_id: 'admin-1',
        title: 'Skill analysis awaiting admin review',
        metadata: expect.objectContaining({ audience: 'admin' }),
        deduplication_key:
          'skill-profile-generation:generation-2:ready_for_review:admin:admin-1',
      }),
    });
    expect(gateway.emitNotification).toHaveBeenCalledTimes(2);
  });

  it('lists only the user inbox and marks notifications read', async () => {
    const createdAt = new Date('2026-08-08T10:00:00.000Z');
    const notification = {
      id: 'notification-1',
      user_id: 'user-1',
      type: NotificationType.skill_profile_generation,
      title: 'More evidence is needed',
      message: 'Select more repositories or try again.',
      metadata: { generationId: 'generation-1', status: 'needs_more_evidence' },
      is_read: false,
      read_at: null,
      created_at: createdAt,
    };
    const database = {
      notification: {
        findMany: jest.fn().mockResolvedValue([notification]),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const gateway = { emitNotification: jest.fn() };
    const service = new NotificationsService(database as never, gateway as never);

    await expect(service.listForUser('user-1', 200)).resolves.toEqual({
      items: [
        expect.objectContaining({
          notificationId: 'notification-1',
          userId: 'user-1',
        }),
      ],
      unreadCount: 1,
    });
    expect(database.notification.findMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    await expect(service.markRead('user-1', 'notification-1')).resolves.toEqual({
      success: true,
      updatedCount: 1,
    });
    await expect(service.markAllRead('user-1')).resolves.toEqual({
      success: true,
      updatedCount: 1,
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
