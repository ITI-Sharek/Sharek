import { DeliveryReputationProjectionService } from './delivery-reputation-projection.service';

describe('DeliveryReputationProjectionService', () => {
  const contributorId = '11111111-1111-4111-8111-111111111111';
  const processedAt = new Date('2026-08-11T17:00:00.000Z');
  const approvedEvents = {
    listPending: jest.fn(),
    markPublished: jest.fn(),
  };
  const applicationFacts = {
    countAssignedTasks: jest.fn(),
    listAssignedContributorIds: jest.fn(),
  };
  const deliveryFacts = {
    listApprovedForContributor: jest.fn(),
  };
  const reputation = {
    replaceProjection: jest.fn(),
  };
  const service = new DeliveryReputationProjectionService(
    approvedEvents as never,
    applicationFacts as never,
    deliveryFacts as never,
    reputation as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    applicationFacts.countAssignedTasks.mockResolvedValue(3);
    deliveryFacts.listApprovedForContributor.mockResolvedValue([
      { rating: 5, technologyTags: ['TypeScript'] },
      { rating: 4, technologyTags: ['React'] },
    ]);
    reputation.replaceProjection.mockResolvedValue({});
  });

  it('projects one contributor once and acknowledges every replayable approval fact', async () => {
    approvedEvents.listPending.mockResolvedValue([
      approvedFact('event-1'),
      approvedFact('event-2'),
    ]);
    approvedEvents.markPublished
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(service.processPendingApprovals(100, processedAt)).resolves.toEqual({
      eventsRead: 2,
      contributorsProjected: 1,
      eventsAcknowledged: 1,
    });
    expect(applicationFacts.countAssignedTasks).toHaveBeenCalledTimes(1);
    expect(deliveryFacts.listApprovedForContributor).toHaveBeenCalledTimes(1);
    expect(reputation.replaceProjection).toHaveBeenCalledWith({
      contributorId,
      totalAssignedTasks: 3,
      approvedDeliveries: [
        { rating: 5, technologyTags: ['TypeScript'] },
        { rating: 4, technologyTags: ['React'] },
      ],
      lastUpdatedAt: processedAt,
    });
    expect(approvedEvents.markPublished).toHaveBeenNthCalledWith(
      1,
      'event-1',
      processedAt,
    );
    expect(approvedEvents.markPublished).toHaveBeenNthCalledWith(
      2,
      'event-2',
      processedAt,
    );
  });

  it('does not acknowledge an event when projection persistence fails', async () => {
    approvedEvents.listPending.mockResolvedValue([approvedFact('event-1')]);
    reputation.replaceProjection.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.processPendingApprovals(100, processedAt),
    ).rejects.toThrow('database unavailable');
    expect(approvedEvents.markPublished).not.toHaveBeenCalled();
  });

  it('reconciles assigned contributors even without a new approval event', async () => {
    applicationFacts.listAssignedContributorIds.mockResolvedValue([
      contributorId,
      '22222222-2222-4222-8222-222222222222',
    ]);

    await expect(
      service.reconcileAssignedContributors(500, processedAt),
    ).resolves.toBe(2);
    expect(reputation.replaceProjection).toHaveBeenCalledTimes(2);
    expect(applicationFacts.listAssignedContributorIds).toHaveBeenCalledWith(
      500,
    );
  });
});

function approvedFact(eventId: string) {
  return {
    eventId,
    deliveryId: `delivery-${eventId}`,
    deliveryReviewId: `review-${eventId}`,
    contributorId: '11111111-1111-4111-8111-111111111111',
    contributionRequestId: `request-${eventId}`,
    rating: 5,
    occurredAt: new Date('2026-08-11T16:00:00.000Z'),
  };
}
