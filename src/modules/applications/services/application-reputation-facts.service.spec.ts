import { ApplicationReputationFactsService } from './application-reputation-facts.service';

describe('ApplicationReputationFactsService', () => {
  const database = {
    assignment: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const service = new ApplicationReputationFactsService(database as never);

  beforeEach(() => jest.resetAllMocks());

  it('counts every assigned task for the success-rate denominator', async () => {
    database.assignment.count.mockResolvedValue(4);

    await expect(service.countAssignedTasks('contributor-1')).resolves.toBe(4);
    expect(database.assignment.count).toHaveBeenCalledWith({
      where: { contributor_id: 'contributor-1' },
    });
  });

  it('lists bounded distinct contributors for reconciliation', async () => {
    database.assignment.findMany.mockResolvedValue([
      { contributor_id: 'contributor-1' },
      { contributor_id: 'contributor-2' },
    ]);

    await expect(service.listAssignedContributorIds(1000)).resolves.toEqual([
      'contributor-1',
      'contributor-2',
    ]);
    expect(database.assignment.findMany).toHaveBeenCalledWith({
      distinct: ['contributor_id'],
      select: { contributor_id: true },
      orderBy: { contributor_id: 'asc' },
      take: 500,
    });
  });
});
