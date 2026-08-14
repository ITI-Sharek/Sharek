/**
 * The response `GET /me/subscription` returns.
 *
 * These names and unions mirror the frontend's
 * `src/modules/subscriptions/types/subscription.types.ts` field for field. The
 * frontend has been calling this route against a type that had no
 * implementation behind it, so the type is the contract and this file follows
 * it rather than the other way round.
 */

export type SubscriptionRoleContextDto = 'owner' | 'contributor';

export interface SubscriptionUsageDto {
  used: number;
  limit: number;
  /** The window the `used` count is measured over, not the billing period. */
  periodStart: string;
  periodEnd: string;
}

export interface SubscriptionBenefitDto {
  key: string;
  state: 'included' | 'unavailable' | 'not_applicable';
  /**
   * Server-authored, so the UI never reconstructs plan policy from the plan
   * name. If a limit changes, the sentence the user reads changes with it.
   */
  label: string;
}

export interface SubscriptionEntitlementDto {
  key: 'PROJECT_MATERIAL_ANALYSIS';
  state: 'granted' | 'unavailable';
}

export interface SubscriptionPlanStatusDto {
  roleContext: SubscriptionRoleContextDto;
  plan: 'free' | 'gold';
  status: 'active' | 'cancelled' | 'expired';
  source: 'default' | 'admin' | 'demo' | 'payment_provider';
  usage: SubscriptionUsageDto | null;
  benefits: SubscriptionBenefitDto[];
  entitlements: SubscriptionEntitlementDto[];
}
