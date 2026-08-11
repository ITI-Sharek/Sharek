import { DeliveryApprovedEventsService } from './delivery-approved-events.service';

describe('DeliveryApprovedEventsService', () => {
  const occurredAt = new Date('2026-08-11T13:00:00.000Z');
  const database = {
    deliveryApprovedEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new DeliveryApprovedEventsService(database as never);

  beforeEach(() => jest.resetAllMocks());

  it('appends the approved fact inside the Delivery review transaction', async () => {
    database.deliveryApprovedEvent.create.mockResolvedValue({});

    await service.append(
      {
        eventId: '11111111-1111-4111-8111-111111111111',
        deliveryId: '22222222-2222-4222-8222-222222222222',
        deliveryReviewId: '33333333-3333-4333-8333-333333333333',
        contributorId: '44444444-4444-4444-8444-444444444444',
        contributionRequestId: '55555555-5555-4555-8555-555555555555',
        rating: 5,
        occurredAt,
      },
      database as never,
    );

    expect(database.deliveryApprovedEvent.create).toHaveBeenCalledWith({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        delivery_id: '22222222-2222-4222-8222-222222222222',
        delivery_review_id: '33333333-3333-4333-8333-333333333333',
        contributor_id: '44444444-4444-4444-8444-444444444444',
        contribution_request_id: '55555555-5555-4555-8555-555555555555',
        rating: 5,
        occurred_at: occurredAt,
      },
    });
  });

  it('returns bounded pending facts in deterministic order', async () => {
    database.deliveryApprovedEvent.findMany.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        delivery_id: '22222222-2222-4222-8222-222222222222',
        delivery_review_id: '33333333-3333-4333-8333-333333333333',
        contributor_id: '44444444-4444-4444-8444-444444444444',
        contribution_request_id: '55555555-5555-4555-8555-555555555555',
        rating: 5,
        occurred_at: occurredAt,
      },
    ]);

    await expect(service.listPending(1000)).resolves.toEqual([
      {
        eventId: '11111111-1111-4111-8111-111111111111',
        deliveryId: '22222222-2222-4222-8222-222222222222',
        deliveryReviewId: '33333333-3333-4333-8333-333333333333',
        contributorId: '44444444-4444-4444-8444-444444444444',
        contributionRequestId: '55555555-5555-4555-8555-555555555555',
        rating: 5,
        occurredAt,
      },
    ]);
    expect(database.deliveryApprovedEvent.findMany).toHaveBeenCalledWith({
      where: { published_at: null },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  });

  it('marks a pending fact published exactly once', async () => {
    const publishedAt = new Date('2026-08-11T13:05:00.000Z');
    database.deliveryApprovedEvent.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.markPublished(
        '11111111-1111-4111-8111-111111111111',
        publishedAt,
      ),
    ).resolves.toBe(true);
    expect(database.deliveryApprovedEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        published_at: null,
      },
      data: { published_at: publishedAt },
    });
  });

  it('reports false when another consumer already acknowledged the fact', async () => {
    database.deliveryApprovedEvent.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.markPublished('11111111-1111-4111-8111-111111111111'),
    ).resolves.toBe(false);
  });
});
