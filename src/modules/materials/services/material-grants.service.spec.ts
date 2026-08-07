import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { MaterialGrantsService } from './material-grants.service';

describe('MaterialGrantsService', () => {
  const owner: AuthenticatedUser = {
    id: '77777777-7777-4777-8777-777777777777',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };
  const granteeId = '11111111-1111-4111-8111-111111111111';
  const materialId = '55555555-5555-4555-8555-555555555555';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const requestId = '44444444-4444-4444-8444-444444444444';
  const idempotencyKey = '66666666-6666-4666-8666-666666666666';

  const materialRow = (overrides: Record<string, unknown> = {}) => ({
    id: materialId,
    owner_id: owner.id,
    visibility: 'restricted_project',
    project_id: projectId,
    contribution_request_id: null,
    deleted_at: null,
    ...overrides,
  });

  const database = {
    $transaction: jest.fn(),
    material: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    materialGrant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    materialAudit: { create: jest.fn() },
  };
  const contributionTasks = { getMaterialAssignmentAccess: jest.fn() };
  const service = new MaterialGrantsService(
    database as never,
    contributionTasks as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    database.$transaction.mockImplementation(
      (callback: (t: typeof database) => unknown) => callback(database),
    );
    database.material.findUnique.mockResolvedValue(materialRow());
    database.material.findUniqueOrThrow.mockResolvedValue({
      ...materialRow(),
      title: 'Project brief',
      current_version: 1,
      created_at: new Date(),
      updated_at: new Date(),
      versions: [],
    });
    database.material.updateMany.mockResolvedValue({ count: 1 });
    database.materialGrant.findFirst.mockResolvedValue(null);
    database.materialGrant.findMany.mockResolvedValue([]);
    database.materialGrant.updateMany.mockResolvedValue({ count: 1 });
    contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
      projectId,
      activeProjectAssigneeIds: [granteeId],
      activeRequestAssigneeId: null,
    });
  });

  const grant = () =>
    service.grant({ actor: owner, materialId, granteeId, idempotencyKey });

  it('grants a live assignee and records who granted it', async () => {
    await grant();

    expect(database.materialGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          material_id: materialId,
          grantee_id: granteeId,
          granted_by: owner.id,
        }),
      }),
    );
    expect(database.materialAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'grant_added' }),
      }),
    );
  });

  it('refuses a grant to someone with no live Assignment', async () => {
    // The access check ends when an Assignment does, so such a grant would
    // never work -- failing now says so instead of leaving dead configuration.
    contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
      projectId,
      activeProjectAssigneeIds: [],
      activeRequestAssigneeId: null,
    });

    await expect(grant()).rejects.toMatchObject({
      code: 'MATERIAL_GRANT_NOT_ASSIGNEE',
    });
    expect(database.materialGrant.create).not.toHaveBeenCalled();
  });

  it('refuses a second live grant to the same contributor', async () => {
    // Two live rows would survive a single revoke, so access would quietly
    // continue after the owner believed they had ended it.
    database.materialGrant.findFirst.mockResolvedValue({ id: 'grant-1' });

    await expect(grant()).rejects.toMatchObject({
      code: 'MATERIAL_GRANT_ALREADY_LIVE',
    });
  });

  it.each([['public'], ['assignment']])(
    'refuses grants on a %s Material',
    async (visibility) => {
      database.material.findUnique.mockResolvedValue(
        materialRow({
          visibility,
          contribution_request_id: visibility === 'assignment' ? requestId : null,
        }),
      );

      await expect(grant()).rejects.toMatchObject({
        code: 'MATERIAL_GRANT_NOT_APPLICABLE',
      });
    },
  );

  it('revokes by flipping the live row rather than deleting it', async () => {
    await service.revoke({ actor: owner, materialId, granteeId, idempotencyKey });

    expect(database.materialGrant.updateMany).toHaveBeenCalledWith({
      where: { material_id: materialId, grantee_id: granteeId, revoked_at: null },
      data: { revoked_at: expect.any(Date), revoked_by: owner.id },
    });
  });

  it('will not re-revoke, so the original end time survives', async () => {
    // Overwriting revoked_at would lose when access actually ended, which is
    // the one fact an investigation of a leak needs.
    database.materialGrant.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.revoke({ actor: owner, materialId, granteeId, idempotencyKey }),
    ).rejects.toMatchObject({ code: 'MATERIAL_GRANT_NOT_FOUND' });
  });

  it('keeps revoked grants in the listing', async () => {
    const revokedAt = new Date('2026-08-07T10:00:00.000Z');
    database.materialGrant.findMany.mockResolvedValue([
      {
        grantee_id: granteeId,
        granted_by: owner.id,
        granted_at: new Date('2026-08-01T10:00:00.000Z'),
        revoked_at: revokedAt,
        revoked_by: owner.id,
        grantee: {
          id: granteeId,
          username: 'nour',
          first_name: 'Nour',
          last_name: 'Hassan',
        },
      },
    ]);

    await expect(service.listGrants(owner, materialId)).resolves.toEqual([
      expect.objectContaining({ granteeId, revokedAt }),
    ]);
  });

  it('names the grantee rather than listing a bare identifier', async () => {
    // A UUID tells the owner nothing about who they handed a document to,
    // which is the one thing this list exists to say.
    database.materialGrant.findMany.mockResolvedValue([
      {
        grantee_id: granteeId,
        granted_by: owner.id,
        granted_at: new Date(),
        revoked_at: null,
        revoked_by: null,
        grantee: {
          id: granteeId,
          username: 'nour',
          first_name: 'Nour',
          last_name: 'Hassan',
        },
      },
    ]);

    await expect(service.listGrants(owner, materialId)).resolves.toEqual([
      expect.objectContaining({
        granteeName: 'Nour Hassan',
        granteeUsername: 'nour',
      }),
    ]);
  });

  it('reports a null username rather than inventing one', async () => {
    database.materialGrant.findMany.mockResolvedValue([
      {
        grantee_id: granteeId,
        granted_by: owner.id,
        granted_at: new Date(),
        revoked_at: null,
        revoked_by: null,
        grantee: {
          id: granteeId,
          username: null,
          first_name: 'Nour',
          last_name: 'Hassan',
        },
      },
    ]);

    await expect(service.listGrants(owner, materialId)).resolves.toEqual([
      expect.objectContaining({ granteeUsername: null, granteeName: 'Nour Hassan' }),
    ]);
  });

  it('changes visibility without destroying the grant list', async () => {
    // Moving to public and back is a plausible mistake; wiping grants on the
    // way through would make it unrecoverable.
    await service.changeVisibility({
      actor: owner,
      materialId,
      visibility: 'public',
      idempotencyKey,
    });

    expect(database.materialGrant.updateMany).not.toHaveBeenCalled();
    expect(database.materialAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'visibility_changed',
          metadata: expect.objectContaining({
            from: 'restricted_project',
            to: 'public',
          }),
        }),
      }),
    );
  });

  it('refuses assignment visibility on a Project Material', async () => {
    // A Project has no Assignment, so the class could never open the Material
    // to anyone but the owner. Accepting it would promise access it cannot give.
    await expect(
      service.changeVisibility({
        actor: owner,
        materialId,
        visibility: 'assignment',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_VISIBILITY_SCOPE_MISMATCH' });
  });

  it('guards the visibility write on the value it read', async () => {
    database.material.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.changeVisibility({
        actor: owner,
        materialId,
        visibility: 'public',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_VISIBILITY_CONFLICT' });
  });

  it('hides a Material owned by someone else behind a not-found', async () => {
    database.material.findUnique.mockResolvedValue(
      materialRow({ owner_id: 'another-owner' }),
    );

    await expect(grant()).rejects.toMatchObject({
      code: 'MATERIAL_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('requires a UUID v4 idempotency key', async () => {
    await expect(
      service.grant({
        actor: owner,
        materialId,
        granteeId,
        idempotencyKey: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_IDEMPOTENCY_KEY_REQUIRED' });
  });
});
