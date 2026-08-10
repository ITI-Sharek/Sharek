import { MessageEventType } from '@prisma/client';

import { AssignmentConversationRealtimeService } from './assignment-conversation-realtime.service';

describe('AssignmentConversationRealtimeService', () => {
  const occurredAt = new Date('2026-08-09T12:03:00.000Z');
  const event = {
    id: '88888888-8888-4888-8888-888888888888',
    message_id: '66666666-6666-4666-8666-666666666666',
    conversation_id: '55555555-5555-4555-8555-555555555555',
    event_type: MessageEventType.created,
    aggregate_version: 2,
    occurred_at: occurredAt,
    published_at: null,
    publish_attempts: 0,
    last_publish_error_code: null,
    message: {
      id: '66666666-6666-4666-8666-666666666666',
      conversation_id: '55555555-5555-4555-8555-555555555555',
      sequence: 2,
      sender_id: '22222222-2222-4222-8222-222222222222',
      sender: { first_name: 'Con', last_name: 'Tribu' },
      body: 'Committed message',
      reply_to_message_id: null,
      idempotency_key: 'message-create-1',
      created_at: occurredAt,
      edited_at: null,
      retracted_at: null,
    },
    conversation: {
      assignment: {
        contributor_id: '22222222-2222-4222-8222-222222222222',
        contributionRequest: {
          owner_id: '11111111-1111-4111-8111-111111111111',
        },
      },
    },
  };

  function createService(deliveries: boolean[] = [true, true]) {
    const database = {
      messageEvent: {
        findUnique: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue(event),
      },
    };
    const publisher = {
      isEnabled: jest.fn().mockReturnValue(true),
      publishToUser: jest
        .fn()
        .mockImplementation(() => deliveries.shift() ?? false),
    };
    return {
      service: new AssignmentConversationRealtimeService(
        database as never,
        publisher as never,
      ),
      database,
      publisher,
    };
  }

  it('publishes one stable created envelope to both authorized participants', async () => {
    const { service, database, publisher } = createService();

    await expect(service.publishCreated(event.id)).resolves.toBe(true);

    expect(publisher.publishToUser).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        eventId: event.id,
        type: 'conversation.message.created',
        version: 1,
        occurredAt: occurredAt.toISOString(),
        aggregateId: event.conversation_id,
        aggregateVersion: 2,
        payload: {
          message: expect.objectContaining({
            messageId: event.message.id,
            conversationId: event.conversation_id,
            sequence: 2,
            senderName: 'Con Tribu',
          }) as object,
        },
      }),
    );
    expect(publisher.publishToUser).toHaveBeenNthCalledWith(
      2,
      '22222222-2222-4222-8222-222222222222',
      expect.objectContaining({ eventId: event.id }),
    );
    expect(database.messageEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: {
        published_at: expect.any(Date) as Date,
        publish_attempts: { increment: 1 },
        last_publish_error_code: null,
      },
    });
  });

  it('keeps the outbox pending when either participant handoff is unavailable', async () => {
    const { service, database } = createService([true, false]);

    await expect(service.publishCreated(event.id)).resolves.toBe(false);

    expect(database.messageEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: {
        publish_attempts: { increment: 1 },
        last_publish_error_code: 'REALTIME_UNAVAILABLE',
      },
    });
  });
});
