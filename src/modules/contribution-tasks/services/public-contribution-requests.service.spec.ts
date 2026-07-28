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
    await service.list({
      q: 'backend',
      technologies: ['NestJS'],
      difficulty: ContributionRequestDifficulty.intermediate,
      hasReward: true,
    });

    expect(database.contributionRequest.count).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          {
            status: 'published',
            published_at: { not: null },
            applications_close_at: { gt: expect.any(Date) },
          },
          { difficulty: 'intermediate' },
          { reward: { not: null } },
          {
            OR: [{ technology_tags: { array_contains: ['NestJS'] } }],
          },
        ]),
      },
    });
  });
});
