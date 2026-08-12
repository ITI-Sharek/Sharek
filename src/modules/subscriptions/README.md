# Subscriptions Module

Owns subscription plan context, source-tagged MVP entitlements, and owner-side
Contribution Request usage reservation. No payment provider, checkout, invoice,
webhook, refund, or commission settlement belongs here in the MVP.

## Public interface

- `GET /me/subscription` returns the current role-context plan, source, owner
  monthly usage, benefits, and explicit feature-entitlement state.
- `SubscriptionsService.getOwnerContributionRequestPublicationEntitlement()`
  resolves Bronze/Silver/Gold owner limits and the UTC calendar-month usage
  counter for callers such as Projects and Contribution Requests.
- `SubscriptionsService.reserveOwnerContributionRequestPublication()` checks
  and increments the owner `order_created` counter atomically inside the caller
  transaction. Application submission never calls this interface.
- `SubscriptionsService.getMaterialAnalysisEntitlement()` checks the explicit
  `PROJECT_MATERIAL_ANALYSIS` assignment; it never infers access from plan rank.
- `SubscriptionsService.getContributorBenefitEntitlement()` is the shared
  contributor premium policy seam for skill-matched notifications, Gold task
  recommendations, Gold priority Application ordering, and commission flags.
- `SubscriptionsService.listOwnerPriorityVisibility()` returns the owner IDs
  whose published Projects may expose priority visibility to discovery callers.
- `assignPlan()` and `grantMaterialAnalysisEntitlement()` provide source-tagged
  admin/demo assignment seams for local seed data and future admin commands.

## Persistence

The module owns `Subscription`, `SubscriptionEntitlement`, and `UsageTracker`
rows. A missing active plan is the effective default Bronze plan. Owner usage
is keyed by `order_created` and UTC month; contributor Application usage is not
tracked or gated.

Migration `20260811110000_subscription_entitlements_and_usage_guards` adds the
source and entitlement enums/table, active-context protection, usage uniqueness,
and a history backfill from published Contribution Requests.
