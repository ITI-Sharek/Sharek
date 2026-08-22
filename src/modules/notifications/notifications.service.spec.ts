import {
  NotificationEventType,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('persists a resubmission notification with owner feedback-safe Delivery parameters', async () => {
    const createdAt = new Date('2026-08-11T12:00:00.000Z');
    const persisted = {
      id: 'notification-delivery-1',
      user_id: 'owner-1',
      type: NotificationType.delivery_update,
      template_key: 'delivery.resubmitted',
      template_version: 1,
      parameters: {
        deliveryId: 'delivery-1',
        contributionRequestId: 'request-1',
        submissionNumber: 2,
      },
      deep_link: '/deliveries/delivery-1',
      priority: 'attention',
      deduplication_key: 'delivery:delivery-1:resubmitted:2',
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
      title: null,
      message: null,
      metadata: null,
    };
    const transaction = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(persisted),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-delivery-1' }),
      },
    };
    const service = new NotificationsService({} as never);

    await expect(
      service.createDeliveryNotification(
        {
          userId: 'owner-1',
          deliveryId: 'delivery-1',
          contributionRequestId: 'request-1',
          action: 'resubmitted',
          submissionNumber: 2,
        },
        { transaction: transaction as never, emitRealtime: false },
      ),
    ).resolves.toMatchObject({ created: true, deliveredRealtime: false });
    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        template_key: 'delivery.resubmitted',
        deep_link: '/deliveries/delivery-1',
        deduplication_key: 'delivery:delivery-1:resubmitted:2',
      }),
    });
  });

  it('creates an urgent missed-call notification for the callee, deep-linking to the conversation', async () => {
    const createdAt = new Date('2026-08-22T12:30:00.000Z');
    const persisted = {
      id: 'notification-missed-call-1',
      user_id: 'callee-1',
      type: NotificationType.assignment_call,
      template_key: 'assignment_call.missed',
      template_version: 1,
      parameters: {
        conversationId: 'conversation-1',
        callId: 'call-1',
        callerName: 'Cal Ler',
      },
      deep_link: '/messages?conversation=conversation-1',
      priority: 'urgent',
      deduplication_key: 'assignment-call-missed:call-1',
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
      title: null,
      message: null,
      metadata: null,
    };
    const transaction = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(persisted),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-missed-call-1' }),
      },
    };
    const service = new NotificationsService({} as never);

    await expect(
      service.createMissedCallNotification(
        {
          userId: 'callee-1',
          callId: 'call-1',
          conversationId: 'conversation-1',
          callerName: 'Cal Ler',
        },
        { transaction: transaction as never, emitRealtime: false },
      ),
    ).resolves.toMatchObject({
      notificationId: persisted.id,
      created: true,
      deliveredRealtime: false,
      notification: {
        type: NotificationType.assignment_call,
        title: 'Missed call',
        message: 'You missed a call from Cal Ler.',
      },
    });

    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'callee-1',
        type: NotificationType.assignment_call,
        template_key: 'assignment_call.missed',
        priority: 'urgent',
        deep_link: '/messages?conversation=conversation-1',
        deduplication_key: 'assignment-call-missed:call-1',
      }),
    });
    expect(transaction.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        notification_id: persisted.id,
        user_id: 'callee-1',
        event_type: NotificationEventType.created,
        aggregate_version: 1,
      },
    });
  });

  it('deduplicates a missed-call notification per call, returning the existing row without creating a second one', async () => {
    const createdAt = new Date('2026-08-22T12:30:00.000Z');
    const existing = {
      id: 'notification-missed-call-1',
      user_id: 'callee-1',
      type: NotificationType.assignment_call,
      template_key: 'assignment_call.missed',
      template_version: 1,
      parameters: { conversationId: 'conversation-1', callId: 'call-1', callerName: 'Cal Ler' },
      deep_link: '/messages?conversation=conversation-1',
      priority: 'urgent',
      deduplication_key: 'assignment-call-missed:call-1',
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
      title: null,
      message: null,
      metadata: null,
    };
    const transaction = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
      notificationEvent: { create: jest.fn() },
    };
    const service = new NotificationsService({} as never);

    await expect(
      service.createMissedCallNotification(
        { userId: 'callee-1', callId: 'call-1', conversationId: 'conversation-1', callerName: 'Cal Ler' },
        { transaction: transaction as never, emitRealtime: false },
      ),
    ).resolves.toMatchObject({ notificationId: existing.id, created: false });
    expect(transaction.notification.create).not.toHaveBeenCalled();
    expect(transaction.notificationEvent.create).not.toHaveBeenCalled();
  });

  it('creates a conversation activity notification and its durable event in the message transaction', async () => {
    const createdAt = new Date('2026-08-10T12:00:00.000Z');
    const persisted = {
      id: 'notification-conversation-1',
      user_id: 'owner-1',
      type: NotificationType.conversation_activity,
      template_key: 'conversation.activity',
      template_version: 1,
      parameters: {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        senderName: 'Contributor Name',
        messagePreview: 'Hello owner',
        messageCount: 1,
      },
      deep_link: '/messages?conversation=conversation-1',
      priority: 'attention',
      deduplication_key: 'conversation:conversation-1:message-1',
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
      title: null,
      message: null,
      metadata: null,
    };
    const transaction = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(persisted),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-conversation-1' }),
      },
    };
    const service = new NotificationsService({} as never);

    await expect(
      service.createConversationActivityNotification(
        {
          userId: 'owner-1',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          senderName: 'Contributor Name',
          messagePreview: 'Hello owner',
        },
        { transaction: transaction as never, emitRealtime: false },
      ),
    ).resolves.toMatchObject({
      notificationId: persisted.id,
      created: true,
      deliveredRealtime: false,
      notification: {
        type: NotificationType.conversation_activity,
        title: 'New message from Contributor Name',
        message: 'Hello owner',
      },
    });

    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'owner-1',
        type: NotificationType.conversation_activity,
        template_key: 'conversation.activity',
        deduplication_key: 'conversation:conversation-1:message-1',
      }),
    });
    expect(transaction.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        notification_id: persisted.id,
        user_id: 'owner-1',
        event_type: NotificationEventType.created,
        aggregate_version: 1,
      },
    });
  });

  it('groups later unread messages for the same conversation and refreshes the latest preview', async () => {
    const createdAt = new Date('2026-08-10T12:00:00.000Z');
    const existing = {
      id: 'notification-conversation-group-1',
      user_id: 'owner-1',
      type: NotificationType.conversation_activity,
      template_key: 'conversation.activity',
      template_version: 1,
      parameters: {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        senderName: 'Contributor Name',
        messagePreview: 'First message',
        messageCount: 1,
      },
      deep_link: '/messages?conversation=conversation-1',
      priority: 'attention',
      deduplication_key: 'conversation:conversation-1:message-1',
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
      title: null,
      message: null,
      metadata: null,
    };
    const updated = {
      ...existing,
      parameters: {
        ...existing.parameters,
        messageId: 'message-2',
        messagePreview: 'Latest message',
        messageCount: 2,
      },
      aggregate_version: 2,
    };
    const transaction = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-group-2' }),
      },
    };
    const service = new NotificationsService({} as never);

    await expect(
      service.createConversationActivityNotification(
        {
          userId: 'owner-1',
          conversationId: 'conversation-1',
          messageId: 'message-2',
          senderName: 'Contributor Name',
          messagePreview: 'Latest message',
        },
        { transaction: transaction as never, emitRealtime: false },
      ),
    ).resolves.toMatchObject({
      notificationId: existing.id,
      created: false,
      updated: true,
      notification: {
        title: '2 new messages from Contributor Name',
        message: 'Latest message',
      },
    });
    expect(transaction.notification.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: {
        parameters: {
          ...existing.parameters,
          messageId: 'message-2',
          messagePreview: 'Latest message',
          messageCount: 2,
        },
        aggregate_version: { increment: 1 },
      },
    });
    expect(transaction.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        notification_id: existing.id,
        user_id: existing.user_id,
        event_type: NotificationEventType.created,
        aggregate_version: 2,
      },
    });
  });

  it('publishes a committed notification only through the shared realtime service', async () => {
    const createdAt = new Date('2026-08-09T12:00:00.000Z');
    const persisted = {
      id: 'notification-shared-realtime-1',
      user_id: 'user-1',
      type: NotificationType.skill_review,
      template_key: 'skill_review.approved',
      template_version: 1,
      parameters: { skillProfileId: 'skill-1', skillName: 'TypeScript' },
      deep_link: '/settings?section=github',
      priority: 'attention',
      deduplication_key: null,
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
      title: null,
      message: null,
      metadata: null,
    };
    const transaction = {
      notification: { create: jest.fn().mockResolvedValue(persisted) },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-shared-realtime-1' }),
      },
    };
    const database = {
      notification: transaction.notification,
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const realtime = { publishCreated: jest.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      database as never,
      undefined,
      undefined,
      realtime as never,
    );

    await expect(
      service.createSkillReviewNotification({
        userId: 'user-1',
        skillProfileId: 'skill-1',
        skillName: 'TypeScript',
        approved: true,
        activated: false,
      }),
    ).resolves.toMatchObject({ deliveredRealtime: true });

    expect(realtime.publishCreated).toHaveBeenCalledWith(persisted.id);
  });

  it('persists a semantic skill-review notification without rendered copy authority', async () => {
    const createdAt = new Date('2026-08-08T10:00:00.000Z');
    const persisted = {
      id: 'notification-semantic-1',
      user_id: 'user-1',
      type: NotificationType.skill_review,
      template_key: 'skill_review.activated',
      template_version: 1,
      parameters: {
        skillProfileId: 'skill-1',
        skillName: 'TypeScript',
      },
      deep_link: '/settings?section=github',
      priority: 'attention',
      deduplication_key: null,
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
      title: null,
      message: null,
      metadata: null,
    };
    const transaction = {
      notification: {
        create: jest.fn().mockResolvedValue(persisted),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'event-semantic-1',
          notification_id: persisted.id,
        }),
      },
    };
    const database = {
      notification: transaction.notification,
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const realtime = {
      publishCreated: jest.fn().mockResolvedValue(false),
    };
    const service = new NotificationsService(
      database as never,
      undefined,
      undefined,
      realtime as never,
    );

    await service.createSkillReviewNotification({
      userId: 'user-1',
      skillProfileId: 'skill-1',
      skillName: 'TypeScript',
      approved: true,
      activated: true,
    });

    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        type: NotificationType.skill_review,
        template_key: 'skill_review.activated',
        template_version: 1,
        parameters: {
          skillProfileId: 'skill-1',
          skillName: 'TypeScript',
        },
        deep_link: '/settings?section=github',
        priority: 'attention',
      },
    });
    expect(transaction.notification.create.mock.calls[0]?.[0]?.data).not.toHaveProperty(
      'title',
    );
    expect(transaction.notification.create.mock.calls[0]?.[0]?.data).not.toHaveProperty(
      'message',
    );
    expect(transaction.notification.create.mock.calls[0]?.[0]?.data).not.toHaveProperty(
      'metadata',
    );
    expect(transaction.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        notification_id: persisted.id,
        user_id: persisted.user_id,
        event_type: NotificationEventType.created,
        aggregate_version: 1,
      },
    });
    expect(
      transaction.notificationEvent.create.mock.invocationCallOrder[0],
    ).toBeLessThan(realtime.publishCreated.mock.invocationCallOrder[0] ?? 0);
  });

  it('creates a skill-review notification with review metadata', async () => {
    const createdAt = new Date('2026-07-19T10:00:00.000Z');
    const persisted = {
      id: 'notification-1',
      user_id: 'user-1',
      type: NotificationType.skill_review,
      template_key: 'skill_review.activated',
      template_version: 1,
      parameters: {
        skillProfileId: 'skill-1',
        skillName: 'TypeScript',
      },
      deep_link: '/settings?section=github',
      priority: 'attention',
      title: null,
      message: null,
      metadata: null,
      deduplication_key: null,
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
    };
    const transaction = {
      notification: {
        create: jest.fn().mockResolvedValue(persisted),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const database = {
      notification: transaction.notification,
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const realtime = { publishCreated: jest.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      database as never,
      undefined,
      undefined,
      realtime as never,
    );

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
        },
        isRead: false,
        readAt: null,
        createdAt,
      },
    });
    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        type: NotificationType.skill_review,
        template_key: 'skill_review.activated',
        template_version: 1,
        parameters: {
          skillProfileId: 'skill-1',
          skillName: 'TypeScript',
        },
        deep_link: '/settings?section=github',
        priority: 'attention',
      },
    });
    expect(realtime.publishCreated).toHaveBeenCalledWith('notification-1');
  });

  it('does not publish when the atomic created-event append aborts creation', async () => {
    const createdAt = new Date('2026-08-08T12:00:00.000Z');
    const transaction = {
      notification: {
        create: jest.fn().mockResolvedValue({
          id: 'notification-rollback-1',
          user_id: 'user-1',
          type: NotificationType.skill_review,
          template_key: 'skill_review.approved',
          template_version: 1,
          parameters: {
            skillProfileId: 'skill-1',
            skillName: 'TypeScript',
          },
          deep_link: '/settings?section=github',
          priority: 'attention',
          title: null,
          message: null,
          metadata: null,
          deduplication_key: null,
          is_read: false,
          read_at: null,
          aggregate_version: 1,
          created_at: createdAt,
          updated_at: createdAt,
        }),
      },
      notificationEvent: {
        create: jest.fn().mockRejectedValue(new Error('event append failed')),
      },
    };
    const database = {
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const service = new NotificationsService(database as never);

    await expect(
      service.createSkillReviewNotification({
        userId: 'user-1',
        skillProfileId: 'skill-1',
        skillName: 'TypeScript',
        approved: true,
        activated: false,
      }),
    ).rejects.toThrow('event append failed');

    expect(transaction.notification.create).toHaveBeenCalledTimes(1);
    expect(transaction.notificationEvent.create).toHaveBeenCalledTimes(1);
  });

  it('creates one persisted skill-profile generation notification per status', async () => {
    const createdAt = new Date('2026-08-08T10:00:00.000Z');
    const persisted = {
      id: 'notification-generation-1',
      user_id: 'user-1',
      type: NotificationType.skill_profile_generation,
      template_key: 'skill_profile_generation.ready_for_review',
      template_version: 1,
      parameters: {
        generationId: 'generation-1',
        status: 'ready_for_review',
        audience: 'contributor',
        skillCount: 3,
        selectedRepositoryCount: 2,
      },
      deep_link: null,
      priority: 'attention',
      title: null,
      message: null,
      metadata: null,
      deduplication_key:
        'skill-profile-generation:generation-1:ready_for_review',
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
    };
    const transaction = {
      notification: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(persisted),
        create: jest.fn().mockResolvedValue(persisted),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'generation-event-1' }),
      },
    };
    const database = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      notification: { findUniqueOrThrow: jest.fn() },
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const realtime = { publishCreated: jest.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      database as never,
      undefined,
      undefined,
      realtime as never,
    );
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
    expect(transaction.notification.create).toHaveBeenCalledTimes(1);
    expect(transaction.notificationEvent.create).toHaveBeenCalledTimes(1);
    expect(realtime.publishCreated).toHaveBeenCalledTimes(1);
  });

  it('persists a ready-for-review inbox item for every active admin', async () => {
    const createdAt = new Date('2026-08-08T10:00:00.000Z');
    const contributorNotification = {
      id: 'notification-contributor-1',
      user_id: 'user-1',
      type: NotificationType.skill_profile_generation,
      template_key: 'skill_profile_generation.ready_for_review',
      template_version: 1,
      parameters: {
        generationId: 'generation-2',
        status: 'ready_for_review',
        audience: 'contributor',
        skillCount: 2,
      },
      deep_link: null,
      priority: 'attention',
      title: null,
      message: null,
      metadata: null,
      deduplication_key:
        'skill-profile-generation:generation-2:ready_for_review',
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
      updated_at: createdAt,
    };
    const adminNotification = {
      ...contributorNotification,
      id: 'notification-admin-1',
      user_id: 'admin-1',
      parameters: {
        generationId: 'generation-2',
        status: 'ready_for_review',
        skillCount: 2,
        audience: 'admin',
      },
      deduplication_key:
        'skill-profile-generation:generation-2:ready_for_review:admin:admin-1',
    };
    const transaction = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValueOnce(contributorNotification)
          .mockResolvedValueOnce(adminNotification),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'generation-event' }),
      },
    };
    const database = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
      },
      notification: { findUniqueOrThrow: jest.fn() },
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const realtime = { publishCreated: jest.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      database as never,
      undefined,
      undefined,
      realtime as never,
    );

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
    expect(transaction.notification.create).toHaveBeenCalledTimes(2);
    expect(transaction.notification.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        user_id: 'admin-1',
        template_key: 'skill_profile_generation.ready_for_review',
        parameters: expect.objectContaining({ audience: 'admin' }),
        deduplication_key:
          'skill-profile-generation:generation-2:ready_for_review:admin:admin-1',
      }),
    });
    expect(transaction.notificationEvent.create).toHaveBeenCalledTimes(2);
    expect(realtime.publishCreated).toHaveBeenCalledTimes(2);
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
      aggregate_version: 1,
      created_at: createdAt,
    };
    const transaction = {
      notification: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(persisted),
        create: jest.fn().mockResolvedValue(persisted),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-application-1' }),
      },
    };
    const database = {
      notification: transaction.notification,
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const realtime = { publishCreated: jest.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      database as never,
      undefined,
      undefined,
      realtime as never,
    );
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
    expect(transaction.notification.create).toHaveBeenCalledTimes(1);
    expect(transaction.notificationEvent.create).toHaveBeenCalledTimes(1);
    expect(realtime.publishCreated).toHaveBeenCalledTimes(1);
  });

  it('recovers a direct Application deduplication race after the transaction aborts', async () => {
    const createdAt = new Date('2026-08-08T11:00:00.000Z');
    const persisted = {
      id: 'notification-race-1',
      user_id: 'owner-1',
      type: NotificationType.application_status,
      title: 'New Application received',
      message: 'A contributor submitted an Application.',
      metadata: null,
      deduplication_key: 'application:application-race-1:submitted',
      is_read: false,
      read_at: null,
      aggregate_version: 1,
      created_at: createdAt,
    };
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'duplicate Notification',
      { code: 'P2002', clientVersion: 'test' },
    );
    const transaction = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn().mockRejectedValue(uniqueError),
      },
      notificationEvent: { create: jest.fn() },
    };
    const database = {
      notification: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(persisted),
      },
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const service = new NotificationsService(database as never);

    await expect(
      service.createApplicationNotification({
        userId: 'owner-1',
        applicationId: 'application-race-1',
        contributionRequestId: 'request-1',
        action: 'submitted',
      }),
    ).resolves.toMatchObject({
      notificationId: persisted.id,
      created: false,
      deliveredRealtime: false,
    });

    expect(transaction.notification.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(database.notification.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        deduplication_key: 'application:application-race-1:submitted',
      },
    });
    expect(transaction.notificationEvent.create).not.toHaveBeenCalled();
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
      aggregate_version: 1,
      created_at: new Date('2026-07-29T12:00:00.000Z'),
    };
    const database = { notification: { findUnique: jest.fn(), create: jest.fn() } };
    const transaction = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(notification),
      },
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-transaction-1' }),
      },
    };
    const realtime = { publishCreated: jest.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      database as never,
      undefined,
      undefined,
      realtime as never,
    );

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
    expect(transaction.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        notification_id: notification.id,
        user_id: notification.user_id,
        event_type: NotificationEventType.created,
        aggregate_version: 1,
      },
    });

    service.emitApplicationNotifications([result.notification]);
    expect(realtime.publishCreated).toHaveBeenCalledWith(
      result.notification.notificationId,
    );
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
      aggregate_version: 1,
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
      notificationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-proposal-1' }),
      },
    };
    const realtime = { publishCreated: jest.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      database as never,
      undefined,
      undefined,
      realtime as never,
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
    expect(transaction.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        notification_id: notification.id,
        user_id: notification.user_id,
        event_type: NotificationEventType.created,
        aggregate_version: 1,
      },
    });

    service.emitProposalNotifications([result.notification]);
    expect(realtime.publishCreated).toHaveBeenCalledWith(
      result.notification.notificationId,
    );
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
        aggregate_version: 1,
        created_at: createdAt,
      };
      const transaction = {
        notification: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(persisted),
        },
        notificationEvent: {
          create: jest.fn().mockResolvedValue({ id: `event-${action}` }),
        },
      };
      const database = {
        notification: transaction.notification,
        $transaction: jest.fn(
          async (callback: (value: typeof transaction) => unknown) =>
            callback(transaction),
        ),
      };
      const service = new NotificationsService(database as never);

      await expect(
        service.createApplicationNotification({
          userId: 'contributor-1',
          applicationId: 'application-1',
          contributionRequestId: 'request-1',
          action,
        }),
      ).resolves.toMatchObject({ created: true });

      const expectedDeepLink = [
        'submitted',
        'withdrawn',
        'owner_review_reminder',
      ].includes(action)
        ? '/contribution-requests/request-1'
        : '/applications/application-1';

      expect(transaction.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: `application.${action}`,
          template_version: 1,
          parameters: {
            applicationId: 'application-1',
            contributionRequestId: 'request-1',
          },
          deep_link: expectedDeepLink,
          priority: 'attention',
          deduplication_key: `application:application-1:${action}`,
        }),
      });
    },
  );

  it('rejects unsafe semantic identifiers before writing an Application notification', async () => {
    const database = {
      $transaction: jest.fn(),
    };
    const service = new NotificationsService(database as never);

    await expect(
      service.createApplicationNotification({
        userId: 'owner-1',
        applicationId: '../unsafe',
        contributionRequestId: 'request-1',
        action: 'submitted',
      }),
    ).rejects.toThrow('NOTIFICATION_PARAMETERS_INVALID');

    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('rejects incomplete skill parameters before writing a Notification', async () => {
    const database = {
      $transaction: jest.fn(),
    };
    const service = new NotificationsService(database as never);

    await expect(
      service.createSkillReviewNotification({
        userId: 'contributor-1',
        skillProfileId: 'skill-1',
        skillName: '   ',
        approved: true,
        activated: false,
      }),
    ).rejects.toThrow('NOTIFICATION_PARAMETERS_INVALID');

    expect(database.$transaction).not.toHaveBeenCalled();
  });

});
