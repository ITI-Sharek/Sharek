import { ContributionRequestDifficulty } from '@prisma/client';

import { PublicContributionRequestsService } from './public-contribution-requests.service';

describe('PublicContributionRequestsService', () => {
  const database = {
    contributionRequest: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
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

  it('exposes approved proposer attribution on a published Request detail', async () => {
    database.contributionRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      project_id: 'project-1',
      title: 'Add a caching layer',
      description: 'Owner-controlled draft turned published Request.',
      technology_tags: ['NestJS'],
      difficulty: ContributionRequestDifficulty.intermediate,
      applications_close_at: new Date('2030-03-10T12:00:00.000Z'),
      target_completion_date: null,
      reward: null,
      reward_currency: null,
      requirements: [],
      attributedContributor: {
        id: 'contributor-1',
        first_name: 'Nour',
        last_name: 'Hassan',
      },
    });
    projectsService.listContributionRequestProjectReferences.mockResolvedValue([
      { id: 'project-1', title: 'Published Project', slug: 'published-project' },
    ]);

    const detail = await service.getById('request-1');

    expect(detail.attribution).toEqual({
      contributorId: 'contributor-1',
      contributorName: 'Nour Hassan',
    });
  });

  it('returns null attribution for a Request that did not originate from a Proposal', async () => {
    database.contributionRequest.findFirst.mockResolvedValue({
      id: 'request-2',
      project_id: 'project-1',
      title: 'Owner-authored Request',
      description: 'Created directly by the owner.',
      technology_tags: [],
      difficulty: null,
      applications_close_at: new Date('2030-03-10T12:00:00.000Z'),
      target_completion_date: null,
      reward: null,
      reward_currency: null,
      requirements: [],
      attributedContributor: null,
    });
    projectsService.listContributionRequestProjectReferences.mockResolvedValue([
      { id: 'project-1', title: 'Published Project', slug: 'published-project' },
    ]);

    const detail = await service.getById('request-2');

    expect(detail.attribution).toBeNull();
  });
});
