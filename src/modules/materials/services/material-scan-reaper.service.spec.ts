import { MaterialScanReaperService } from './material-scan-reaper.service';

describe('MaterialScanReaperService', () => {
  const materialId = '55555555-5555-4555-8555-555555555555';
  const now = new Date('2026-08-07T12:00:00.000Z');

  const database = {
    $transaction: jest.fn(),
    materialVersion: { findMany: jest.fn(), updateMany: jest.fn() },
    materialAudit: { count: jest.fn(), create: jest.fn() },
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) => fallback),
  };
  const queue = { enqueueScan: jest.fn() };
  const service = new MaterialScanReaperService(
    database as never,
    config as never,
    queue as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback: unknown) => fallback);
    database.$transaction.mockImplementation(
      (callback: (t: typeof database) => unknown) => callback(database),
    );
    database.materialVersion.findMany.mockResolvedValue([
      { material_id: materialId, version: 1 },
    ]);
    database.materialVersion.updateMany.mockResolvedValue({ count: 1 });
    database.materialAudit.count.mockResolvedValue(1);
    queue.enqueueScan.mockResolvedValue(undefined);
  });

  it('sweeps on updated_at, so a version touched seconds ago is left alone', async () => {
    await service.reapStale(now);

    const where = database.materialVersion.findMany.mock.calls[0][0].where;
    // requested_at-style predicates reap work that restarted moments earlier;
    // updated_at moves with every claim and release, which is the real signal.
    expect(where.updated_at.lte).toEqual(
      new Date(now.getTime() - 600_000),
    );
  });

  it('sweeps both stranded shapes and skips versions already abandoned', async () => {
    await service.reapStale(now);

    const where = database.materialVersion.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { scan_status: 'scanning' },
      { scan_status: 'quarantined', scan_error_code: null },
    ]);
    // Without the error-code exclusion the sweep would pick abandoned versions
    // up on every cycle, forever.
    expect(where.purged_at).toBeNull();
    expect(where.material).toEqual({ deleted_at: null });
  });

  it('releases a stranded scan back to quarantined and re-queues it', async () => {
    const result = await service.reapStale(now);

    expect(result).toEqual({ requeued: 1, abandoned: 0, skipped: 0 });
    expect(database.materialVersion.updateMany).toHaveBeenCalledWith({
      where: {
        material_id: materialId,
        version: 1,
        scan_status: { in: ['quarantined', 'scanning'] },
      },
      data: { scan_status: 'quarantined', scan_error_code: null },
    });
    // attempts + 1, so the job id differs from the one that was lost -- BullMQ
    // ignores `add` for an id it still holds.
    expect(queue.enqueueScan).toHaveBeenCalledWith({
      materialId,
      version: 1,
      attemptNumber: 2,
    });
  });

  it('gives up after the configured attempts without calling it malware', async () => {
    database.materialAudit.count.mockResolvedValue(3);

    const result = await service.reapStale(now);

    expect(result).toEqual({ requeued: 0, abandoned: 1, skipped: 0 });
    // quarantined, not rejected. It was never cleared so it stays
    // undownloadable, but telling the owner their file is malware when we
    // simply failed to check it would be a different and false claim.
    expect(database.materialVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          scan_status: 'quarantined',
          scan_error_code: 'MATERIAL_SCAN_ABANDONED',
        },
      }),
    );
    expect(database.materialAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'scan_abandoned',
          metadata: expect.objectContaining({ attempts: 3 }),
        }),
      }),
    );
    expect(queue.enqueueScan).not.toHaveBeenCalled();
  });

  it('counts attempts from scan_started audits rather than a counter', async () => {
    await service.reapStale(now);

    expect(database.materialAudit.count).toHaveBeenCalledWith({
      where: {
        material_id: materialId,
        material_version: 1,
        // Written in the same transaction as the claim that starts an attempt,
        // so the count cannot drift from what actually ran.
        action: 'scan_started',
      },
    });
  });

  it('does not drag a version back out of a verdict it just received', async () => {
    // The claim matches nothing because a processor committed `ready` between
    // the sweep query and this update.
    database.materialVersion.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.reapStale(now);

    expect(result).toEqual({ requeued: 0, abandoned: 0, skipped: 1 });
    expect(queue.enqueueScan).not.toHaveBeenCalled();
  });

  it('claims before enqueueing, so a lost race never queues a scan', async () => {
    const order: string[] = [];
    database.materialVersion.updateMany.mockImplementation(async () => {
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
    database.materialVersion.findMany.mockResolvedValue([
      { material_id: materialId, version: 1 },
      { material_id: materialId, version: 2 },
    ]);
    database.materialAudit.count
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockResolvedValue(1);

    const result = await service.reapStale(now);

    // One bad candidate must not strand the other 99 in a full batch.
    expect(result).toEqual({ requeued: 1, abandoned: 0, skipped: 1 });
  });

  it('honours a configured attempt ceiling', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'MATERIAL_SCAN_MAX_ATTEMPTS' ? 1 : fallback,
    );
    database.materialAudit.count.mockResolvedValue(1);

    const result = await service.reapStale(now);

    expect(result.abandoned).toBe(1);
  });
});
