import { SubscriptionPlanType } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const contributorId = '22222222-2222-4222-8222-222222222222';
  const database = {
    subscription: {
      findFirst: jest.fn(),
    },
    subscriptionEntitlement: {
      findFirst: jest.fn(),
    },
    usageTracker: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new SubscriptionsService(database as never);

  const now = new Date('2026-08-11T12:00:00.000Z');

  beforeEach(() => {
    jest.resetAllMocks();
    database.subscription.findFirst.mockResolvedValue(null);
    database.subscriptionEntitlement.findFirst.mockResolvedValue(null);
    database.usageTracker.findUnique.mockResolvedValue(null);
  });

  it('exposes an active default Bronze owner plan with an empty monthly allowance', async () => {
    database.usageTracker.findUnique.mockResolvedValue({ count: 0 });

    await expect(
      service.getPlanStatus(owner(), now),
    ).resolves.toMatchObject({
      roleContext: 'owner',
      plan: 'bronze',
      status: 'active',
      source: 'default',
      usage: {
        used: 0,
        limit: 10,
        periodStart: '2026-08-01T00:00:00.000Z',
        periodEnd: '2026-09-01T00:00:00.000Z',
      },
      entitlements: [
        { key: 'PROJECT_MATERIAL_ANALYSIS', state: 'unavailable' },
      ],
    });
  });

  it('does not expose a contributor Application quota or upgrade gate', async () => {
    await expect(
      service.getPlanStatus(contributor(), now),
    ).resolves.toMatchObject({
      roleContext: 'contributor',
      plan: 'bronze',
      usage: null,
      benefits: expect.arrayContaining([
        expect.objectContaining({ key: 'application_submission', state: 'included' }),
        expect.objectContaining({ key: 'skill_gap_guidance', state: 'included' }),
      ]),
    });
    expect(database.usageTracker.findUnique).not.toHaveBeenCalled();
  });

  it('exposes contributor premium notification, recommendation, priority, and commission flags', async () => {
    database.subscription.findFirst.mockResolvedValue({
      plan_type: SubscriptionPlanType.gold,
      status: 'active',
      source: 'demo',
    });

    await expect(
      service.getContributorBenefitEntitlement(contributorId, now),
    ).resolves.toEqual({
      planType: SubscriptionPlanType.gold,
      skillMatchedNotifications: true,
      taskRecommendations: true,
      priorityApplicationVisibility: true,
      commission: 'none',
      source: 'demo',
    });
  });

  it('uses an explicitly assigned entitlement rather than inferring Material Analysis from plan rank', async () => {
    database.subscription.findFirst.mockResolvedValue({
      plan_type: 'bronze',
      status: 'active',
      source: 'admin',
    });
    database.subscriptionEntitlement.findFirst.mockResolvedValue({
      key: 'project_material_analysis',
      status: 'active',
      starts_at: new Date('2026-08-01T00:00:00.000Z'),
      expires_at: null,
      source: 'admin',
    });

    await expect(service.getMaterialAnalysisEntitlement(ownerId, now)).resolves.toEqual({
      entitled: true,
      source: 'admin',
    });
  });

  it('reserves the next owner publication within the active plan limit', async () => {
    database.subscription.findFirst.mockResolvedValue({
      plan_type: 'silver',
      status: 'active',
      source: 'demo',
    });
    database.usageTracker.upsert.mockResolvedValue({
      id: 'usage-id',
      count: 19,
    });
    database.usageTracker.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.reserveOwnerContributionRequestPublication(ownerId, database as never, now),
    ).resolves.toMatchObject({
      planType: 'silver',
      monthlyLimit: 20,
      monthlyUsageBefore: 19,
      source: 'demo',
    });
    expect(database.usageTracker.updateMany).toHaveBeenCalledWith({
      where: { id: 'usage-id', count: 19 },
      data: { count: { increment: 1 } },
    });
  });

  it('rejects an owner publication when the monthly plan limit is already consumed', async () => {
    database.subscription.findFirst.mockResolvedValue({
      plan_type: 'gold',
      status: 'active',
      source: 'admin',
    });
    database.usageTracker.upsert.mockResolvedValue({
      id: 'usage-id',
      count: 30,
    });

    await expect(
      service.reserveOwnerContributionRequestPublication(ownerId, database as never, now),
    ).rejects.toMatchObject({ code: 'CONTRIBUTION_REQUEST_LIMIT_REACHED' });
    expect(database.usageTracker.updateMany).not.toHaveBeenCalled();
  });

  function owner(): AuthenticatedUser {
    return {
      id: ownerId,
      email: 'owner@example.com',
      role: 'owner',
      status: 'active',
    };
  }

  function contributor(): AuthenticatedUser {
    return {
      id: contributorId,
      email: 'contributor@example.com',
      role: 'contributor',
      status: 'active',
    };
  }
});
