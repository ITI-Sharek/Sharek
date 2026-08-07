import { ProjectStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { MaterialAccessService } from './material-access.service';

describe('MaterialAccessService', () => {
  const ownerId = '77777777-7777-4777-8777-777777777777';
  const contributorId = '11111111-1111-4111-8111-111111111111';
  const strangerId = '22222222-2222-4222-8222-222222222222';
  const materialId = '55555555-5555-4555-8555-555555555555';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const requestId = '44444444-4444-4444-8444-444444444444';

  const user = (id: string): AuthenticatedUser => ({
    id,
    email: 'someone@example.com',
    role: id === ownerId ? 'owner' : 'contributor',
    status: 'active',
  });

  const materialRow = (overrides: Record<string, unknown> = {}) => ({
    id: materialId,
    owner_id: ownerId,
    visibility: 'public',
    project_id: projectId,
    contribution_request_id: null,
    deleted_at: null,
    ...overrides,
  });

  const database = {
    material: { findUnique: jest.fn() },
    materialVersion: { findUnique: jest.fn() },
    materialGrant: { findFirst: jest.fn() },
  };
  const projects = { getMaterialProjectContext: jest.fn() };
  const contributionTasks = { getMaterialAssignmentAccess: jest.fn() };
  const service = new MaterialAccessService(
    database as never,
    projects as never,
    contributionTasks as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    database.material.findUnique.mockResolvedValue(materialRow());
    database.materialGrant.findFirst.mockResolvedValue(null);
    projects.getMaterialProjectContext.mockResolvedValue({
      id: projectId,
      ownerId,
      status: ProjectStatus.published,
    });
    contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
      projectId,
      activeProjectAssigneeIds: [],
      activeRequestAssigneeId: null,
    });
  });

  const notFound = { code: 'MATERIAL_NOT_FOUND', statusCode: 404 };

  describe('public', () => {
    it('lets any active user on a published Project read it', async () => {
      await expect(
        service.requireReadAccess(user(strangerId), materialId),
      ).resolves.toMatchObject({ isOwner: false });
    });

    it('still means "within the Project", not "on the internet"', async () => {
      projects.getMaterialProjectContext.mockResolvedValue({
        id: projectId,
        ownerId,
        status: ProjectStatus.draft,
      });

      await expect(
        service.requireReadAccess(user(strangerId), materialId),
      ).rejects.toMatchObject(notFound);
    });
  });

  describe('restricted_project', () => {
    beforeEach(() => {
      database.material.findUnique.mockResolvedValue(
        materialRow({ visibility: 'restricted_project' }),
      );
    });

    it('requires a live grant held by a current active assignee', async () => {
      database.materialGrant.findFirst.mockResolvedValue({ id: 'grant-1' });
      contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
        projectId,
        activeProjectAssigneeIds: [contributorId],
        activeRequestAssigneeId: null,
      });

      await expect(
        service.requireReadAccess(user(contributorId), materialId),
      ).resolves.toMatchObject({ visibility: 'restricted_project' });
    });

    it('denies a grant whose holder no longer has a live Assignment', async () => {
      // Otherwise a grant issued once outlives every reason it was issued for,
      // and nobody remembers to revoke it.
      database.materialGrant.findFirst.mockResolvedValue({ id: 'grant-1' });
      contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
        projectId,
        activeProjectAssigneeIds: [],
        activeRequestAssigneeId: null,
      });

      await expect(
        service.requireReadAccess(user(contributorId), materialId),
      ).rejects.toMatchObject(notFound);
    });

    it('denies an assignee with no grant', async () => {
      contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
        projectId,
        activeProjectAssigneeIds: [contributorId],
        activeRequestAssigneeId: null,
      });

      await expect(
        service.requireReadAccess(user(contributorId), materialId),
      ).rejects.toMatchObject(notFound);
    });

    it('only consults live grants, so a revocation takes effect at once', async () => {
      await service
        .requireReadAccess(user(contributorId), materialId)
        .catch(() => undefined);

      expect(database.materialGrant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revoked_at: null }),
        }),
      );
    });
  });

  describe('assignment', () => {
    beforeEach(() => {
      database.material.findUnique.mockResolvedValue(
        materialRow({
          visibility: 'assignment',
          project_id: null,
          contribution_request_id: requestId,
        }),
      );
    });

    it('is owner-only until an Assignment exists', async () => {
      await expect(
        service.requireReadAccess(user(ownerId), materialId),
      ).resolves.toMatchObject({ isOwner: true });
      await expect(
        service.requireReadAccess(user(contributorId), materialId),
      ).rejects.toMatchObject(notFound);
    });

    it('opens to the assignee once the Request is assigned', async () => {
      contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
        projectId,
        activeProjectAssigneeIds: [contributorId],
        activeRequestAssigneeId: contributorId,
      });

      await expect(
        service.requireReadAccess(user(contributorId), materialId),
      ).resolves.toMatchObject({ visibility: 'assignment' });
    });

    it('closes again when the Request reaches a terminal state', async () => {
      // getMaterialAssignmentAccess reports no active assignee once the
      // Request is completed, cancelled, or discarded.
      contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
        projectId,
        activeProjectAssigneeIds: [],
        activeRequestAssigneeId: null,
      });

      await expect(
        service.requireReadAccess(user(contributorId), materialId),
      ).rejects.toMatchObject(notFound);
    });
  });

  it('hides a deleted Material from everyone, including its owner', async () => {
    database.material.findUnique.mockResolvedValue(
      materialRow({ deleted_at: new Date() }),
    );

    await expect(
      service.requireReadAccess(user(ownerId), materialId),
    ).rejects.toMatchObject(notFound);
  });

  it('reports a denial as absence rather than as a refusal', async () => {
    // "Exists but is not for you" confirms that a named Project holds a
    // document by that title, which is most of what an attacker wanted.
    database.material.findUnique.mockResolvedValue(
      materialRow({ visibility: 'restricted_project' }),
    );

    const denied = await service
      .requireReadAccess(user(strangerId), materialId)
      .catch((error) => error);
    const missing = await service
      .requireReadAccess(user(strangerId), 'no-such-material')
      .catch((error) => error);

    database.material.findUnique.mockResolvedValue(null);
    expect(denied.code).toBe(missing.code);
    expect(denied.statusCode).toBe(missing.statusCode);
  });

  it('refuses a suspended reader who would otherwise qualify', async () => {
    await expect(
      service.requireReadAccess(
        { ...user(strangerId), status: 'suspended' },
        materialId,
      ),
    ).rejects.toMatchObject(notFound);
  });

  describe('downloadable versions', () => {
    it('serves only a version that reached ready', async () => {
      database.materialVersion.findUnique.mockResolvedValue({
        storage_key: 'key',
        mime_type: 'application/pdf',
        original_filename: 'brief.pdf',
        scan_status: 'ready',
        purged_at: null,
      });

      await expect(
        service.requireDownloadableVersion(materialId, 1),
      ).resolves.toEqual({
        storageKey: 'key',
        mimeType: 'application/pdf',
        originalFilename: 'brief.pdf',
      });
    });

    it.each(['quarantined', 'scanning', 'rejected'])(
      'refuses a %s version',
      async (status) => {
        // Not "anything but rejected": quarantined covers both a pending scan
        // and one abandoned after repeated failure, and neither ever produced
        // a clean verdict.
        database.materialVersion.findUnique.mockResolvedValue({
          storage_key: 'key',
          mime_type: 'application/pdf',
          original_filename: 'brief.pdf',
          scan_status: status,
          purged_at: null,
        });

        await expect(
          service.requireDownloadableVersion(materialId, 1),
        ).rejects.toMatchObject({ code: 'MATERIAL_VERSION_NOT_DOWNLOADABLE' });
      },
    );

    it('refuses a purged version even though it once was ready', async () => {
      database.materialVersion.findUnique.mockResolvedValue({
        storage_key: 'key',
        mime_type: 'application/pdf',
        original_filename: 'brief.pdf',
        scan_status: 'ready',
        purged_at: new Date(),
      });

      await expect(
        service.requireDownloadableVersion(materialId, 1),
      ).rejects.toMatchObject({ code: 'MATERIAL_VERSION_NOT_FOUND' });
    });
  });
});
