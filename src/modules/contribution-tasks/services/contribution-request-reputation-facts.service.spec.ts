import { ContributionRequestReputationFactsService } from './contribution-request-reputation-facts.service';

describe('ContributionRequestReputationFactsService', () => {
  const database = {
    contributionRequest: { findMany: jest.fn() },
  };
  const service = new ContributionRequestReputationFactsService(
    database as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('returns only string technology tags from owner-authored requests', async () => {
    database.contributionRequest.findMany.mockResolvedValue([
      { id: 'request-1', technology_tags: ['NestJS', 7, 'PostgreSQL'] },
    ]);

    await expect(
      service.listTechnologyTags(['request-1', 'request-1']),
    ).resolves.toEqual([
      {
        contributionRequestId: 'request-1',
        technologyTags: ['NestJS', 'PostgreSQL'],
      },
    ]);
    expect(database.contributionRequest.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['request-1'] } },
      select: { id: true, technology_tags: true },
      orderBy: { id: 'asc' },
    });
  });
});
