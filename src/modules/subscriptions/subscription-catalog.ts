import {
  SubscriptionPlanType,
  SubscriptionUserRoleContext,
} from '@prisma/client';

import { BadRequestApplicationError } from '../../shared/errors/application.error';

export interface SubscriptionPlanCatalogEntry {
  planType: SubscriptionPlanType;
  amountCents: number;
  currency: 'EGP';
  durationDays: number | null;
  checkoutAvailable: boolean;
  roleContexts: readonly SubscriptionUserRoleContext[];
}

const roleContexts = [
  SubscriptionUserRoleContext.owner,
  SubscriptionUserRoleContext.contributor,
] as const;

const subscriptionPlanCatalog: readonly SubscriptionPlanCatalogEntry[] = [
  {
    planType: SubscriptionPlanType.free,
    amountCents: 0,
    currency: 'EGP',
    durationDays: null,
    checkoutAvailable: false,
    roleContexts,
  },
  {
    planType: SubscriptionPlanType.gold,
    amountCents: 50_000,
    currency: 'EGP',
    durationDays: 30,
    checkoutAvailable: true,
    roleContexts,
  },
];

export function getSubscriptionPlanCatalog(): SubscriptionPlanCatalogEntry[] {
  return subscriptionPlanCatalog.map(cloneCatalogEntry);
}

export function getSubscriptionPlanCatalogEntry(
  planType: SubscriptionPlanType,
): SubscriptionPlanCatalogEntry {
  const entry = subscriptionPlanCatalog.find((candidate) => candidate.planType === planType);
  if (!entry) {
    throw new BadRequestApplicationError(
      `Unsupported subscription plan: ${planType}`,
      'SUBSCRIPTION_PLAN_UNSUPPORTED',
    );
  }
  return cloneCatalogEntry(entry);
}

function cloneCatalogEntry(
  entry: SubscriptionPlanCatalogEntry,
): SubscriptionPlanCatalogEntry {
  return {
    ...entry,
    roleContexts: [...entry.roleContexts],
  };
}
