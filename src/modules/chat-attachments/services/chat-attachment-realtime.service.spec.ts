import { ChatAttachmentEventType, ChatAttachmentScanStatus } from '@prisma/client';

import { ChatAttachmentRealtimeService } from './chat-attachment-realtime.service';

describe('ChatAttachmentRealtimeService', () => {
  const occurredAt = new Date('2026-08-21T12:03:00.000Z');
  const attachmentId = '66666666-6666-4666-8666-666666666666';
  const conversationId = '55555555-5555-4555-8555-555555555555';
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const contributorId = '22222222-2222-4222-8222-222222222222';

  const event = {
    id: '88888888-8888-4888-8888-888888888888',
    attachment_id: attachmentId,
    conversation_id: conversationId,
    event_type: ChatAttachmentEventType.scan_state_changed,
    scan_status: ChatAttachmentScanStatus.ready,
    aggregate_version: 2,
    occurred_at: occurredAt,
    published_at: null,
    publish_attempts: 0,
    last_publish_error_code: null,
  };

  const attachmentRecord = (overrides: Record<string, unknown> = {}) => ({
    message_id: '77777777-7777-4777-8777-777777777777',
    original_filename: 'brief.pdf',
    byte_size: 1024,
    mime_type: 'application/pdf',
    caption: null,
    scan_status: ChatAttachmentScanStatus.ready,
    scan_error_code: null,
    conversation: {
      assignment: {
        contributor_id: contributorId,
        contributionRequest: { owner_id: ownerId },
      },
    },
    ...overrides,
  });

  function createService(deliveries: boolean[] = [true, true]) {
    const database = {
      chatAttachmentEvent: {
        findUnique: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue(event),
      },
      chatAttachment: {
        findUnique: jest.fn().mockResolvedValue(attachmentRecord()),
      },
    };
    const publisher = {
      isEnabled: jest.fn().mockReturnValue(true),
      publishToUser: jest
        .fn()
        .mockImplementation(() => deliveries.shift() ?? false),
    };
    const config = { get: jest.fn((key: string, fallback: unknown) => fallback) };
    return {
      service: new ChatAttachmentRealtimeService(
        database as never,
        publisher as never,
        config as never,
      ),
      database,
      publisher,
    };
  }

  it('publishes one scan_state_changed envelope keyed on the attachment, to both participants', async () => {
    const { service, database, publisher } = createService();

    await expect(service.publishEvent(event as never)).resolves.toBe('published');

    // Correctness-critical: the envelope's aggregate is the attachment, not
    // the conversation, so a client's per-attachment version guard has
    // something to compare against.
    expect(publisher.publishToUser).toHaveBeenNthCalledWith(
      1,
      ownerId,
      expect.objectContaining({
        eventId: event.id,
        type: 'attachment.scan_state_changed',
        aggregateId: attachmentId,
        aggregateVersion: 2,
      }),
    );
    expect(publisher.publishToUser).toHaveBeenNthCalledWith(
      2,
      contributorId,
      expect.objectContaining({ aggregateId: attachmentId }),
    );
    expect(database.chatAttachmentEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: {
        published_at: expect.any(Date) as Date,
        publish_attempts: { increment: 1 },
        last_publish_error_code: null,
      },
    });
  });

  it('returns `unbound` and never publishes when the attachment is not yet bound to a Message', async () => {
    // The single most important behaviour in this file: a recipient must
    // never learn about an attachment on a message that does not exist.
    const { service, database, publisher } = createService();
    database.chatAttachment.findUnique.mockResolvedValue(
      attachmentRecord({ message_id: null }),
    );

    await expect(service.publishEvent(event as never)).resolves.toBe('unbound');

    expect(publisher.publishToUser).not.toHaveBeenCalled();
    expect(database.chatAttachmentEvent.update).not.toHaveBeenCalled();
  });

  it('keeps the outbox pending when either participant handoff is unavailable', async () => {
    const { service, database } = createService([true, false]);

    await expect(service.publishEvent(event as never)).resolves.toBe('unavailable');

    expect(database.chatAttachmentEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: {
        publish_attempts: { increment: 1 },
        last_publish_error_code: 'REALTIME_UNAVAILABLE',
      },
    });
  });

  it('returns `not_found` when the attachment no longer exists', async () => {
    const { service, database, publisher } = createService();
    database.chatAttachment.findUnique.mockResolvedValue(null);

    await expect(service.publishEvent(event as never)).resolves.toBe('not_found');
    expect(publisher.publishToUser).not.toHaveBeenCalled();
  });

  it('does nothing when realtime publication is disabled', async () => {
    const { service, database, publisher } = createService();
    publisher.isEnabled.mockReturnValue(false);

    await expect(service.publishEvent(event as never)).resolves.toBe('disabled');
    expect(database.chatAttachment.findUnique).not.toHaveBeenCalled();
  });

  it('resolves the outbox event by id and publishes it', async () => {
    const { service, database } = createService();

    await expect(service.publishScanStateChanged(event.id)).resolves.toBe(true);
    expect(database.chatAttachmentEvent.findUnique).toHaveBeenCalledWith({
      where: { id: event.id },
    });
  });

  it('reports no publication for an event id that no longer exists', async () => {
    const { service, database } = createService();
    database.chatAttachmentEvent.findUnique.mockResolvedValue(null);

    await expect(service.publishScanStateChanged(event.id)).resolves.toBe(false);
  });
});
