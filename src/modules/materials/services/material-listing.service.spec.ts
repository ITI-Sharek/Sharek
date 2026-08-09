import { ProjectStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { MaterialListingService } from './material-listing.service';

describe('MaterialListingService', () => {
  const ownerId = '77777777-7777-4777-8777-777777777777';
  const contributorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const requestId = '44444444-4444-4444-8444-444444444444';

  const user = (id: string): AuthenticatedUser => ({
    id,
    email: 'someone@example.com',
    role: id === ownerId ? 'owner' : 'contributor',
    status: 'active',
  });

  const database = { material: { findMany: jest.fn() } };
  const projects = { getMaterialProjectContext: jest.fn() };
  const contributionTasks = { getMaterialAssignmentAccess: jest.fn() };
  const service = new MaterialListingService(
    database as never,
    projects as never,
    contributionTasks as never,
  );

  const whereOf = () => database.material.findMany.mock.calls[0][0].where;

  beforeEach(() => {
    jest.clearAllMocks();
    database.material.findMany.mockResolvedValue([]);
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

  it('filters in the query rather than after fetching everything', async () => {
    // A list that briefly holds Materials the caller cannot see is one
    // refactor away from returning them, and the count alone already leaks how
    // many private documents a Project holds.
    await service.listForProject(user(contributorId), projectId);

    expect(whereOf().AND).toContainEqual({ project_id: projectId });
    expect(whereOf().AND).toContainEqual({ deleted_at: null });
    expect(whereOf().AND).toContainEqual({ OR: [{ visibility: 'public' }] });
  });

  it('shows an owner their deleted Materials, so a deletion is visible', async () => {
    // Content is already gone. Hiding the record too makes a successful
    // deletion look like a failed request, with nothing to confirm it.
    await service.listForProject(user(ownerId), projectId);

    expect(whereOf()).toEqual({ project_id: projectId });
    expect(whereOf().deleted_at).toBeUndefined();
  });

  it('never shows a non-owner a deleted Material', async () => {
    await service.listForProject(user(contributorId), projectId);

    expect(whereOf().AND).toContainEqual({ deleted_at: null });
  });

  it('offers a non-assignee nothing beyond public Materials', async () => {
    await service.listForProject(user(contributorId), projectId);

    expect(whereOf().AND).toContainEqual({ OR: [{ visibility: 'public' }] });
  });

  it('adds restricted Materials only for a granted active assignee', async () => {
    contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
      projectId,
      activeProjectAssigneeIds: [contributorId],
      activeRequestAssigneeId: null,
    });

    await service.listForProject(user(contributorId), projectId);

    // The grant predicate travels with the visibility class: being an assignee
    // is not on its own a reason to see a restricted document.
    expect(whereOf().AND).toContainEqual({
      OR: [
      { visibility: 'public' },
      {
        visibility: 'restricted_project',
        grants: { some: { grantee_id: contributorId, revoked_at: null } },
      },
      ],
    });
  });

  it('adds assignment Materials only for the current Request assignee', async () => {
    contributionTasks.getMaterialAssignmentAccess.mockResolvedValue({
      projectId,
      activeProjectAssigneeIds: [contributorId],
      activeRequestAssigneeId: contributorId,
    });

    await service.listForContributionRequest(user(contributorId), requestId);

    expect(whereOf().AND).toContainEqual({
      OR: expect.arrayContaining([{ visibility: 'assignment' }]),
    });
  });

  it('hides public Materials on an unpublished Project', async () => {
    projects.getMaterialProjectContext.mockResolvedValue({
      id: projectId,
      ownerId,
      status: ProjectStatus.draft,
    });

    await service.listForProject(user(contributorId), projectId);

    // Nothing readable at all, so the query is never issued.
    expect(database.material.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty list without querying when nothing is readable', async () => {
    projects.getMaterialProjectContext.mockResolvedValue({
      id: projectId,
      ownerId,
      status: ProjectStatus.draft,
    });

    await expect(
      service.listForProject(user(contributorId), projectId),
    ).resolves.toEqual([]);
  });

  it('refuses a suspended account', async () => {
    await expect(
      service.listForProject(
        { ...user(contributorId), status: 'suspended' },
        projectId,
      ),
    ).rejects.toMatchObject({ code: 'MATERIAL_NOT_AUTHORIZED' });
  });

  it('resolves a Request listing through the owning module', async () => {
    await service.listForContributionRequest(user(contributorId), requestId);

    // Materials never reads ContributionRequest tables to find the Project.
    expect(contributionTasks.getMaterialAssignmentAccess).toHaveBeenCalledWith({
      projectId: null,
      contributionRequestId: requestId,
    });
    expect(whereOf().AND).toContainEqual({
      OR: [
        { project_id: projectId },
        { contribution_request_id: requestId },
      ],
    });
  });
});
