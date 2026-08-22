import { ChatAttachmentScanStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE } from '../chat-attachment.constants';
import { ChatAttachmentDownloadService } from './chat-attachment-download.service';

describe('ChatAttachmentDownloadService', () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '55555555-5555-4555-8555-555555555555';
  const attachmentId = '66666666-6666-4666-8666-666666666666';
  const storageKey = `chat-attachments/${conversationId}/${attachmentId}/object`;

  const actor: AuthenticatedUser = {
    id: actorId,
    email: 'contributor@example.com',
    role: 'contributor',
    status: 'active',
  };

  const attachmentRow = (overrides: Record<string, unknown> = {}) => ({
    storage_key: storageKey,
    mime_type: 'application/pdf',
    original_filename: 'brief report.pdf',
    scan_status: ChatAttachmentScanStatus.ready,
    scan_error_code: null,
    purged_at: null,
    message_id: '77777777-7777-4777-8777-777777777777',
    ...overrides,
  });

  const database = { chatAttachment: { findFirst: jest.fn() } };
  const config = { get: jest.fn((key: string, fallback: unknown) => fallback) };
  const conversations = { getParticipation: jest.fn() };
  const storage = { createPresignedGetUrl: jest.fn() };
  const service = new ChatAttachmentDownloadService(
    database as never,
    config as never,
    conversations as never,
    storage as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback: unknown) => fallback);
    conversations.getParticipation.mockResolvedValue({
      conversationId,
      assignmentId: 'assignment-1',
      status: 'active',
      ownerId: 'owner-1',
      contributorId: actorId,
      peerId: 'owner-1',
      aggregateVersion: 1,
    });
    database.chatAttachment.findFirst.mockResolvedValue(attachmentRow());
    storage.createPresignedGetUrl.mockResolvedValue({
      url: 'https://example-bucket.s3.amazonaws.com/signed',
      expiresAt: new Date('2026-08-21T12:01:00.000Z'),
    });
  });

  const download = () => service.createDownloadUrl({ actor, conversationId, attachmentId });

  it('mints a presigned URL against the sniffed mime type, served as an attachment', async () => {
    const result = await download();

    expect(result.disposition).toBe('attachment');
    expect(storage.createPresignedGetUrl).toHaveBeenCalledWith(storageKey, {
      expiresInSeconds: 60,
      responseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent('brief report.pdf')}`,
      // From the sniffed mime stored on the row, never a value the sender
      // could steer -- so the bucket origin can never be made to serve a
      // payload as `text/html`.
      responseContentType: 'application/pdf',
    });
  });

  it('serves an image inline rather than as an attachment', async () => {
    database.chatAttachment.findFirst.mockResolvedValue(
      attachmentRow({ mime_type: 'image/png', original_filename: 'photo.png' }),
    );

    const result = await download();

    expect(result.disposition).toBe('inline');
    const [, options] = storage.createPresignedGetUrl.mock.calls[0] as [
      string,
      { responseContentDisposition: string },
    ];
    expect(options.responseContentDisposition).toBe(
      `inline; filename*=UTF-8''${encodeURIComponent('photo.png')}`,
    );
  });

  it.each([
    [ChatAttachmentScanStatus.quarantined, null, 'CHAT_ATTACHMENT_SCAN_PENDING'],
    [ChatAttachmentScanStatus.scanning, null, 'CHAT_ATTACHMENT_SCAN_PENDING'],
    [ChatAttachmentScanStatus.rejected, null, 'CHAT_ATTACHMENT_BLOCKED'],
    [
      ChatAttachmentScanStatus.quarantined,
      CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE,
      'CHAT_ATTACHMENT_SCAN_UNAVAILABLE',
    ],
  ])(
    'maps scan_status=%s / scan_error_code=%s to %s',
    async (scanStatus, scanErrorCode, code) => {
      database.chatAttachment.findFirst.mockResolvedValue(
        attachmentRow({ scan_status: scanStatus, scan_error_code: scanErrorCode }),
      );

      await expect(download()).rejects.toMatchObject({ code });
      expect(storage.createPresignedGetUrl).not.toHaveBeenCalled();
    },
  );

  it('resolves a foreign or never-existed attachment id to CHAT_ATTACHMENT_NOT_FOUND', async () => {
    // The lookup is already scoped to `conversation_id`, so an id from
    // another conversation reads the same as an id that never existed --
    // covered by the same `findFirst` returning null.
    database.chatAttachment.findFirst.mockResolvedValue(null);

    await expect(download()).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENT_NOT_FOUND',
      message: 'Attachment was not found',
      statusCode: 404,
    });
  });

  it('resolves an unbound upload intent to the exact same CHAT_ATTACHMENT_NOT_FOUND', async () => {
    database.chatAttachment.findFirst.mockResolvedValue(
      attachmentRow({ message_id: null }),
    );

    await expect(download()).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENT_NOT_FOUND',
      message: 'Attachment was not found',
      statusCode: 404,
    });
  });

  it('resolves a purged attachment to the exact same CHAT_ATTACHMENT_NOT_FOUND', async () => {
    database.chatAttachment.findFirst.mockResolvedValue(
      attachmentRow({ purged_at: new Date('2026-08-20T00:00:00.000Z') }),
    );

    await expect(download()).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENT_NOT_FOUND',
      message: 'Attachment was not found',
      statusCode: 404,
    });
  });

  it('scopes the lookup to the conversation the caller asked about', async () => {
    await download();

    expect(database.chatAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: attachmentId, conversation_id: conversationId },
      }),
    );
  });

  it('refuses a caller whose account is not active', async () => {
    await expect(
      service.createDownloadUrl({
        actor: { ...actor, status: 'suspended' },
        conversationId,
        attachmentId,
      }),
    ).rejects.toMatchObject({ code: 'CHAT_ATTACHMENT_ACCOUNT_NOT_ACTIVE', statusCode: 403 });
    expect(database.chatAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('never leaks the configured bucket name through a thrown error', async () => {
    // This service never even reads the bucket config -- that lives in the
    // module's storage provider factory -- but this guards against a future
    // debug message doing so by accident, the same non-leak discipline
    // `S3ObjectStorage.mapError` documents for the adapter itself.
    const bucketName = 'sharek-chat-attachments-uploads';
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'S3_CHAT_ATTACHMENTS_BUCKET' ? bucketName : fallback,
    );
    database.chatAttachment.findFirst.mockResolvedValue(null);

    const error = (await download().catch((caught: unknown) => caught)) as Error & {
      code?: string;
    };

    expect(error.message).not.toContain(bucketName);
    expect(error.code ?? '').not.toContain(bucketName);
    expect(error.stack ?? '').not.toContain(bucketName);
  });
});
