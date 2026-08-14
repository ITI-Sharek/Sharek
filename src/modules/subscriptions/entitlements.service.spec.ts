import {
  SubscriptionPlanType,
  SubscriptionSource,
  SubscriptionStatus,
  SubscriptionUserRoleContext,
} from '@prisma/client';

import { EntitlementsService } from './entitlements.service';

describe('EntitlementsService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const now = new Date('2026-08-14T12:00:00.000Z');
  const periodStart = new Date('2026-08-01T00:00:00.000Z');
  const periodEnd = new Date('2026-09-01T00:00:00.000Z');

  const database = {
    subscription: { findFirst: jest.fn(), create: jest.fn() },
  };
  const service = new EntitlementsService(database as never);

  function goldRow(overrides: Record<string, unknown> = {}) {
    return {
      plan_type: SubscriptionPlanType.gold,
      status: SubscriptionStatus.active,
      source: SubscriptionSource.payment_provider,
      starts_at: periodStart,
      expires_at: periodEnd,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('absence of a subscription', () => {
    it('resolves an owner with no row to the free plan rather than failing', async () => {
      database.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveForOwner(userId, database as never, now),
      ).resolves.toEqual({
        roleContext: 'owner',
        planType: SubscriptionPlanType.free,
        status: SubscriptionStatus.active,
        source: SubscriptionSource.default,
        periodStart: null,
        periodEnd: null,
        monthlyContributionRequestLimit: 5,
        priorityPlacement: false,
        commissionRate: 0.2,
      });
    });

    it('resolves a contributor with no row to the free plan', async () => {
      database.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveForContributor(userId, database as never, now),
      ).resolves.toEqual({
        roleContext: 'contributor',
        planType: SubscriptionPlanType.free,
        status: SubscriptionStatus.active,
        source: SubscriptionSource.default,
        periodStart: null,
        periodEnd: null,
        dailyApplicationLimit: 1,
        matchedProjectLimit: 0,
        commissionRate: 0.2,
      });
    });
  });

  describe('an active plan', () => {
    it('grants the Gold contributor allowances', async () => {
      database.subscription.findFirst.mockResolvedValue(goldRow());

      await expect(
        service.resolveForContributor(userId, database as never, now),
      ).resolves.toMatchObject({
        planType: SubscriptionPlanType.gold,
        source: SubscriptionSource.payment_provider,
        dailyApplicationLimit: 5,
        matchedProjectLimit: 10,
        periodStart,
        periodEnd,
      });
    });

    it('grants the Gold owner allowances', async () => {
      database.subscription.findFirst.mockResolvedValue(goldRow());

      await expect(
        service.resolveForOwner(userId, database as never, now),
      ).resolves.toMatchObject({
        planType: SubscriptionPlanType.gold,
        monthlyContributionRequestLimit: 30,
        priorityPlacement: true,
      });
    });

    it('falls back to the subscription lifetime when the billing period is unset', async () => {
      database.subscription.findFirst.mockResolvedValue(
        goldRow({ current_period_start: null, current_period_end: null }),
      );

      await expect(
        service.resolveForOwner(userId, database as never, now),
      ).resolves.toMatchObject({ periodStart, periodEnd });
    });
  });

  describe('expiry at the period boundary', () => {
    // The period bound is part of the query, so these two cases differ only in
    // the `now` the caller passes: no sweeper has to have run in between.
    it('still grants one millisecond before the period ends', async () => {
      database.subscription.findFirst.mockResolvedValue(goldRow());
      const justBefore = new Date(periodEnd.getTime() - 1);

      await expect(
        service.resolveForContributor(userId, database as never, justBefore),
      ).resolves.toMatchObject({ planType: SubscriptionPlanType.gold });

      expect(database.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { OR: [{ expires_at: null }, { expires_at: { gt: justBefore } }] },
              {
                OR: [
                  { current_period_end: null },
                  { current_period_end: { gt: justBefore } },
                ],
              },
            ]),
          }),
        }),
      );
    });

    it('grants nothing at the instant the period ends', async () => {
      // The row no longer satisfies `current_period_end > now`, so the query
      // returns nothing and resolution falls through to free.
      database.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveForContributor(userId, database as never, periodEnd),
      ).resolves.toMatchObject({
        planType: SubscriptionPlanType.free,
        dailyApplicationLimit: 1,
        matchedProjectLimit: 0,
      });
    });
  });

  describe('cancellation', () => {
    it('keeps granting a cancelled plan until its paid period ends', async () => {
      database.subscription.findFirst.mockResolvedValue(
        goldRow({ status: SubscriptionStatus.cancelled }),
      );

      await expect(
        service.resolveForContributor(userId, database as never, now),
      ).resolves.toMatchObject({
        planType: SubscriptionPlanType.gold,
        status: SubscriptionStatus.cancelled,
        dailyApplicationLimit: 5,
      });
    });

    it('never considers an expired row, whatever its period says', async () => {
      database.subscription.findFirst.mockResolvedValue(null);

      await service.resolveForContributor(userId, database as never, now);

      expect(database.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: [SubscriptionStatus.active, SubscriptionStatus.cancelled],
            },
          }),
        }),
      );
    });
  });

  describe('role-context isolation', () => {
    it('asks only for the owner row when resolving owner entitlements', async () => {
      database.subscription.findFirst.mockResolvedValue(null);

      await service.resolveForOwner(userId, database as never, now);

      expect(database.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_role_context: SubscriptionUserRoleContext.owner,
          }),
        }),
      );
    });

    it('asks only for the contributor row when resolving contributor entitlements', async () => {
      database.subscription.findFirst.mockResolvedValue(null);

      await service.resolveForContributor(userId, database as never, now);

      expect(database.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_role_context: SubscriptionUserRoleContext.contributor,
          }),
        }),
      );
    });

    it('gives an owner subscriber no contributor allowance', async () => {
      // The owner row exists; the contributor query finds nothing.
      database.subscription.findFirst.mockImplementation(
        ({ where }: { where: { user_role_context: string } }) =>
          Promise.resolve(
            where.user_role_context === SubscriptionUserRoleContext.owner
              ? goldRow()
              : null,
          ),
      );

      await expect(
        service.resolveForContributor(userId, database as never, now),
      ).resolves.toMatchObject({
        planType: SubscriptionPlanType.free,
        dailyApplicationLimit: 1,
        matchedProjectLimit: 0,
      });
    });

    it('gives a contributor subscriber no owner allowance', async () => {
      database.subscription.findFirst.mockImplementation(
        ({ where }: { where: { user_role_context: string } }) =>
          Promise.resolve(
            where.user_role_context === SubscriptionUserRoleContext.contributor
              ? goldRow()
              : null,
          ),
      );

      await expect(
        service.resolveForOwner(userId, database as never, now),
      ).resolves.toMatchObject({
        planType: SubscriptionPlanType.free,
        monthlyContributionRequestLimit: 5,
        priorityPlacement: false,
      });
    });
  });

  describe('hasMinimumOwnerPlan', () => {
    it('entitles a Gold owner against a Gold minimum', async () => {
      database.subscription.findFirst.mockResolvedValue(goldRow());

      await expect(
        service.hasMinimumOwnerPlan(
          userId,
          SubscriptionPlanType.gold,
          now,
        ),
      ).resolves.toEqual({
        planType: SubscriptionPlanType.gold,
        entitled: true,
      });
    });

    it('refuses a free owner against a Gold minimum', async () => {
      database.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.hasMinimumOwnerPlan(userId, SubscriptionPlanType.gold, now),
      ).resolves.toEqual({
        planType: SubscriptionPlanType.free,
        entitled: false,
      });
    });

    it('entitles a free owner against a free minimum', async () => {
      database.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.hasMinimumOwnerPlan(userId, SubscriptionPlanType.free, now),
      ).resolves.toEqual({
        planType: SubscriptionPlanType.free,
        entitled: true,
      });
    });
  });

  describe('purchase policy', () => {
    it('allows a free user to purchase Gold in the matching role context', async () => {
      database.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.assertPlanPurchaseAllowed(
          userId,
          SubscriptionUserRoleContext.owner,
          SubscriptionPlanType.gold,
          now,
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects replaying Gold as another purchase in the same role context', async () => {
      database.subscription.findFirst.mockResolvedValue(goldRow());

      await expect(
        service.assertPlanPurchaseAllowed(
          userId,
          SubscriptionUserRoleContext.contributor,
          SubscriptionPlanType.gold,
          now,
        ),
      ).rejects.toMatchObject({
        code: 'SUBSCRIPTION_PLAN_CHANGE_NOT_ALLOWED',
        statusCode: 409,
      });
    });
  });

  describe('assignPlan', () => {
    it('stamps an administrator grant as `admin` rather than leaving the default', async () => {
      database.subscription.create.mockResolvedValue({});

      await service.assignPlan({
        userId,
        roleContext: SubscriptionUserRoleContext.contributor,
        planType: SubscriptionPlanType.gold,
        periodStart,
        periodEnd,
      });

      expect(database.subscription.create).toHaveBeenCalledWith({
        data: {
          user_id: userId,
          user_role_context: SubscriptionUserRoleContext.contributor,
          plan_type: SubscriptionPlanType.gold,
          status: SubscriptionStatus.active,
          source: SubscriptionSource.admin,
          starts_at: periodStart,
          expires_at: periodEnd,
          current_period_start: periodStart,
          current_period_end: periodEnd,
        },
      });
    });

    it('lets a payment provider claim the row as its own', async () => {
      database.subscription.create.mockResolvedValue({});

      await service.assignPlan({
        userId,
        roleContext: SubscriptionUserRoleContext.contributor,
        planType: SubscriptionPlanType.gold,
        periodStart,
        periodEnd,
        source: SubscriptionSource.payment_provider,
      });

      expect(database.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: SubscriptionSource.payment_provider,
          }),
        }),
      );
    });
  });
});
