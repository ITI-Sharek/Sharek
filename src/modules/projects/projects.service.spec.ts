import { ProjectCategory, ProjectDifficulty, ProjectStatus } from '@prisma/client';

import { ApplicationError } from '../../shared/errors/application.error';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  const database = {
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    contributionRequest: {
      count: jest.fn(),
    },
  };
  const gitHubRepositoryService = {
    getPublicImportSnapshot: jest.fn(),
  };
  const service = new ProjectsService(
    database as never,
    gitHubRepositoryService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    gitHubRepositoryService.getPublicImportSnapshot.mockResolvedValue(getSnapshot());
  });

  it('lists owner projects with pipeline counts and quota usage', async () => {
    database.project.findMany.mockResolvedValue([
      {
        id: 'project-id',
        title: 'Share-k API',
        github_repo_url: 'https://github.com/ITI-Sharek/sharek-api',
        status: ProjectStatus.published,
        updated_at: new Date(),
        contributionRequests: [
          {
            status: 'published',
            applications: [
              { status: 'eligible' },
              { status: 'rejected' },
            ],
          },
          {
            status: 'draft',
            applications: [{ status: 'pending_validation' }],
          },
        ],
      },
    ]);
    database.contributionRequest.count.mockResolvedValue(7);

    const result = await service.getMyProjects('owner-id');

    expect(database.project.findMany).toHaveBeenCalledWith({
      where: {
        owner_id: 'owner-id',
      },
      orderBy: {
        updated_at: 'desc',
      },
      include: {
        contributionRequests: {
          select: {
            status: true,
            applications: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });
    expect(database.contributionRequest.count).toHaveBeenCalledWith({
      where: {
        owner_id: 'owner-id',
        created_at: {
          gte: expect.any(Date),
        },
      },
    });
    expect(result).toMatchObject({
      projects: [
        {
          id: 'project-id',
          title: 'Share-k API',
          slug: 'sharek-api',
          status: ProjectStatus.published,
          openRequestsCount: 1,
          pendingApplicationsCount: 2,
          lastActivityLabel: 'اليوم',
        },
      ],
      quota: {
        used: 7,
        monthlyLimit: 20,
      },
    });
  });

  it('lists owners with published projects for an active admin', async () => {
    database.project.groupBy.mockResolvedValue([
      {
        owner_id: 'owner-id',
        _count: { _all: 3 },
        _max: { published_at: new Date('2026-07-20T08:00:00Z') },
      },
    ]);
    database.project.findFirst.mockResolvedValue({
      id: 'project-id',
      title: 'Published project',
      github_repo_url: 'https://github.com/sharek/published-project',
      owner: {
        id: 'owner-id',
        email: 'owner@example.com',
        first_name: 'Project',
        last_name: 'Owner',
      },
    });

    await expect(
      service.listPublishedProjectOwners({
        id: 'admin-id',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
      }),
    ).resolves.toEqual([
      {
        ownerId: 'owner-id',
        ownerName: 'Project Owner',
        ownerEmail: 'owner@example.com',
        publishedProjectsCount: 3,
        latestPublishedAt: new Date('2026-07-20T08:00:00Z'),
        latestProject: {
          id: 'project-id',
          title: 'Published project',
          githubRepoUrl: 'https://github.com/sharek/published-project',
        },
      },
    ]);
    expect(database.project.groupBy).toHaveBeenCalledWith({
      by: ['owner_id'],
      where: { status: ProjectStatus.published },
      _count: { _all: true },
      _max: { published_at: true },
      orderBy: { _max: { published_at: 'desc' } },
      take: 10,
    });
  });

  it('blocks importing a repository already owned by another user', async () => {
    database.project.findUnique.mockResolvedValue({
      id: 'project-id',
      owner_id: 'other-user-id',
    });

    await expect(
      service.importFromGitHub('user-id', {
        fullName: 'ITI-Sharek/sharek-api',
      }),
    ).rejects.toMatchObject({
      code: 'GITHUB_REPOSITORY_ALREADY_IMPORTED',
      statusCode: 409,
    } satisfies Partial<ApplicationError>);
  });

  it('creates a draft project from a GitHub repository snapshot', async () => {
    database.project.findUnique.mockResolvedValue(null);
    database.project.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'project-id',
        created_at: new Date('2026-07-05T00:00:00Z'),
        updated_at: new Date('2026-07-05T00:00:00Z'),
        ...data,
      }),
    );
    const project = await service.importFromGitHub(
      'user-id',
      { fullName: 'ITI-Sharek/sharek-api' },
    );

    expect(database.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner_id: 'user-id',
        title: 'sharek-api',
        github_repo_url: 'https://github.com/ITI-Sharek/sharek-api',
        github_repo_id: '123',
        status: ProjectStatus.draft,
        published_at: null,
        readme_content: '# Share-k API',
      }),
    });
    expect(gitHubRepositoryService.getPublicImportSnapshot).toHaveBeenCalledWith(
      'ITI-Sharek/sharek-api',
    );
    expect(project).toMatchObject({
      id: 'project-id',
      ownerId: 'user-id',
      title: 'sharek-api',
      status: ProjectStatus.draft,
      publishedAt: null,
    });
  });

  it('creates a published project with reviewed metadata overrides', async () => {
    database.project.findUnique.mockResolvedValue(null);
    database.project.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'project-id',
        created_at: new Date('2026-07-05T00:00:00Z'),
        updated_at: new Date('2026-07-05T00:00:00Z'),
        ...data,
      }),
    );

    const project = await service.importFromGitHub('user-id', {
      repoUrl: 'https://github.com/ITI-Sharek/sharek-api',
      status: ProjectStatus.published,
      title: 'Share-k Backend',
      description: 'Reviewed owner copy',
      tags: ['nestjs', 'api', 'nestjs'],
      technologies: ['TypeScript', 'PostgreSQL', 'TypeScript'],
      category: ProjectCategory.web,
      difficulty: ProjectDifficulty.intermediate,
    });

    expect(database.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Share-k Backend',
        description: 'Reviewed owner copy',
        tags: ['nestjs', 'api'],
        technologies: ['TypeScript', 'PostgreSQL'],
        category: ProjectCategory.web,
        difficulty: ProjectDifficulty.intermediate,
        status: ProjectStatus.published,
        published_at: expect.any(Date),
      }),
    });
    expect(gitHubRepositoryService.getPublicImportSnapshot).toHaveBeenCalledWith(
      'https://github.com/ITI-Sharek/sharek-api',
    );
    expect(project).toMatchObject({
      status: ProjectStatus.published,
      publishedAt: expect.any(Date),
      category: ProjectCategory.web,
      difficulty: ProjectDifficulty.intermediate,
    });
  });

  it('rejects publishing before category and difficulty are selected', async () => {
    database.project.findUnique.mockResolvedValue(null);

    await expect(
      service.importFromGitHub('user-id', {
        fullName: 'ITI-Sharek/sharek-api',
        status: ProjectStatus.published,
      }),
    ).rejects.toMatchObject({
      code: 'PROJECT_PUBLICATION_METADATA_REQUIRED',
      statusCode: 422,
    } satisfies Partial<ApplicationError>);
    expect(database.project.create).not.toHaveBeenCalled();
  });

  it('can save an existing project back to draft and clear publication time', async () => {
    database.project.findUnique.mockResolvedValue({
      id: 'project-id',
      owner_id: 'user-id',
      status: ProjectStatus.published,
      published_at: new Date('2026-07-05T00:00:00Z'),
      category: ProjectCategory.web,
      difficulty: ProjectDifficulty.intermediate,
    });
    database.project.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'project-id',
        owner_id: 'user-id',
        github_repo_url: 'https://github.com/ITI-Sharek/sharek-api',
        created_at: new Date('2026-07-05T00:00:00Z'),
        updated_at: new Date('2026-07-05T00:00:00Z'),
        ...data,
      }),
    );

    const project = await service.importFromGitHub('user-id', {
      fullName: 'ITI-Sharek/sharek-api',
      status: ProjectStatus.draft,
    });

    expect(database.project.update).toHaveBeenCalledWith({
      where: {
        id: 'project-id',
      },
      data: expect.objectContaining({
        status: ProjectStatus.draft,
        published_at: null,
        category: ProjectCategory.web,
        difficulty: ProjectDifficulty.intermediate,
      }),
    });
    expect(project).toMatchObject({
      status: ProjectStatus.draft,
      publishedAt: null,
    });
  });
});

function getSnapshot() {
  return {
    repository: {
      githubRepoId: '123',
      fullName: 'ITI-Sharek/sharek-api',
      name: 'sharek-api',
      owner: 'ITI-Sharek',
      description: 'Backend',
      htmlUrl: 'https://github.com/ITI-Sharek/sharek-api',
      private: false,
      fork: false,
      archived: false,
      defaultBranch: 'main',
      primaryLanguage: 'TypeScript',
      languages: {
        TypeScript: 1000,
      },
      stars: 5,
      forks: 1,
      openIssues: 2,
      watchers: 5,
      topics: ['nestjs'],
      pushedAt: new Date('2026-07-05T00:00:00Z'),
      updatedAt: new Date('2026-07-05T01:00:00Z'),
    },
    technologies: ['nestjs', 'TypeScript'],
    repoStatistics: {
      stars: 5,
      forks: 1,
    },
    readmeContent: '# Share-k API',
  };
}
