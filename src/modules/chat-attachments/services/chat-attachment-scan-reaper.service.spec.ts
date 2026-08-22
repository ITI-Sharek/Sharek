import { CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE } from '../chat-attachment.constants';
import { ChatAttachmentScanReaperService } from './chat-attachment-scan-reaper.service';

describe('ChatAttachmentScanReaperService', () => {
  const attachmentId = '66666666-6666-4666-8666-666666666666';
  const now = new Date('2026-08-21T12:00:00.000Z');

  const database = {
    chatAttachment: { findMany: jest.fn(), updateMany: jest.fn() },
  };
  const config = { get: jest.fn((key: string, fallback: unknown) => fallback) };
  const queue = { enqueueScan: jest.fn() };
  const service = new ChatAttachmentScanReaperService(
    database as never,
    config as never,
    queue as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback: unknown) => fallback);
    database.chatAttachment.findMany.mockResolvedValue([
      { id: attachmentId, scan_attempts: 0 },
    ]);
    database.chatAttachment.updateMany.mockResolvedValue({ count: 1 });
    queue.enqueueScan.mockResolvedValue(undefined);
  });

  it('sweeps on updated_at, so an attachment touched seconds ago is left alone', async () => {
    await service.reapStale(now);

    const where = database.chatAttachment.findMany.mock.calls[0][0].where;
    expect(where.updated_at.lte).toEqual(new Date(now.getTime() - 600_000));
  });

  it('sweeps both stranded shapes and excludes already-abandoned attachments', async () => {
    await service.reapStale(now);

    const where = database.chatAttachment.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { scan_status: 'scanning' },
      { scan_status: 'quarantined', scan_error_code: null },
    ]);
    // Without the error-code exclusion the sweep would pick abandoned
    // attachments up on every cycle, forever.
    expect(where.purged_at).toBeNull();
  });

  it('re-queues a stranded attachment below the attempt limit', async () => {
    const result = await service.reapStale(now);

    expect(result).toEqual({ requeued: 1, abandoned: 0, skipped: 0 });
    expect(database.chatAttachment.updateMany).toHaveBeenCalledWith({
      where: {
        id: attachmentId,
        scan_status: { in: ['quarantined', 'scanning'] },
      },
      data: { scan_status: 'quarantined', scan_error_code: null },
    });
    // attempts + 1, so the job id differs from the one that was lost --
    // BullMQ ignores `add` for an id it still holds.
    expect(queue.enqueueScan).toHaveBeenCalledWith({
      attachmentId,
      attemptNumber: 1,
    });
  });

  it('abandons -- quarantined, never rejected -- once the attempt limit is reached', async () => {
    database.chatAttachment.findMany.mockResolvedValue([
      { id: attachmentId, scan_attempts: 3 },
    ]);

    const result = await service.reapStale(now);

    expect(result).toEqual({ requeued: 0, abandoned: 1, skipped: 0 });
    // "Scan unavailable" must never be presented as a malware claim, so the
    // terminal state here can never be `rejected`.
    expect(database.chatAttachment.updateMany).toHaveBeenCalledWith({
      where: {
        id: attachmentId,
        scan_status: { in: ['quarantined', 'scanning'] },
      },
      data: {
        scan_status: 'quarantined',
        scan_error_code: CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE,
      },
    });
    expect(queue.enqueueScan).not.toHaveBeenCalled();
  });

  it('does not drag an attachment back out of a verdict it just received', async () => {
    // A processor committed a verdict between the sweep query and this claim.
    database.chatAttachment.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.reapStale(now);

    expect(result).toEqual({ requeued: 0, abandoned: 0, skipped: 1 });
    expect(queue.enqueueScan).not.toHaveBeenCalled();
  });

  it('does not double-count when the abandon claim is lost to a concurrent verdict', async () => {
    database.chatAttachment.findMany.mockResolvedValue([
      { id: attachmentId, scan_attempts: 3 },
    ]);
    database.chatAttachment.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.reapStale(now);

    expect(result).toEqual({ requeued: 0, abandoned: 0, skipped: 1 });
  });

  it('claims before enqueueing, so a lost race never queues a scan', async () => {
    const order: string[] = [];
    database.chatAttachment.updateMany.mockImplementation(async () => {
      order.push('claim');
      return { count: 1 };
    });
    queue.enqueueScan.mockImplementation(async () => {
      order.push('enqueue');
    });

    await service.reapStale(now);

    expect(order).toEqual(['claim', 'enqueue']);
  });

  it('keeps sweeping after one candidate fails', async () => {
    database.chatAttachment.findMany.mockResolvedValue([
      { id: attachmentId, scan_attempts: 0 },
      { id: 'other-attachment-id', scan_attempts: 0 },
    ]);
    database.chatAttachment.updateMany
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockResolvedValue({ count: 1 });

    const result = await service.reapStale(now);

    // One bad candidate must not strand the rest of a full batch.
    expect(result).toEqual({ requeued: 1, abandoned: 0, skipped: 1 });
  });

  it('honours a configured attempt ceiling', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'CHAT_ATTACHMENT_SCAN_MAX_ATTEMPTS' ? 1 : fallback,
    );
    database.chatAttachment.findMany.mockResolvedValue([
      { id: attachmentId, scan_attempts: 1 },
    ]);

    const result = await service.reapStale(now);

    expect(result.abandoned).toBe(1);
  });
});
