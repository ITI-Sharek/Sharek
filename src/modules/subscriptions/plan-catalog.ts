import { SubscriptionPlanType } from '@prisma/client';

/**
 * The single home for every plan number in the backend (DEC-077).
 *
 * Nothing outside this module may hard-code a limit, a cap, or a commission
 * rate. Enforcement points ask `EntitlementsService` and read the answer; a
 * grep for any number below must find it here and nowhere else.
 */

export interface OwnerPlanPolicy {
  /** Contribution Requests an owner may publish per UTC calendar month. */
  readonly monthlyContributionRequestLimit: number;
  /** Top placement for the owner's requests on the orders page. */
  readonly priorityPlacement: boolean;
  /** Contributors an owner may receive from one explicit matching request. */
  readonly contributorMatchLimit: number;
  /**
   * Phase 2 concern. Modelled here so Phase 2 has one place to read it from;
   * no Phase 1 surface may present it, because there are no paid tasks for a
   * commission to apply to yet.
   */
  readonly commissionRate: number;
}

export interface ContributorPlanPolicy {
  /** Applications a contributor may submit per UTC calendar day. */
  readonly dailyApplicationLimit: number;
  /** Matched projects a contributor may see. Zero means the feature is off. */
  readonly matchedProjectLimit: number;
  /** See {@link OwnerPlanPolicy.commissionRate}. */
  readonly commissionRate: number;
}

/** The commission a non-subscriber pays once Phase 2 introduces paid tasks. */
const STANDARD_COMMISSION_RATE = 0.2;
const WAIVED_COMMISSION_RATE = 0;

export const OWNER_PLAN_CATALOG: Record<SubscriptionPlanType, OwnerPlanPolicy> =
  {
    free: {
      monthlyContributionRequestLimit: 5,
      priorityPlacement: false,
      contributorMatchLimit: 0,
      commissionRate: STANDARD_COMMISSION_RATE,
    },
    gold: {
      monthlyContributionRequestLimit: 30,
      priorityPlacement: true,
      contributorMatchLimit: 10,
      commissionRate: WAIVED_COMMISSION_RATE,
    },
  };

export const CONTRIBUTOR_PLAN_CATALOG: Record<
  SubscriptionPlanType,
  ContributorPlanPolicy
> = {
  free: {
    dailyApplicationLimit: 1,
    matchedProjectLimit: 0,
    commissionRate: STANDARD_COMMISSION_RATE,
  },
  gold: {
    dailyApplicationLimit: 5,
    matchedProjectLimit: 10,
    commissionRate: WAIVED_COMMISSION_RATE,
  },
};

/**
 * Plan ordering, for the few call sites that ask "is this plan at least X?"
 * rather than reading a specific number. There is exactly one paid tier, so the
 * ladder has two rungs; it exists so adding a tier stays a change in this file.
 */
export const PLAN_RANK: Record<SubscriptionPlanType, number> = {
  free: 1,
  gold: 2,
};
