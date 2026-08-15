import { SubscriptionPlanType, SubscriptionUserRoleContext } from '@prisma/client';

import {
  getSubscriptionPlanCatalog,
  getSubscriptionPlanCatalogEntry,
} from './subscription-catalog';

describe('subscription plan catalog', () => {
  it('exposes the approved shared role-context catalog in minor units', () => {
    expect(getSubscriptionPlanCatalog()).toEqual([
      {
        planType: SubscriptionPlanType.free,
        amountCents: 0,
        currency: 'EGP',
        durationDays: null,
        checkoutAvailable: false,
        roleContexts: [
          SubscriptionUserRoleContext.owner,
          SubscriptionUserRoleContext.contributor,
        ],
      },
      {
        planType: SubscriptionPlanType.gold,
        amountCents: 50_000,
        currency: 'EGP',
        durationDays: 30,
        checkoutAvailable: true,
        roleContexts: [
          SubscriptionUserRoleContext.owner,
          SubscriptionUserRoleContext.contributor,
        ],
      },
    ]);
  });

  it('returns a stable copy of the selected catalog entry', () => {
    const entry = getSubscriptionPlanCatalogEntry(SubscriptionPlanType.gold);

    expect(entry).toEqual({
      planType: SubscriptionPlanType.gold,
      amountCents: 50_000,
      currency: 'EGP',
      durationDays: 30,
      checkoutAvailable: true,
      roleContexts: [
        SubscriptionUserRoleContext.owner,
        SubscriptionUserRoleContext.contributor,
      ],
    });
    expect(entry).not.toBe(getSubscriptionPlanCatalogEntry(SubscriptionPlanType.gold));
  });

  it('rejects an unsupported plan with a stable application error', () => {
    expect(() =>
      getSubscriptionPlanCatalogEntry('unsupported' as SubscriptionPlanType),
    ).toThrow(
      expect.objectContaining({
        code: 'SUBSCRIPTION_PLAN_UNSUPPORTED',
        statusCode: 400,
      }),
    );
  });
});
