import { Readable } from 'node:stream';
import { ChatAttachmentScanStatus } from '@prisma/client';

import { CHAT_ATTACHMENT_INFECTED_ERROR_CODE } from '../chat-attachment.constants';
import { ChatAttachmentScanProcessorService } from './chat-attachment-scan-processor.service';

describe('ChatAttachmentScanProcessorService', () => {
  const attachmentId = '66666666-6666-4666-8666-666666666666';
  const conversationId = '55555555-5555-4555-8555-555555555555';
  const uploaderId = '11111111-1111-4111-8111-111111111111';
  const messageId = '77777777-7777-4777-8777-777777777777';

  const attachmentRow = (overrides: Record<string, unknown> = {}) => ({
    storage_key: `chat-attachments/${conversationId}/${attachmentId}/object`,
    content_hash: 'a'.repeat(64),
    mime_type: 'application/pdf',
    scan_status: ChatAttachmentScanStatus.quarantined,
    purged_at: null,
    ...overrides,
  });

  /** Row shape `RETURNING` produces from the raw terminal-claim UPDATE. */
  const terminalClaimRow = (overrides: Record<string, unknown> = {}) => ({
    message_id: null,
    conversation_id: conversationId,
    uploaded_by: uploaderId,
    original_filename: 'brief.pdf',
    event_version: 0,
    ...overrides,
  });

  // Fake `Prisma.TransactionClient` handed to the `$transaction` callback.
  const transaction = {
    $queryRaw: jest.fn(),
    chatAttachmentEvent: { create: jest.fn() },
  };
  const database = {
    chatAttachment: { findUnique: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const storage = { getStream: jest.fn() };
  const scanner = { scan: jest.fn() };
  const notifications = { createChatAttachmentBlockedNotification: jest.fn() };
  const service = new ChatAttachmentScanProcessorService(
    database as never,
    storage as never,
    scanner as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    database.chatAttachment.findUnique.mockResolvedValue(attachmentRow());
    database.chatAttachment.updateMany.mockResolvedValue({ count: 1 });
    database.$transaction.mockImplementation(
      async (callback: (t: typeof transaction) => unknown) => callback(transaction),
    );
    transaction.$queryRaw.mockResolvedValue([terminalClaimRow()]);
    storage.getStream.mockResolvedValue(Readable.from([Buffer.from('%PDF-1.7')]));
    scanner.scan.mockResolvedValue({ verdict: 'clean' });
    notifications.createChatAttachmentBlockedNotification.mockResolvedValue({
      created: true,
      notificationId: 'notification-1',
    });
  });

  it('claims quarantined -> scanning before scanning, then commits ready through the terminal claim', async () => {
    const result = await service.process(attachmentId, 1);

    expect(result).toEqual({ outcome: 'ready' });
    expect(database.chatAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: attachmentId, scan_status: ChatAttachmentScanStatus.quarantined },
      data: { scan_status: ChatAttachmentScanStatus.scanning, scan_attempts: 1 },
    });
    expect(scanner.scan).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: 'chat_attachment', id: attachmentId },
        mimeType: 'application/pdf',
        contentHash: 'a'.repeat(64),
      }),
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not start a scan when another actor already claimed the opening transition', async () => {
    // count: 0 means a duplicate delivery, or the reaper, got there first.
    database.chatAttachment.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.process(attachmentId, 1);

    expect(result).toEqual({ outcome: 'superseded', reason: 'claim_lost' });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('releases the attachment back to quarantined and rethrows when the scanner cannot answer', async () => {
    const scanError = new Error('scanner unreachable');
    scanner.scan.mockRejectedValue(scanError);

    await expect(service.process(attachmentId, 1)).rejects.toBe(scanError);

    // Released, not left `scanning` -- otherwise a BullMQ retry finds the row
    // already claimed and treats itself as superseded, stranding it until the
    // reaper notices a fault the retry could have fixed seconds later.
    expect(database.chatAttachment.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: attachmentId, scan_status: ChatAttachmentScanStatus.scanning },
      data: { scan_status: ChatAttachmentScanStatus.quarantined },
    });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an EICAR-flavored infected verdict with the infected error code and notifies the uploader', async () => {
    scanner.scan.mockResolvedValue({ verdict: 'infected', signature: 'EICAR-Test-File' });
    transaction.$queryRaw.mockResolvedValue([
      terminalClaimRow({ message_id: messageId, event_version: 4 }),
    ]);

    const result = await service.process(attachmentId, 1);

    expect(result).toEqual({ outcome: 'rejected' });
    const [sql] = transaction.$queryRaw.mock.calls[0] as [{ values: unknown[] }];
    expect(sql.values).toEqual(
      expect.arrayContaining([
        ChatAttachmentScanStatus.rejected,
        CHAT_ATTACHMENT_INFECTED_ERROR_CODE,
      ]),
    );
    expect(notifications.createChatAttachmentBlockedNotification).toHaveBeenCalledWith({
      userId: uploaderId,
      conversationId,
      attachmentId,
      filename: 'brief.pdf',
    });
  });

  it('does not write the outbox event when the attachment is not yet bound at the instant the terminal claim commits', async () => {
    // A scan that finishes before binding is the common case: it records
    // state and emits nothing, because there is no recipient to tell yet.
    transaction.$queryRaw.mockResolvedValue([
      terminalClaimRow({ message_id: null, event_version: 0 }),
    ]);

    await service.process(attachmentId, 1);

    expect(transaction.chatAttachmentEvent.create).not.toHaveBeenCalled();
  });

  it('writes the outbox event with the returned event_version when the attachment is already bound', async () => {
    transaction.$queryRaw.mockResolvedValue([
      terminalClaimRow({ message_id: messageId, event_version: 3 }),
    ]);

    await service.process(attachmentId, 1);

    expect(transaction.chatAttachmentEvent.create).toHaveBeenCalledWith({
      data: {
        attachment_id: attachmentId,
        conversation_id: conversationId,
        event_type: 'scan_state_changed',
        scan_status: ChatAttachmentScanStatus.ready,
        aggregate_version: 3,
      },
    });
  });

  it('discards the verdict when another actor resolved the attachment mid-scan', async () => {
    // RETURNING matched no row: the reaper or a duplicate delivery beat this
    // verdict to a terminal state.
    transaction.$queryRaw.mockResolvedValue([]);

    const result = await service.process(attachmentId, 1);

    expect(result).toEqual({ outcome: 'superseded', reason: 'claim_lost' });
    expect(transaction.chatAttachmentEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ scan_status: ChatAttachmentScanStatus.ready }, 'status_ready'],
    [{ scan_status: ChatAttachmentScanStatus.rejected }, 'status_rejected'],
    [{ scan_status: ChatAttachmentScanStatus.scanning }, 'status_scanning'],
    [{ purged_at: new Date() }, 'purged'],
  ])('refuses to rescan an attachment that is %j', async (overrides, reason) => {
    database.chatAttachment.findUnique.mockResolvedValue(attachmentRow(overrides));

    const result = await service.process(attachmentId, 1);

    expect(result).toEqual({ outcome: 'superseded', reason });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(database.chatAttachment.updateMany).not.toHaveBeenCalled();
  });

  it('treats a missing attachment as nothing to do rather than an error', async () => {
    // The job can outlive the row when a purge runs first; throwing here
    // would retry a scan of something that no longer exists.
    database.chatAttachment.findUnique.mockResolvedValue(null);

    const result = await service.process(attachmentId, 1);

    expect(result).toEqual({ outcome: 'superseded', reason: 'missing' });
  });
});
