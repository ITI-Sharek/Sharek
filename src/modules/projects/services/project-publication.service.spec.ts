import { ProjectCategory, ProjectDifficulty, ProjectStatus } from '@prisma/client';

import { ProjectPublicationService } from './project-publication.service';

describe('ProjectPublicationService', () => {
  const database = {
    project: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    projectOperation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    projectStateTransition: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const gitHubEvidence = {
    getProjectImportSnapshot: jest.fn(),
    verifySelectedRepositoryControl: jest.fn(),
  };
  const identity = { getGitHubIdentityForUser: jest.fn() };
  const service = new ProjectPublicationService(
    database as never,
    gitHubEvidence as never,
    identity as never,
  );
  const actor = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    role: 'owner' as const,
    status: 'active' as const,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (action: (transaction: typeof database) => unknown) => action(database),
    );
    database.projectOperation.findUnique.mockResolvedValue(null);
    database.projectOperation.create.mockResolvedValue({ id: 'operation-id' });
    database.projectOperation.update.mockResolvedValue({});
    database.project.updateMany.mockResolvedValue({ count: 1 });
    database.project.findUniqueOrThrow.mockResolvedValue(project());
    gitHubEvidence.getProjectImportSnapshot.mockResolvedValue(snapshot());
    gitHubEvidence.verifySelectedRepositoryControl.mockResolvedValue(false);
    identity.getGitHubIdentityForUser.mockResolvedValue({
      providerAccountId: '42',
      username: 'owner',
    });
  });

  it('previews allowlisted metadata without writing a project', async () => {
    const result = await service.preview(actor, 'owner/repo');

    expect(result).toMatchObject({
      source: {
        repositoryId: '123',
        fullName: 'owner/repo',
        visibility: 'public',
      },
      ownerDefaults: { title: 'repo' },
    });
    expect(result.previewFingerprint).toHaveLength(64);
    expect(database.project.create).not.toHaveBeenCalled();
  });

  it('creates only a private draft after a matching preview', async () => {
    const preview = await service.preview(actor, 'owner/repo');
    database.project.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve(project({ ...data })),
    );

    const result = await service.createDraft(
      actor,
      {
        source: {
          provider: 'github',
          repositoryReference: 'owner/repo',
          previewFingerprint: preview.previewFingerprint,
        },
        project: {
          title: 'Reviewed project',
          category: ProjectCategory.web,
          difficulty: ProjectDifficulty.intermediate,
        },
      },
      'create-12345678',
    );

    expect(database.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner_id: actor.id,
        status: ProjectStatus.draft,
        published_at: null,
        revision: 1,
      }),
    });
    expect(result.status).toBe(ProjectStatus.draft);
  });

  it('returns an indistinguishable not-found response for a non-owner', async () => {
    database.project.findFirst.mockResolvedValue(null);

    await expect(service.getOwnerProject(actor, 'private-id')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('withholds a private snapshot and returns safe recovery status after access loss', async () => {
    database.project.findFirst.mockResolvedValue(
      project({ source_visibility: 'private' }),
    );
    gitHubEvidence.verifySelectedRepositoryControl.mockResolvedValue(false);

    await expect(service.getOwnerProject(actor, 'project-id')).resolves.toMatchObject({
      source: {
        latestSnapshot: null,
        status: {
          authorizationStatus: 'authorization_required',
          selectionStatus: 'unselected',
          unavailableAreas: [],
          recoveryAction: 'reconnect_or_select_repository',
        },
      },
    });
  });

  it('rejects incomplete publication without changing the draft', async () => {
    database.project.findFirst.mockResolvedValue(
      project({ category: null, difficulty: null }),
    );

    await expect(
      service.publish(
        actor,
        'project-id',
        { expectedRevision: 1, confirm: true },
        'publish-12345678',
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_PUBLICATION_INCOMPLETE' });
    expect(database.project.update).not.toHaveBeenCalled();
  });

  it('uses an atomic revision predicate so concurrent owner edits cannot overwrite', async () => {
    database.project.findFirst
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce({ revision: 2 });
    database.project.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.updateProject(
        actor,
        'project-id',
        { expectedRevision: 1, title: 'Concurrent title' },
        'update-12345678',
      ),
    ).rejects.toMatchObject({
      code: 'PROJECT_REVISION_CONFLICT',
      metadata: { currentRevision: 2 },
    });
  });

  it('publishes once after live personal-repository control verification', async () => {
    database.project.findFirst
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(null);
    database.project.findUniqueOrThrow.mockResolvedValue(
      project({ status: ProjectStatus.published, revision: 2, published_at: new Date() }),
    );
    database.projectStateTransition.create.mockResolvedValue({ id: 'transition-id' });

    const result = await service.publish(
      actor,
      'project-id',
      { expectedRevision: 1, confirm: true },
      'publish-12345678',
    );

    expect(identity.getGitHubIdentityForUser).toHaveBeenCalledWith(actor.id);
    expect(database.projectStateTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_status: ProjectStatus.draft,
        to_status: ProjectStatus.published,
        actor_id: actor.id,
      }),
    });
    expect(result).toMatchObject({
      status: ProjectStatus.published,
      revision: 2,
      transitionId: 'transition-id',
    });
  });

  it('does not treat a mutable matching username as personal repository control', async () => {
    database.project.findFirst.mockResolvedValueOnce(project());
    identity.getGitHubIdentityForUser.mockResolvedValue({
      providerAccountId: 'different-provider-id',
      username: 'owner',
    });

    await expect(
      service.publish(
        actor,
        'project-id',
        { expectedRevision: 1, confirm: true },
        'publish-12345678',
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_REPOSITORY_CONTROL_REQUIRED' });
    expect(gitHubEvidence.verifySelectedRepositoryControl).toHaveBeenCalledWith(
      actor.id,
      '123',
    );
    expect(database.project.updateMany).not.toHaveBeenCalled();
  });

  it('archives published projects and never returns them to draft', async () => {
    database.project.findFirst.mockResolvedValue(
      project({ status: ProjectStatus.published, revision: 2 }),
    );
    database.project.findUniqueOrThrow.mockResolvedValue(
      project({ status: ProjectStatus.archived, revision: 3, archived_at: new Date() }),
    );
    database.projectStateTransition.create.mockResolvedValue({ id: 'archive-transition' });

    await expect(
      service.archive(
        actor,
        'project-id',
        { expectedRevision: 2, confirm: true },
        'archive-12345678',
      ),
    ).resolves.toMatchObject({ status: ProjectStatus.archived, revision: 3 });
  });
});

function snapshot() {
  return {
    repository: {
      githubRepoId: '123',
      fullName: 'owner/repo',
      name: 'repo',
      owner: 'owner',
      ownerId: '42',
      ownerType: 'user',
      description: 'Provider description',
      htmlUrl: 'https://github.com/owner/repo',
      private: false,
      fork: false,
      archived: false,
      defaultBranch: 'main',
      primaryLanguage: 'TypeScript',
      languages: { TypeScript: 100 },
      stars: 1,
      forks: 0,
      openIssues: 0,
      watchers: 1,
      topics: ['nestjs'],
      pushedAt: new Date('2026-07-28T00:00:00Z'),
      updatedAt: new Date('2026-07-28T00:00:00Z'),
    },
    technologies: ['TypeScript', 'NestJS'],
    repoStatistics: { stars: 1 },
    readmeContent: '# Repo',
    contributionActivity: {},
    commitSignals: {},
    authorship: null,
    evidenceFailures: [],
  };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-id',
    owner_id: '11111111-1111-4111-8111-111111111111',
    title: 'Reviewed project',
    slug: 'reviewed-project-abcd1234',
    slug_normalized: 'reviewed-project-abcd1234',
    description: 'Description',
    github_repo_url: 'https://github.com/owner/repo',
    github_repo_id: '123',
    languages: { TypeScript: 100 },
    tags: ['nestjs'],
    technologies: ['TypeScript'],
    repo_statistics: { stars: 1 },
    category: ProjectCategory.web,
    difficulty: ProjectDifficulty.intermediate,
    status: ProjectStatus.draft,
    readme_content: '# Repo',
    revision: 1,
    manual_overrides: ['title'],
    source_visibility: 'public',
    source_owner_id: '42',
    source_owner_type: 'user',
    source_default_branch: 'main',
    source_updated_at: new Date('2026-07-28T00:00:00Z'),
    source_fetched_at: new Date(),
    published_at: null,
    archived_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}
