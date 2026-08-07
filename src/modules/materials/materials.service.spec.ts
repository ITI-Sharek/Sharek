import { ProjectStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { MaterialsService } from './materials.service';

describe('MaterialsService', () => {
  const owner: AuthenticatedUser = {
    id: '77777777-7777-4777-8777-777777777777',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };
  const contributor: AuthenticatedUser = {
    ...owner,
    id: '11111111-1111-4111-8111-111111111111',
    role: 'contributor',
  };
  const projectId = '33333333-3333-4333-8333-333333333333';
  const requestId = '44444444-4444-4444-8444-444444444444';
  const materialId = '55555555-5555-4555-8555-555555555555';
  const idempotencyKey = '66666666-6666-4666-8666-666666666666';

  const pdf = (): Parameters<MaterialsService['addVersion']>[0]['file'] => ({
    buffer: Buffer.from('%PDF-1.7\nbrief'),
    mimetype: 'application/pdf',
    size: 14,
    originalname: 'brief.pdf',
  });

  const materialRow = (overrides: Record<string, unknown> = {}) => ({
    id: materialId,
    project_id: projectId,
    contribution_request_id: null,
    owner_id: owner.id,
    title: 'Project brief',
    visibility: 'public',
    current_version: 1,
    deleted_at: null,
    created_at: new Date('2026-08-07T09:00:00.000Z'),
    updated_at: new Date('2026-08-07T09:00:00.000Z'),
    versions: [
      {
        version: 1,
        scan_status: 'quarantined',
        byte_size: 14,
        mime_type: 'application/pdf',
        original_filename: 'brief.pdf',
        content_hash: 'a'.repeat(64),
        created_at: new Date('2026-08-07T09:00:00.000Z'),
        scanned_at: null,
        purged_at: null,
      },
    ],
    ...overrides,
  });

  const database = {
    $transaction: jest.fn(),
    material: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    materialVersion: { create: jest.fn() },
    materialGrant: { updateMany: jest.fn() },
    materialAudit: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) =>
      key === 'MATERIAL_ALLOWED_MIME_TYPES'
        ? 'application/pdf,text/plain'
        : fallback,
    ),
  };
  const projects = { getMaterialProjectContext: jest.fn() };
  const contributionTasks = { getOwnedRequest: jest.fn() };
  const storage = { put: jest.fn(), delete: jest.fn(), getStream: jest.fn() };
  const scanQueue = { enqueueScan: jest.fn() };
  const access = {
    requireReadAccess: jest.fn(),
    requireDownloadableVersion: jest.fn(),
  };
  const downloadTokens = { issue: jest.fn(), verify: jest.fn() };
  const purge = { purgeMaterial: jest.fn() };
  const service = new MaterialsService(
    database as never,
    config as never,
    projects as never,
    contributionTasks as never,
    storage as never,
    scanQueue as never,
    access as never,
    downloadTokens as never,
    purge as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'MATERIAL_ALLOWED_MIME_TYPES'
        ? 'application/pdf,text/plain'
        : fallback,
    );
    database.$transaction.mockImplementation(
      (callback: (t: typeof database) => unknown) => callback(database),
    );
    database.material.findUnique.mockResolvedValue(materialRow());
    database.material.findUniqueOrThrow.mockResolvedValue(materialRow());
    database.$queryRaw.mockResolvedValue([{ lockResult: '' }]);
    projects.getMaterialProjectContext.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: ProjectStatus.published,
    });
    contributionTasks.getOwnedRequest.mockResolvedValue({ id: requestId });
    storage.put.mockImplementation((storageKey: string, content: Buffer) =>
      Promise.resolve({
        storageKey,
        byteSize: content.byteLength,
        contentHash: 'a'.repeat(64),
      }),
    );
    storage.delete.mockResolvedValue(undefined);
    storage.getStream.mockResolvedValue(undefined);
    scanQueue.enqueueScan.mockResolvedValue(undefined);
    access.requireReadAccess.mockResolvedValue({
      materialId,
      ownerId: owner.id,
      visibility: 'public',
      projectId,
      contributionRequestId: null,
      isOwner: true,
    });
    access.requireDownloadableVersion.mockResolvedValue({
      storageKey: `${materialId}/object`,
      mimeType: 'application/pdf',
      originalFilename: 'brief.pdf',
    });
    downloadTokens.issue.mockReturnValue({
      token: 'body.signature',
      expiresAt: new Date('2026-08-07T12:05:00.000Z'),
    });
    downloadTokens.verify.mockReturnValue({
      materialId,
      version: 1,
      subjectId: owner.id,
      expiresAt: new Date('2026-08-07T12:05:00.000Z'),
    });
    purge.purgeMaterial.mockResolvedValue(1);
    database.material.updateMany.mockResolvedValue({ count: 1 });
    database.materialGrant.updateMany.mockResolvedValue({ count: 0 });
  });

  const create = () =>
    service.createForProject({
      actor: owner,
      projectId,
      title: 'Project brief',
      visibility: 'public',
      idempotencyKey,
      file: pdf(),
    });

  it('stores a first version as quarantined and records the upload', async () => {
    const result = await create();

    expect(result.currentVersion).toBe(1);
    // Never READY on upload: the download affordance keys on this, so a new
    // version must not be reachable before a scan clears it.
    expect(result.versions[0].scanStatus).toBe('QUARANTINED');
    expect(database.materialAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'uploaded',
          to_status: 'quarantined',
          idempotency_key: idempotencyKey,
        }),
      }),
    );
  });

  it('performs no extraction, embedding, or provider call on upload', async () => {
    // Upload is storage consent, not AI-processing consent. The service takes
    // no AI dependency at all, which is the strongest form this can take.
    await create();

    expect(Object.keys(service as unknown as Record<string, unknown>)).not.toContain('ai');
    expect(storage.put).toHaveBeenCalledTimes(1);
  });

  it('queues a scan for the version it just wrote', async () => {
    await create();

    expect(scanQueue.enqueueScan).toHaveBeenCalledWith({
      materialId: expect.any(String),
      version: 1,
      attemptNumber: 1,
    });
  });

  it('queues the scan only after the transaction commits', async () => {
    // Enqueueing inside the transaction lets a worker pick up a job for a row
    // that is not visible yet, and the worker reads that as "already gone".
    const order: string[] = [];
    database.$transaction.mockImplementation(
      async (callback: (t: typeof database) => unknown) => {
        const result = await callback(database);
        order.push('commit');
        return result;
      },
    );
    scanQueue.enqueueScan.mockImplementation(async () => {
      order.push('enqueue');
    });

    await create();

    expect(order).toEqual(['commit', 'enqueue']);
  });

  it('queues no scan for a version that was never written', async () => {
    database.$transaction.mockRejectedValue(new Error('deadlock detected'));

    await expect(create()).rejects.toThrow('deadlock');

    expect(scanQueue.enqueueScan).not.toHaveBeenCalled();
  });

  it('queues the scan against the appended version, not the first', async () => {
    database.material.findUniqueOrThrow
      .mockResolvedValueOnce({ current_version: 2 })
      .mockResolvedValueOnce(materialRow({ current_version: 3 }));

    await service.addVersion({
      actor: owner,
      materialId,
      idempotencyKey,
      file: pdf(),
    });

    // Scanning version 1 again would leave the version the owner just uploaded
    // quarantined forever while reporting success.
    expect(scanQueue.enqueueScan).toHaveBeenCalledWith({
      materialId,
      version: 3,
      attemptNumber: 1,
    });
  });

  it('appends a new version rather than editing the previous one', async () => {
    // First call reads the current version inside the lock; the second is the
    // projection built after the write.
    database.material.findUniqueOrThrow
      .mockResolvedValueOnce({ current_version: 2 })
      .mockResolvedValueOnce(materialRow({ current_version: 3 }));

    await service.addVersion({
      actor: owner,
      materialId,
      idempotencyKey,
      file: pdf(),
    });

    expect(database.materialVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 3 }) }),
    );
    expect(database.material.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { current_version: 3 } }),
    );
  });

  it('serialises concurrent appends so two uploads cannot claim one version', async () => {
    database.material.findUniqueOrThrow
      .mockResolvedValueOnce({ current_version: 1 })
      .mockResolvedValueOnce(materialRow({ current_version: 2 }));

    await service.addVersion({
      actor: owner,
      materialId,
      idempotencyKey,
      file: pdf(),
    });

    const lock = database.$queryRaw.mock.calls[0]?.[0] as { strings?: string[] };
    expect(lock.strings?.join('')).toContain('pg_advisory_xact_lock');
    // ::text because pg_advisory_xact_lock returns void, which Prisma cannot
    // deserialize through $queryRaw.
    expect(lock.strings?.join('')).toContain('::text');
  });

  it('rejects a file whose bytes disagree with its declared type', async () => {
    await expect(
      service.createForProject({
        actor: owner,
        projectId,
        title: 'Project brief',
        visibility: 'public',
        idempotencyKey,
        file: { ...pdf(), buffer: Buffer.from('MZ binary') },
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_CONTENT_MISMATCH' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('reports the configured limit with the rejection so clients need not guess', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'MATERIAL_MAX_BYTES'
        ? 8
        : key === 'MATERIAL_ALLOWED_MIME_TYPES'
          ? 'application/pdf'
          : fallback,
    );

    await expect(create()).rejects.toMatchObject({
      code: 'MATERIAL_TOO_LARGE',
      metadata: { maxBytes: 8 },
    });
  });

  it('removes orphaned bytes when the write transaction fails', async () => {
    database.$transaction.mockRejectedValue(new Error('deadlock detected'));

    await expect(create()).rejects.toThrow('deadlock');
    // Otherwise the object would linger with no row referencing it.
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it('refuses a caller who is not an active owner', async () => {
    await expect(
      service.createForProject({
        actor: contributor,
        projectId,
        title: 'Project brief',
        visibility: 'public',
        idempotencyKey,
        file: pdf(),
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_NOT_AUTHORIZED', statusCode: 403 });
  });

  it('does not reveal that a Project belongs to another owner', async () => {
    projects.getMaterialProjectContext.mockResolvedValue({
      id: projectId,
      ownerId: 'another-owner',
      status: ProjectStatus.published,
    });

    await expect(create()).rejects.toMatchObject({
      code: 'MATERIAL_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('reads Contribution Request ownership through the owning module', async () => {
    await service.createForContributionRequest({
      actor: owner,
      requestId,
      title: 'Request brief',
      visibility: 'assignment',
      idempotencyKey,
      file: pdf(),
    });

    expect(contributionTasks.getOwnedRequest).toHaveBeenCalledWith(owner, requestId);
    expect(database.material.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contribution_request_id: requestId }),
      }),
    );
  });

  it('requires a UUID v4 idempotency key', async () => {
    await expect(
      service.createForProject({
        actor: owner,
        projectId,
        title: 'Project brief',
        visibility: 'public',
        idempotencyKey: 'not-a-uuid',
        file: pdf(),
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('issues no download link for a version that could not be served', async () => {
    access.requireDownloadableVersion.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'MATERIAL_VERSION_NOT_DOWNLOADABLE' }),
    );

    await expect(
      service.issueDownloadToken({ actor: owner, materialId, version: 1 }),
    ).rejects.toMatchObject({ code: 'MATERIAL_VERSION_NOT_DOWNLOADABLE' });
    expect(downloadTokens.issue).not.toHaveBeenCalled();
  });

  it('re-checks access at redemption instead of trusting the token', async () => {
    // This is what makes a revocation bite against a link already in someone's
    // hands: the token proves what was asked for, never that it is still
    // allowed.
    access.requireReadAccess.mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'MATERIAL_NOT_FOUND' }),
    );

    await expect(service.openDownload(owner, 'body.signature')).rejects.toMatchObject(
      { code: 'MATERIAL_NOT_FOUND' },
    );
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('re-checks the version at redemption, so a purge closes an open link', async () => {
    access.requireDownloadableVersion.mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'MATERIAL_VERSION_NOT_FOUND' }),
    );

    await expect(service.openDownload(owner, 'body.signature')).rejects.toMatchObject(
      { code: 'MATERIAL_VERSION_NOT_FOUND' },
    );
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('refuses a link redeemed by someone other than its subject', async () => {
    // Otherwise a shared URL is a copy of the document, which the short expiry
    // alone does not prevent.
    await expect(
      service.openDownload(contributor, 'body.signature'),
    ).rejects.toMatchObject({
      code: 'MATERIAL_DOWNLOAD_TOKEN_SUBJECT_MISMATCH',
    });
    expect(access.requireReadAccess).not.toHaveBeenCalled();
  });

  it('revokes every live grant in the same transaction that deletes', async () => {
    await service.remove({ actor: owner, materialId, idempotencyKey });

    // Access must end atomically with the deletion; revoking afterwards would
    // leave a window in which the Material is deleted but still readable.
    expect(database.materialGrant.updateMany).toHaveBeenCalledWith({
      where: { material_id: materialId, revoked_at: null },
      data: { revoked_at: expect.any(Date), revoked_by: owner.id },
    });
    expect(database.materialAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'deleted' }),
      }),
    );
  });

  it('does not let a lagging purge report the deletion as failed', async () => {
    // The Material is already inaccessible. Failing here would tell the owner
    // their file is still readable when it is not.
    purge.purgeMaterial.mockResolvedValue(0);

    await expect(
      service.remove({ actor: owner, materialId, idempotencyKey }),
    ).resolves.toEqual({ materialId, purgedVersions: 0 });
  });

  it('lets only one of two concurrent deletes claim the deletion', async () => {
    database.material.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.remove({ actor: owner, materialId, idempotencyKey }),
    ).rejects.toMatchObject({ code: 'MATERIAL_ALREADY_DELETED' });
  });

  it('refuses assignment visibility on a Project Material at upload', async () => {
    await expect(
      service.createForProject({
        actor: owner,
        projectId,
        title: 'Project brief',
        visibility: 'assignment',
        idempotencyKey,
        file: pdf(),
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_VISIBILITY_SCOPE_MISMATCH' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('leaves the read decision to the access service rather than owner identity', async () => {
    // getForReader must not re-implement authorization: a grantee and an
    // assignee reach the same projection, and duplicating the rule here is how
    // the two copies drift.
    await service.getForReader(contributor, materialId);

    expect(access.requireReadAccess).toHaveBeenCalledWith(contributor, materialId);
  });
});
