import { ContributionRequestDifficulty } from '@prisma/client';

import { PublicContributionRequestsService } from './public-contribution-requests.service';

describe('PublicContributionRequestsService', () => {
  const database = {
    contributionRequest: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const projectsService = {
    listContributionRequestProjectReferences: jest.fn(),
  };
  const service = new PublicContributionRequestsService(
    database as never,
    projectsService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.contributionRequest.count.mockResolvedValue(0);
    database.contributionRequest.findMany.mockResolvedValue([]);
    projectsService.listContributionRequestProjectReferences.mockResolvedValue(
      [],
    );
  });

  it('combines actionable visibility with every structured feed filter', async () => {
    projectsService.listContributionRequestProjectReferences.mockResolvedValue([
      {
        id: 'project-1',
        title: 'Published Project',
        slug: 'published-project',
      },
    ]);
    await service.list({
      q: 'backend',
      technologies: ['NestJS'],
      difficulty: ContributionRequestDifficulty.intermediate,
      hasReward: true,
    });

    expect(database.contributionRequest.count).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          expect.objectContaining({
            status: 'published',
            published_at: { not: null },
            applications_close_at: { gt: expect.any(Date) },
            project_id: { in: ['project-1'] },
          }),
          { difficulty: 'intermediate' },
          { reward: { not: null } },
          {
            OR: [{ technology_tags: { array_contains: ['NestJS'] } }],
          },
        ]),
      },
    });
  });

  it('returns an empty feed without querying Requests when no Project is published', async () => {
    await expect(service.list({})).resolves.toEqual({
      items: [],
      totalCount: 0,
      technologyFacets: [],
    });
    expect(database.contributionRequest.count).not.toHaveBeenCalled();
    expect(database.contributionRequest.findMany).not.toHaveBeenCalled();
  });
});
