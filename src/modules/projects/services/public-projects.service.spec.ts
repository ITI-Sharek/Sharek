import { ProjectStatus } from '@prisma/client';

import { PublicProjectsService } from './public-projects.service';

describe('PublicProjectsService', () => {
  const database = { project: { findMany: jest.fn(), findFirst: jest.fn() } };
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
      source_visibility: 'private',
      source_fetched_at: new Date(),
      github_repo_url: 'https://github.com/private/repo',
    });

    await expect(service.getBySlug('private-source-project')).resolves.toMatchObject({
      source: { provider: 'github', attributionStatus: 'withheld' },
    });
  });
});
