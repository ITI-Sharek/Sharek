import { ApplicationStatus, ProjectStatus, UserStatus } from '@prisma/client';

import { PublicProjectsService } from './public-projects.service';

describe('PublicProjectsService', () => {
  const database = {
    project: { findMany: jest.fn(), findFirst: jest.fn() },
    application: { findMany: jest.fn() },
    savedProject: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new PublicProjectsService(database as never);

  beforeEach(() => jest.resetAllMocks());

  it('queries published rows at the persistence boundary', async () => {
    database.project.findMany.mockResolvedValue([]);

    await service.list({ limit: 20 });

    expect(database.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ProjectStatus.published }),
        take: 21,
      }),
    );
  });

  it('does not reveal draft or archived identifiers', async () => {
    database.project.findFirst.mockResolvedValue(null);

    await expect(service.getBySlug('private-draft')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('withholds private GitHub source attribution from public responses', async () => {
    database.project.findFirst.mockResolvedValue({
      id: 'project-id',
      slug: 'private-source-project',
      title: 'Private source project',
      description: null,
      tags: [],
      technologies: [],
      category: null,
      difficulty: null,
      published_at: new Date(),
      owner: {
        username: 'Karim-Muhammad',
        first_name: 'Karim',
        last_name: 'Muhammad',
        avatar_url: null,
        status: UserStatus.active,
        profile_visibility: 'private',
        _count: { projects: 3 },
      },
      source_visibility: 'private',
      source_fetched_at: new Date(),
      github_repo_url: 'https://github.com/private/repo',
    });

    await expect(service.getBySlug('private-source-project')).resolves.toMatchObject({
      source: { provider: 'github', attributionStatus: 'withheld' },
      owner: null,
    });
  });

  it('projects only allowlisted persisted GitHub statistics', async () => {
    database.project.findFirst.mockResolvedValue({
      id: 'project-id',
      slug: 'public-source-project',
      title: 'Public source project',
      description: null,
      tags: [],
      technologies: [],
      category: null,
      difficulty: null,
      published_at: new Date(),
      owner: {
        username: 'Karim-Muhammad',
        first_name: 'Karim',
        last_name: 'Muhammad',
        avatar_url: 'https://example.com/avatar.png',
        status: UserStatus.active,
        profile_visibility: 'public',
        _count: { projects: 3 },
      },
      source_visibility: 'public',
      source_fetched_at: new Date(),
      source_updated_at: new Date('2026-08-17T10:00:00.000Z'),
      github_repo_url: 'https://github.com/public/repo',
      repo_statistics: {
        stars: 12,
        forks: 4,
        contributionActivity: { totalContributors: 3, topContributors: ['secret'] },
        commitSignals: {
          latestCommitAt: '2026-08-16T10:00:00.000Z',
          authors: ['secret'],
          recentCommits: [
            {
              sha: 'abc123',
              htmlUrl: 'https://github.com/public/repo/commit/abc123',
              messageHeadline: 'Add safe snapshot',
              authorLogin: 'Karim-Muhammad',
              authoredAt: '2026-08-16T10:00:00.000Z',
              rawCommitPayload: { email: 'private@example.com' },
            },
          ],
        },
        defaultBranch: 'main',
        rootEntries: {
          entries: [
            {
              name: 'src',
              path: 'src',
              type: 'dir',
              size: 0,
              url: 'https://github.com/public/repo/tree/main/src',
              rawPayload: { token: 'must-not-leak' },
            },
          ],
          unavailableReason: 'github_provider_detail_must_not_leak',
        },
        repositoryTree: {
          entries: [
            {
              path: 'src/main.ts',
              type: 'file',
              size: 42,
              url: 'https://github.com/public/repo/blob/main/src/main.ts',
              rawPayload: { token: 'must-not-leak' },
            },
          ],
          truncated: false,
          unavailableReason: 'github_provider_detail_must_not_leak',
        },
        privateProviderPayload: { token: 'must-not-leak' },
      },
    });

    const result = await service.getBySlug('public-source-project');
    if (result.source.attributionStatus !== 'public') {
      throw new Error('Expected public source attribution');
    }

    expect(result.source.statistics).toEqual({
      stars: 12,
      forks: 4,
      contributors: 3,
      latestCommitAt: new Date('2026-08-16T10:00:00.000Z'),
      sourceUpdatedAt: new Date('2026-08-17T10:00:00.000Z'),
      defaultBranch: 'main',
      recentCommits: [
        {
          sha: 'abc123',
          url: 'https://github.com/public/repo/commit/abc123',
          message: 'Add safe snapshot',
          author: 'Karim-Muhammad',
          authoredAt: new Date('2026-08-16T10:00:00.000Z'),
        },
      ],
      rootEntries: [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          size: 0,
          url: 'https://github.com/public/repo/tree/main/src',
        },
      ],
      rootEntriesUnavailableReason: 'source_snapshot_unavailable',
      treeEntries: [
        {
          path: 'src/main.ts',
          type: 'file',
          size: 42,
          url: 'https://github.com/public/repo/blob/main/src/main.ts',
        },
      ],
      treeTruncated: false,
      treeUnavailableReason: 'source_snapshot_unavailable',
    });
    expect(result.owner).toEqual({
      username: 'Karim-Muhammad',
      displayName: 'Karim Muhammad',
      avatarUrl: 'https://example.com/avatar.png',
      publishedProjectsCount: 3,
    });
  });

  it('lists only public-profile, active applicant cards for a published Project', async () => {
    database.project.findFirst.mockResolvedValue({
      id: 'project-id',
      slug: 'public-source-project',
      title: 'Public source project',
      description: null,
      tags: [],
      technologies: [],
      category: null,
      difficulty: null,
      published_at: new Date(),
      owner: {
        username: 'private-owner',
        first_name: 'Private',
        last_name: 'Owner',
        avatar_url: null,
        status: UserStatus.active,
        profile_visibility: 'private',
        _count: { projects: 1 },
      },
      source_visibility: 'public',
      source_fetched_at: null,
      source_updated_at: null,
      github_repo_url: 'https://github.com/public/repo',
      repo_statistics: null,
    });
    database.application.findMany.mockResolvedValue([
      {
        id: 'application-id',
        submitted_at: new Date('2026-08-17T10:00:00.000Z'),
        contributionRequest: { id: 'request-id', title: 'Build the API' },
        contributor: {
          username: 'Karim-Muhammad',
          first_name: 'Karim',
          last_name: 'Muhammad',
          avatar_url: 'https://example.com/avatar.png',
        },
      },
    ]);

    await expect(
      service.listApplicantsByProjectSlug('public-source-project'),
    ).resolves.toEqual({
      items: [
        {
          applicationId: 'application-id',
          contributionRequest: { id: 'request-id', title: 'Build the API' },
          contributor: {
            username: 'Karim-Muhammad',
            displayName: 'Karim Muhammad',
            avatarUrl: 'https://example.com/avatar.png',
          },
          submittedAt: new Date('2026-08-17T10:00:00.000Z'),
        },
      ],
    });

    expect(database.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({
            in: expect.arrayContaining([
              ApplicationStatus.pending_owner_review,
              ApplicationStatus.accepted,
            ]),
          }),
          contributionRequest: { project_id: 'project-id' },
          contributor: {
            status: UserStatus.active,
            profile_visibility: 'public',
          },
        }),
        take: 50,
      }),
    );
  });

  it('persists an active reader save against a published Project', async () => {
    database.project.findFirst.mockResolvedValue({
      id: 'project-id',
      slug: 'public-source-project',
      title: 'Public source project',
      description: null,
      tags: [],
      technologies: [],
      category: null,
      difficulty: null,
      published_at: new Date(),
      owner: {
        username: 'Karim-Muhammad',
        first_name: 'Karim',
        last_name: 'Muhammad',
        avatar_url: null,
        status: UserStatus.active,
        profile_visibility: 'public',
        _count: { projects: 3 },
      },
      source_visibility: 'public',
      source_fetched_at: null,
      source_updated_at: null,
      github_repo_url: 'https://github.com/public/repo',
      repo_statistics: null,
    });
    database.savedProject.findUnique.mockResolvedValue(null);
    database.savedProject.upsert.mockResolvedValue(undefined);
    database.savedProject.deleteMany.mockResolvedValue({ count: 1 });
    const actor = {
      id: 'reader-id',
      email: 'reader@example.com',
      role: 'contributor' as const,
      status: 'active' as const,
    };

    await expect(
      service.getSavedState(actor, 'public-source-project'),
    ).resolves.toEqual({ saved: false });
    await expect(service.save(actor, 'public-source-project')).resolves.toEqual({
      saved: true,
    });
    await expect(service.unsave(actor, 'public-source-project')).resolves.toEqual({
      saved: false,
    });

    expect(database.savedProject.upsert).toHaveBeenCalledWith({
      where: {
        user_id_project_id: {
          user_id: 'reader-id',
          project_id: 'project-id',
        },
      },
      create: { user_id: 'reader-id', project_id: 'project-id' },
      update: {},
    });
    expect(database.savedProject.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'reader-id', project_id: 'project-id' },
    });
  });
});
