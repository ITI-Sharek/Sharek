import { Readable } from 'node:stream';

import { MaterialScanProcessorService } from './material-scan-processor.service';

describe('MaterialScanProcessorService', () => {
  const materialId = '55555555-5555-4555-8555-555555555555';
  const version = 2;

  const versionRow = (overrides: Record<string, unknown> = {}) => ({
    storage_key: `${materialId}/object`,
    content_hash: 'a'.repeat(64),
    mime_type: 'application/pdf',
    scan_status: 'quarantined',
    purged_at: null,
    material: { deleted_at: null },
    ...overrides,
  });

  const database = {
    $transaction: jest.fn(),
    materialVersion: { findUnique: jest.fn(), updateMany: jest.fn() },
    materialAudit: { create: jest.fn() },
  };
  const storage = { getStream: jest.fn() };
  const scanner = { scan: jest.fn() };
  const service = new MaterialScanProcessorService(
    database as never,
    storage as never,
    scanner as never,
  );

  /** Every transition the processor makes, in order, as (from -> to). */
  const transitions = () =>
    database.materialVersion.updateMany.mock.calls.map(
      (call) =>
        `${(call[0] as never as { where: { scan_status: string } }).where.scan_status ?? 'any'} -> ${
          (call[0] as never as { data: { scan_status: string } }).data.scan_status
        }`,
    );

  const auditActions = () =>
    database.materialAudit.create.mock.calls.map(
      (call) => (call[0] as never as { data: { action: string } }).data.action,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    database.$transaction.mockImplementation(
      (callback: (t: typeof database) => unknown) => callback(database),
    );
    database.materialVersion.findUnique.mockResolvedValue(versionRow());
    database.materialVersion.updateMany.mockResolvedValue({ count: 1 });
    storage.getStream.mockResolvedValue(Readable.from([Buffer.from('%PDF-1.7')]));
    scanner.scan.mockResolvedValue({ verdict: 'clean' });
  });

  it('walks quarantined -> scanning -> ready for a clean file', async () => {
    const result = await service.process(materialId, version, 1);

    expect(result).toEqual({ outcome: 'ready' });
    // The intermediate `scanning` state is the point: it is what tells a reaper
    // that a worker took this version and never came back.
    expect(transitions()).toEqual([
      'quarantined -> scanning',
      'scanning -> ready',
    ]);
    expect(auditActions()).toEqual(['scan_started', 'scan_cleared']);
  });

  it('walks quarantined -> scanning -> rejected and records the signature', async () => {
    scanner.scan.mockResolvedValue({
      verdict: 'infected',
      signature: 'EICAR-Test-File',
    });

    const result = await service.process(materialId, version, 1);

    expect(result).toEqual({ outcome: 'rejected' });
    expect(transitions()).toEqual([
      'quarantined -> scanning',
      'scanning -> rejected',
    ]);
    const rejection = database.materialVersion.updateMany.mock.calls[1][0] as never as {
      data: { scan_error_code: string };
    };
    expect(rejection.data.scan_error_code).toBe('MATERIAL_SCAN_INFECTED');
    expect(database.materialAudit.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'scan_rejected',
          metadata: expect.objectContaining({ signature: 'EICAR-Test-File' }),
        }),
      }),
    );
  });

  it('never marks a version ready when the scanner cannot answer', async () => {
    // The whole point of the port: an unreachable scanner must not be
    // indistinguishable from one that said "clean".
    scanner.scan.mockRejectedValue(new Error('scanner unreachable'));

    await expect(service.process(materialId, version, 1)).rejects.toThrow(
      'scanner unreachable',
    );

    expect(transitions()).toEqual([
      'quarantined -> scanning',
      // Released, not resolved, so the BullMQ retry has something to claim.
      'scanning -> quarantined',
    ]);
    expect(auditActions()).toEqual(['scan_started']);
  });

  it('releases the version before rethrowing when storage cannot be read', async () => {
    storage.getStream.mockRejectedValue(new Error('ENOENT'));

    await expect(service.process(materialId, version, 1)).rejects.toThrow('ENOENT');

    expect(transitions()).toEqual([
      'quarantined -> scanning',
      'scanning -> quarantined',
    ]);
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('discards a verdict when another actor resolved the version mid-scan', async () => {
    // The claim to `scanning` succeeds, then the reaper finishes the row while
    // the scan is running, so the second claim matches nothing.
    database.materialVersion.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await service.process(materialId, version, 1);

    expect(result).toEqual({ outcome: 'superseded', reason: 'claim_lost' });
    // No audit for a transition that did not happen.
    expect(auditActions()).toEqual(['scan_started']);
  });

  it('does not start when a duplicate delivery lost the opening claim', async () => {
    database.materialVersion.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.process(materialId, version, 1);

    expect(result).toEqual({ outcome: 'superseded', reason: 'claim_lost' });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(database.materialAudit.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ scan_status: 'ready' }, 'status_ready'],
    [{ scan_status: 'rejected' }, 'status_rejected'],
    [{ scan_status: 'scanning' }, 'status_scanning'],
    [{ purged_at: new Date() }, 'purged'],
    [{ material: { deleted_at: new Date() } }, 'deleted'],
  ])('refuses to rescan a version that is %j', async (overrides, reason) => {
    database.materialVersion.findUnique.mockResolvedValue(versionRow(overrides));

    const result = await service.process(materialId, version, 1);

    expect(result).toEqual({ outcome: 'superseded', reason });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(database.materialVersion.updateMany).not.toHaveBeenCalled();
  });

  it('treats a missing version as nothing to do rather than an error', async () => {
    // The job outlives the row when a purge runs first; throwing here would
    // retry a scan of something that no longer exists three times over.
    database.materialVersion.findUnique.mockResolvedValue(null);

    const result = await service.process(materialId, version, 1);

    expect(result).toEqual({ outcome: 'superseded', reason: 'missing' });
  });

  it('attributes the verdict to no actor', async () => {
    await service.process(materialId, version, 1);

    // A machine verdict recorded against the uploader would make the audit
    // trail claim a person decided something they never saw.
    for (const call of database.materialAudit.create.mock.calls) {
      expect((call[0] as never as { data: { actor_id: null } }).data.actor_id).toBeNull();
    }
  });

  it('stamps scanned_at only on a terminal verdict', async () => {
    await service.process(materialId, version, 1);

    const [start, finish] = database.materialVersion.updateMany.mock.calls.map(
      (call) => (call[0] as never as { data: { scanned_at: Date | null } }).data.scanned_at,
    );
    expect(start).toBeNull();
    expect(finish).toBeInstanceOf(Date);
  });
});
