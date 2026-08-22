import { ChatAttachmentPurgeService } from './chat-attachment-purge.service';

describe('ChatAttachmentPurgeService', () => {
  const attachmentId = '66666666-6666-4666-8666-666666666666';
  const now = new Date('2026-08-21T12:00:00.000Z');

  const database = {
    chatAttachment: { findMany: jest.fn(), updateMany: jest.fn() },
  };
  const storage = { delete: jest.fn() };
  const config = { get: jest.fn((key: string, fallback: unknown) => fallback) };
  const service = new ChatAttachmentPurgeService(
    database as never,
    storage as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback: unknown) => fallback);
    // First sweep (expired unbound intents) returns one candidate; second
    // sweep (12-month terminal retention) returns none, by default.
    database.chatAttachment.findMany
      .mockResolvedValueOnce([
        { id: attachmentId, storage_key: `chat-attachments/${attachmentId}/object` },
      ])
      .mockResolvedValueOnce([]);
    database.chatAttachment.updateMany.mockResolvedValue({ count: 1 });
    storage.delete.mockResolvedValue(undefined);
  });

  it('destroys bytes and stamps the attachment purged', async () => {
    const result = await service.purgePending(now);

    expect(result).toEqual({ purged: 1, skipped: 0 });
    expect(storage.delete).toHaveBeenCalledWith(`chat-attachments/${attachmentId}/object`);
    expect(database.chatAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: attachmentId, purged_at: null },
      data: { purged_at: now },
    });
  });

  it('deletes the object before stamping the row', async () => {
    // The reverse order strands content: a crash between the stamp and the
    // delete leaves a row marked purged whose bytes are still in the bucket,
    // and nothing ever revisits it.
    const order: string[] = [];
    storage.delete.mockImplementation(async () => {
      order.push('storage');
    });
    database.chatAttachment.updateMany.mockImplementation(async () => {
      order.push('row');
      return { count: 1 };
    });

    await service.purgePending(now);

    expect(order).toEqual(['storage', 'row']);
  });

  it('is a no-op the second time, so a retry after a partial failure is safe', async () => {
    // A concurrent sweep already stamped it. Purging twice must not be an
    // error, or nothing could ever safely retry a half-finished purge.
    database.chatAttachment.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.purgePending(now);

    expect(result).toEqual({ purged: 0, skipped: 1 });
  });

  it('sweeps expired unbound intents by message_id and expires_at', async () => {
    await service.purgePending(now);

    expect(database.chatAttachment.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { message_id: null, expires_at: { lte: now }, purged_at: null },
      }),
    );
  });

  it("sweeps 12-month terminal retention against the conversation's read_only_at", async () => {
    await service.purgePending(now);

    const retentionCutoff = new Date(now);
    retentionCutoff.setMonth(retentionCutoff.getMonth() - 12);
    expect(database.chatAttachment.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          purged_at: null,
          conversation: { read_only_at: { lte: retentionCutoff } },
        },
      }),
    );
  });

  it('honours a configured retention window', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'CHAT_ATTACHMENT_RETENTION_MONTHS' ? 6 : fallback,
    );

    await service.purgePending(now);

    const retentionCutoff = new Date(now);
    retentionCutoff.setMonth(retentionCutoff.getMonth() - 6);
    expect(database.chatAttachment.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          conversation: { read_only_at: { lte: retentionCutoff } },
        }) as object,
      }),
    );
  });

  it('leaves an attachment retryable when storage fails', async () => {
    storage.delete.mockRejectedValue(new Error('EIO'));

    const result = await service.purgePending(now);

    expect(result).toEqual({ purged: 0, skipped: 1 });
    // purged_at stays NULL, so the next sweep tries again rather than
    // leaving a row that is neither downloadable nor purgeable.
    expect(database.chatAttachment.updateMany).not.toHaveBeenCalled();
  });

  it('keeps sweeping after one attachment fails', async () => {
    database.chatAttachment.findMany.mockReset();
    database.chatAttachment.findMany
      .mockResolvedValueOnce([
        { id: attachmentId, storage_key: 'one' },
        { id: 'other-attachment-id', storage_key: 'two' },
      ])
      .mockResolvedValueOnce([]);
    storage.delete.mockRejectedValueOnce(new Error('EIO')).mockResolvedValue(undefined);

    expect(await service.purgePending(now)).toEqual({ purged: 1, skipped: 1 });
  });
});
