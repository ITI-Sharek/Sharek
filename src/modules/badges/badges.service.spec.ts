import { BadgeType, Prisma } from '@prisma/client';

import { BadgesService } from './badges.service';

describe('BadgesService', () => {
  const contributorId = '11111111-1111-4111-8111-111111111111';
  const deliveryId = '22222222-2222-4222-8222-222222222222';
  const awardedAt = new Date('2026-08-18T16:00:00.000Z');

  const transaction = {
    delivery: { count: jest.fn() },
    userBadge: { create: jest.fn(), findUnique: jest.fn() },
  };
  const database = { userBadge: { findMany: jest.fn() } };
  const service = new BadgesService(database as never);

  beforeEach(() => jest.resetAllMocks());

  it('lists badges ordered by award date', async () => {
    database.userBadge.findMany.mockResolvedValue([
      {
        id: 'b1',
        badge_type: BadgeType.first_contribution,
        awarded_at: awardedAt,
        source_delivery_id: deliveryId,
      },
    ]);

    await expect(service.listForUser(contributorId)).resolves.toEqual([
      {
        id: 'b1',
        badgeType: BadgeType.first_contribution,
        awardedAt,
        sourceDeliveryId: deliveryId,
      },
    ]);
    expect(database.userBadge.findMany).toHaveBeenCalledWith({
      where: { user_id: contributorId },
      orderBy: { awarded_at: 'asc' },
    });
  });

  it('awards first_contribution when no other approved delivery exists', async () => {
    transaction.delivery.count.mockResolvedValue(0);
    transaction.userBadge.create.mockResolvedValue({
      id: 'b1',
      badge_type: BadgeType.first_contribution,
      awarded_at: awardedAt,
      source_delivery_id: deliveryId,
    });

    await expect(
      service.awardFirstContributionIfEligible(
        contributorId,
        deliveryId,
        transaction as never,
      ),
    ).resolves.toEqual({
      id: 'b1',
      badgeType: BadgeType.first_contribution,
      awardedAt,
      sourceDeliveryId: deliveryId,
    });
    expect(transaction.delivery.count).toHaveBeenCalledWith({
      where: {
        contributor_id: contributorId,
        status: 'approved',
        id: { not: deliveryId },
      },
    });
  });

  it('does not award when the contributor already has an approved delivery', async () => {
    transaction.delivery.count.mockResolvedValue(1);

    await expect(
      service.awardFirstContributionIfEligible(
        contributorId,
        deliveryId,
        transaction as never,
      ),
    ).resolves.toBeNull();
    expect(transaction.userBadge.create).not.toHaveBeenCalled();
  });

  it('resolves to the existing badge on a unique-constraint race instead of throwing', async () => {
    transaction.delivery.count.mockResolvedValue(0);
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2002',
      clientVersion: 'test',
    });
    transaction.userBadge.create.mockRejectedValue(conflict);
    transaction.userBadge.findUnique.mockResolvedValue({
      id: 'existing',
      badge_type: BadgeType.first_contribution,
      awarded_at: awardedAt,
      source_delivery_id: deliveryId,
    });

    await expect(
      service.awardFirstContributionIfEligible(
        contributorId,
        deliveryId,
        transaction as never,
      ),
    ).resolves.toEqual({
      id: 'existing',
      badgeType: BadgeType.first_contribution,
      awardedAt,
      sourceDeliveryId: deliveryId,
    });
  });
});
