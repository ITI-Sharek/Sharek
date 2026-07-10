import { ProjectStatus } from '@prisma/client';

import { ProjectImportService } from './project-import.service';
import { ApplicationError } from '../../../../shared/errors/application.error';

describe('ProjectImportService', () => {
  const database = {
    project: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const gitHubRepositoryService = {
    getPublicImportSnapshot: jest.fn(),
  };
  const service = new ProjectImportService(
    database as never,
    gitHubRepositoryService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    gitHubRepositoryService.getPublicImportSnapshot.mockResolvedValue(getSnapshot());
  });

  it('blocks importing a repository already owned by another user', async () => {
    database.project.findUnique.mockResolvedValue({
      id: 'project-id',
      owner_id: 'other-user-id',
    });

    await expect(
      service.importFromGitHub('user-id', 'ITI-Sharek/sharek-api'),
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
      'ITI-Sharek/sharek-api',
    );

    expect(database.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner_id: 'user-id',
        title: 'sharek-api',
        github_repo_url: 'https://github.com/ITI-Sharek/sharek-api',
        github_repo_id: '123',
        status: ProjectStatus.draft,
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
