import { AssignmentConversationsService } from './assignment-conversations.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const CONTRIBUTOR_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const ASSIGNMENT_ID = '44444444-4444-4444-8444-444444444444';
const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';
const MESSAGE_EVENT_ID = '88888888-8888-4888-8888-888888888888';

const contributor = {
  id: CONTRIBUTOR_ID,
  email: 'contributor@example.com',
  role: 'contributor' as const,
  status: 'active' as const,
};

function conversationRecord() {
  return {
    id: CONVERSATION_ID,
    assignment_id: ASSIGNMENT_ID,
    status: 'active',
    aggregate_version: 1,
    created_at: new Date('2026-08-09T12:00:00.000Z'),
    updated_at: new Date('2026-08-09T12:00:00.000Z'),
    assignment: {
      contributor_id: CONTRIBUTOR_ID,
      contributionRequest: { owner_id: OWNER_ID },
    },
  };
}

describe('AssignmentConversationsService', () => {
  it('creates exactly one conversation for an Assignment and reuses it on retry', async () => {
    const conversation = conversationRecord();
    const transaction = {
      assignmentConversation: {
        upsert: jest.fn().mockResolvedValue(conversation),
      },
    };
    const service = new AssignmentConversationsService({} as never);

    await expect(
      service.ensureForAssignment({
        assignmentId: ASSIGNMENT_ID,
        transaction: transaction as never,
      }),
    ).resolves.toEqual({ conversationId: CONVERSATION_ID });
    await expect(
      service.ensureForAssignment({
        assignmentId: ASSIGNMENT_ID,
        transaction: transaction as never,
      }),
    ).resolves.toEqual({ conversationId: CONVERSATION_ID });

    expect(transaction.assignmentConversation.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.assignmentConversation.upsert).toHaveBeenNthCalledWith(1, {
      where: { assignment_id: ASSIGNMENT_ID },
      create: { assignment_id: ASSIGNMENT_ID },
      update: {},
      select: { id: true },
    });
  });

  it('allows only the Assignment owner and contributor to read conversation history', async () => {
    const database = {
      assignmentConversation: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: { assignment: { OR: Array<Record<string, unknown>> } } }) =>
          where.assignment.OR.some(
            (condition) =>
              condition.contributor_id === CONTRIBUTOR_ID ||
              (condition.contributionRequest as { owner_id?: string } | undefined)
                ?.owner_id === OWNER_ID,
          )
            ? conversationRecord()
            : null,
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AssignmentConversationsService(database as never);

    await expect(service.getForActor(OWNER_ID, CONVERSATION_ID)).resolves.toMatchObject({
      conversationId: CONVERSATION_ID,
      assignmentId: ASSIGNMENT_ID,
    });
    await expect(service.getForActor(CONTRIBUTOR_ID, CONVERSATION_ID)).resolves.toMatchObject({
      conversationId: CONVERSATION_ID,
    });
    await expect(service.getForActor(OTHER_ID, CONVERSATION_ID)).rejects.toMatchObject({
      code: 'ASSIGNMENT_CONVERSATION_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('returns participant and sender display names in authorized conversation data', async () => {
    const database = {
      assignmentConversation: {
        findFirst: jest.fn().mockResolvedValue({
          ...conversationRecord(),
          assignment: {
            contributor_id: CONTRIBUTOR_ID,
            contributor: { first_name: 'Con', last_name: 'Tribu' },
            contributionRequest: {
              owner_id: OWNER_ID,
              owner: { first_name: 'Own', last_name: 'Er' },
            },
          },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: MESSAGE_ID,
            conversation_id: CONVERSATION_ID,
            sequence: 1,
            sender_id: CONTRIBUTOR_ID,
            body: 'Hello owner',
            reply_to_message_id: null,
            created_at: new Date('2026-08-09T12:03:00.000Z'),
            edited_at: null,
            retracted_at: null,
            sender: { first_name: 'Con', last_name: 'Tribu' },
          },
        ]),
      },
    };
    const service = new AssignmentConversationsService(database as never);

    await expect(service.getForActor(OWNER_ID, CONVERSATION_ID)).resolves.toMatchObject({
      ownerName: 'Own Er',
      contributorName: 'Con Tribu',
    });
    await expect(
      service.listMessages(OWNER_ID, CONVERSATION_ID),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ senderName: 'Con Tribu' })],
    });
  });

  it('lists ordered messages and returns an opaque next cursor', async () => {
    const database = {
      assignmentConversation: {
        findFirst: jest.fn().mockResolvedValue(conversationRecord()),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: MESSAGE_ID,
            conversation_id: CONVERSATION_ID,
            sequence: 2,
            sender_id: CONTRIBUTOR_ID,
            body: 'Second',
            reply_to_message_id: null,
            created_at: new Date('2026-08-09T12:02:00.000Z'),
            edited_at: null,
            retracted_at: null,
            sender: { id: CONTRIBUTOR_ID, first_name: 'Con', last_name: 'Tribu' },
          },
          {
            id: '77777777-7777-4777-8777-777777777777',
            conversation_id: CONVERSATION_ID,
            sequence: 1,
            sender_id: OWNER_ID,
            body: 'First',
            reply_to_message_id: null,
            created_at: new Date('2026-08-09T12:01:00.000Z'),
            edited_at: null,
            retracted_at: null,
            sender: { id: OWNER_ID, first_name: 'Own', last_name: 'Er' },
          },
        ]),
      },
    };
    const service = new AssignmentConversationsService(database as never);

    await expect(
      service.listMessages(CONTRIBUTOR_ID, CONVERSATION_ID, { limit: 1 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ messageId: MESSAGE_ID, sequence: 2 })],
      nextCursor: expect.any(String),
    });
    expect(database.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ sequence: 'desc' }, { id: 'desc' }], take: 2 }),
    );
  });

  it('rejects empty and overlong message bodies before persistence', async () => {
    const database = {
      assignmentConversation: {
        findFirst: jest.fn().mockResolvedValue(conversationRecord()),
      },
      message: { findMany: jest.fn(), create: jest.fn() },
    };
    const service = new AssignmentConversationsService(database as never);

    await expect(
      service.sendMessage({
        actor: contributor,
        conversationId: CONVERSATION_ID,
        body: '   ',
        idempotencyKey: 'message-empty-1',
      }),
    ).rejects.toMatchObject({ code: 'MESSAGE_BODY_REQUIRED' });
    await expect(
      service.sendMessage({
        actor: contributor,
        conversationId: CONVERSATION_ID,
        body: 'a'.repeat(4001),
        idempotencyKey: 'message-long-1',
      }),
    ).rejects.toMatchObject({ code: 'MESSAGE_TOO_LONG' });
    expect(database.message.create).not.toHaveBeenCalled();
  });

  it('returns the original message for an idempotent retry', async () => {
    const message = {
      id: MESSAGE_ID,
      conversation_id: CONVERSATION_ID,
      sequence: 1,
      sender_id: CONTRIBUTOR_ID,
      body: 'Hello owner',
      reply_to_message_id: null,
      created_at: new Date('2026-08-09T12:03:00.000Z'),
      edited_at: null,
      retracted_at: null,
      sender: { id: CONTRIBUTOR_ID, first_name: 'Con', last_name: 'Tribu' },
    };
    const transaction = {
      assignmentConversation: {
        findFirst: jest.fn().mockResolvedValue(conversationRecord()),
        update: jest.fn(),
      },
      message: {
        findUnique: jest.fn().mockResolvedValue(message),
        create: jest.fn(),
      },
    };
    const database = {
      ...transaction,
      $transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new AssignmentConversationsService(database as never);

    await expect(
      service.sendMessage({
        actor: contributor,
        conversationId: CONVERSATION_ID,
        body: 'Hello owner',
        idempotencyKey: 'message-retry-1',
      }),
    ).resolves.toMatchObject({ messageId: MESSAGE_ID, sequence: 1 });
    expect(transaction.message.create).not.toHaveBeenCalled();
  });

  it('commits one durable created event before publishing a new Message to both participants', async () => {
    let committed = false;
    const message = {
      id: MESSAGE_ID,
      conversation_id: CONVERSATION_ID,
      sequence: 1,
      sender_id: CONTRIBUTOR_ID,
      body: 'Hello owner',
      reply_to_message_id: null,
      created_at: new Date('2026-08-09T12:03:00.000Z'),
      edited_at: null,
      retracted_at: null,
    };
    const transaction = {
      assignmentConversation: {
        findFirst: jest.fn().mockResolvedValue(conversationRecord()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      message: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(message),
      },
      messageEvent: {
        create: jest.fn().mockResolvedValue({ id: MESSAGE_EVENT_ID }),
      },
    };
    const database = {
      ...transaction,
      $transaction: jest.fn(async (callback: (value: unknown) => unknown) => {
        const result = await callback(transaction);
        committed = true;
        return result;
      }),
    };
    const realtime = {
      publishCreated: jest.fn().mockImplementation(async () => {
        expect(committed).toBe(true);
        return true;
      }),
    };
    const service = new AssignmentConversationsService(
      database as never,
      realtime as never,
    );

    await expect(
      service.sendMessage({
        actor: contributor,
        conversationId: CONVERSATION_ID,
        body: 'Hello owner',
        idempotencyKey: 'message-create-1',
      }),
    ).resolves.toMatchObject({ messageId: MESSAGE_ID, sequence: 1 });

    expect(transaction.messageEvent.create).toHaveBeenCalledWith({
      data: {
        message_id: MESSAGE_ID,
        conversation_id: CONVERSATION_ID,
        event_type: 'created',
        aggregate_version: 1,
      },
      select: { id: true },
    });
    expect(realtime.publishCreated).toHaveBeenCalledWith(MESSAGE_EVENT_ID);
  });

  it('creates the recipient notification in the same transaction and publishes it only after commit', async () => {
    let committed = false;
    const message = {
      id: MESSAGE_ID,
      conversation_id: CONVERSATION_ID,
      sequence: 1,
      sender_id: CONTRIBUTOR_ID,
      body: 'Hello owner',
      reply_to_message_id: null,
      created_at: new Date('2026-08-09T12:03:00.000Z'),
      edited_at: null,
      retracted_at: null,
    };
    const transaction = {
      assignmentConversation: {
        findFirst: jest.fn().mockResolvedValue(conversationRecord()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      message: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(message),
      },
      messageEvent: {
        create: jest.fn().mockResolvedValue({ id: MESSAGE_EVENT_ID }),
      },
    };
    const database = {
      ...transaction,
      $transaction: jest.fn(async (callback: (value: unknown) => unknown) => {
        const result = await callback(transaction);
        committed = true;
        return result;
      }),
    };
    const realtime = { publishCreated: jest.fn().mockResolvedValue(true) };
    const notifications = {
      createConversationActivityNotification: jest.fn().mockImplementation(
        async (_input: unknown, options: { transaction: unknown }) => {
          expect(options.transaction).toBe(transaction);
          expect(committed).toBe(false);
          return { created: true, notificationId: 'notification-1' };
        },
      ),
      emitNotificationCreated: jest.fn().mockImplementation(async () => {
        expect(committed).toBe(true);
        return true;
      }),
    };
    const service = new AssignmentConversationsService(
      database as never,
      realtime as never,
      notifications as never,
    );

    await service.sendMessage({
      actor: contributor,
      conversationId: CONVERSATION_ID,
      body: 'Hello owner',
      idempotencyKey: 'message-notification-1',
    });

    expect(notifications.createConversationActivityNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      }),
      { transaction, emitRealtime: false },
    );
    expect(notifications.emitNotificationCreated).toHaveBeenCalledWith(
      'notification-1',
    );
  });
});
