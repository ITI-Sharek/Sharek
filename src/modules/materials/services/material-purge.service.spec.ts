import { MaterialPurgeService } from './material-purge.service';

describe('MaterialPurgeService', () => {
  const materialId = '55555555-5555-4555-8555-555555555555';
  const now = new Date('2026-08-07T12:00:00.000Z');

  const database = {
    $transaction: jest.fn(),
    materialVersion: { findMany: jest.fn(), updateMany: jest.fn() },
    materialAudit: { create: jest.fn() },
  };
  const storage = { delete: jest.fn() };
  const service = new MaterialPurgeService(database as never, storage as never);

  beforeEach(() => {
    jest.clearAllMocks();
    database.$transaction.mockImplementation(
      (callback: (t: typeof database) => unknown) => callback(database),
    );
    database.materialVersion.findMany.mockResolvedValue([
      { material_id: materialId, version: 1, storage_key: `${materialId}/one` },
    ]);
    database.materialVersion.updateMany.mockResolvedValue({ count: 1 });
    storage.delete.mockResolvedValue(undefined);
  });

  it('destroys bytes and stamps the version purged', async () => {
    const result = await service.purgePending(now);

    expect(result).toEqual({ purged: 1, skipped: 0 });
    expect(storage.delete).toHaveBeenCalledWith(`${materialId}/one`);
    expect(database.materialVersion.updateMany).toHaveBeenCalledWith({
      where: { material_id: materialId, version: 1, purged_at: null },
      data: { purged_at: now },
    });
  });

  it('deletes the object before stamping the row', async () => {
    // The reverse order strands content: a crash between the stamp and the
    // delete leaves a version marked purged whose bytes are still on disk,
    // and nothing ever looks at it again.
    const order: string[] = [];
    storage.delete.mockImplementation(async () => {
      order.push('storage');
    });
    database.materialVersion.updateMany.mockImplementation(async () => {
      order.push('row');
      return { count: 1 };
    });

    await service.purgePending(now);

    expect(order).toEqual(['storage', 'row']);
  });

  it('is a no-op the second time, so a retry after a partial failure is safe', async () => {
    // A concurrent sweep already stamped it. Purging twice must not be an
    // error, or nothing could ever safely retry a half-finished purge.
    database.materialVersion.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.purgePending(now);

    expect(result).toEqual({ purged: 0, skipped: 1 });
    expect(database.materialAudit.create).not.toHaveBeenCalled();
  });

  it('retains the audit trail it just wrote against', async () => {
    await service.purgePending(now);

    // Deletion removes content, not the record that content existed --
    // otherwise deleting a Material also deletes the evidence of who uploaded
    // it and who could read it.
    expect(database.materialAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'purged',
          material_version: 1,
          actor_id: null,
        }),
      }),
    );
  });

  it('sweeps only versions whose Material is deleted', async () => {
    await service.purgePending(now);

    expect(database.materialVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { purged_at: null, material: { deleted_at: { not: null } } },
      }),
    );
  });

  it('leaves a version retryable when storage fails', async () => {
    storage.delete.mockRejectedValue(new Error('EIO'));

    const result = await service.purgePending(now);

    expect(result).toEqual({ purged: 0, skipped: 1 });
    // purged_at stays NULL, so the next sweep tries again rather than leaving
    // a version that is neither downloadable nor purgeable.
    expect(database.materialVersion.updateMany).not.toHaveBeenCalled();
  });

  it('keeps sweeping after one version fails', async () => {
    database.materialVersion.findMany.mockResolvedValue([
      { material_id: materialId, version: 1, storage_key: 'one' },
      { material_id: materialId, version: 2, storage_key: 'two' },
    ]);
    storage.delete
      .mockRejectedValueOnce(new Error('EIO'))
      .mockResolvedValue(undefined);

    expect(await service.purgePending(now)).toEqual({ purged: 1, skipped: 1 });
  });

  it('never fails the deletion that triggered it', async () => {
    // The Material is already inaccessible; reporting the command as failed
    // because cleanup lagged would tell the owner their file is still readable.
    storage.delete.mockRejectedValue(new Error('EIO'));

    await expect(service.purgeMaterial(materialId, now)).resolves.toBe(0);
  });
});
