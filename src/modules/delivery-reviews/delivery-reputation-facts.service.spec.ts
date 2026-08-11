import { DeliveryReviewOutcome, DeliveryStatus } from '@prisma/client';

import { DeliveryReputationFactsService } from './delivery-reputation-facts.service';

describe('DeliveryReputationFactsService', () => {
  const contributorId = '11111111-1111-4111-8111-111111111111';
  const database = {
    delivery: { findMany: jest.fn() },
  };
  const contributionRequestFacts = {
    listTechnologyTags: jest.fn(),
  };
  const service = new DeliveryReputationFactsService(
    database as never,
    contributionRequestFacts as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('returns ratings and owner-authored technology tags only for approved deliveries', async () => {
    database.delivery.findMany.mockResolvedValue([
      {
        id: 'delivery-1',
        contribution_request_id: 'request-1',
        deliveryReviews: [{ rating: 5 }],
      },
      {
        id: 'delivery-2',
        contribution_request_id: 'request-2',
        deliveryReviews: [{ rating: 3 }],
      },
    ]);
    contributionRequestFacts.listTechnologyTags.mockResolvedValue([
      {
        contributionRequestId: 'request-1',
        technologyTags: ['TypeScript', 'React'],
      },
      {
        contributionRequestId: 'request-2',
        technologyTags: ['NestJS'],
      },
    ]);

    await expect(service.listApprovedForContributor(contributorId)).resolves.toEqual([
      { rating: 5, technologyTags: ['TypeScript', 'React'] },
      { rating: 3, technologyTags: ['NestJS'] },
    ]);
    expect(database.delivery.findMany).toHaveBeenCalledWith({
      where: {
        contributor_id: contributorId,
        status: DeliveryStatus.approved,
      },
      select: {
        id: true,
        contribution_request_id: true,
        deliveryReviews: {
          where: { outcome: DeliveryReviewOutcome.approved },
          select: { rating: true },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          take: 1,
        },
      },
      orderBy: [{ reviewed_at: 'asc' }, { id: 'asc' }],
    });
    expect(contributionRequestFacts.listTechnologyTags).toHaveBeenCalledWith([
      'request-1',
      'request-2',
    ]);
  });

  it('rejects an approved Delivery without its required approval rating', async () => {
    database.delivery.findMany.mockResolvedValue([
      {
        id: 'delivery-1',
        contribution_request_id: 'request-1',
        deliveryReviews: [{ rating: null }],
      },
    ]);
    contributionRequestFacts.listTechnologyTags.mockResolvedValue([]);

    await expect(
      service.listApprovedForContributor(contributorId),
    ).rejects.toThrow(
      'Approved Delivery delivery-1 is missing its approval rating',
    );
  });
});
