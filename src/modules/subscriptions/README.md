# Subscriptions

Owns the `Subscription` table and every plan number in the backend.

## Why this module exists

Before it, the plan limits lived in `projects.service.ts` and the `Subscription`
table was read from two places inside the projects module — a module that owns
neither. Changing a limit meant finding every copy. This module is the single
answer to "what is this user allowed to do?", and no other module may hard-code a
limit, a cap, or a commission rate.

## Tables owned

| Table | Notes |
|---|---|
| `Subscription` | One row per (user, role context) grant. No other module reads or writes it. |

## Public API

### Routes

| Route | Returns |
|---|---|
| `GET /me/subscription` | The caller's own resolved plan, usage, benefits, and entitlements |
| `GET /subscriptions/plans` | The backend-owned Free/Gold commercial catalog |

The route takes no user parameter, so there is no path through this module's
HTTP surface to another user's subscription.

### Exported service

`SubscriptionsModule` exports `EntitlementsService` only.

| Method | Answers |
|---|---|
| `resolveForOwner(userId, database?, now?)` | Monthly Contribution Request limit, priority placement, commission rate |
| `resolveForContributor(userId, database?, now?)` | Daily Application limit, matched-project cap, commission rate |
| `resolve(userId, roleContext, database?, now?)` | Either of the above, when the role is only known at runtime |
| `hasMinimumOwnerPlan(userId, minimumPlan, now?)` | Whether an owner's plan clears a threshold |
| `resolveMaterialAnalysisEntitlement(userId, roleContext, now?)` | Whether Material analysis is available right now |
| `getPlanCatalog()` / `getPlanCatalogEntry(planType)` | Server-owned checkout price, currency, duration, and role eligibility |
| `assertPlanPurchaseAllowed(userId, roleContext, planType, now?)` | Whether the requested plan is an allowed upgrade |
| `assignPlan(input, database?)` | Records a plan an administrator or a payment provider granted |

Every read takes an optional Prisma client so callers can resolve **inside their
own transaction**, which is where authorization and invariant checks belong.

## The model (DEC-077)

|  | Free | Gold — 500 EGP / ~$10 per month |
|---|---|---|
| **Owner** | 5 published Contribution Requests per month | 30 per month · top priority |
| **Contributor** | 1 Application per day · no matched projects | 5 per day · 10 matched projects |

Entitlement numbers live in `plan-catalog.ts`; checkout amount, currency,
duration, and role eligibility live in `subscription-catalog.ts`. Payment
callers receive these through `EntitlementsService` and never write the
Subscription table directly.

`commissionRate` is modelled in the catalog because Phase 2 will need one home
for it, but **no Phase 1 surface may present it**: there are no paid tasks yet,
so there is nothing for a commission to apply to and advertising a waiver would
be advertising an unusable benefit.

## Resolution rules

- **Absence is free, not an error.** A user with no row resolves to `free` with
  status `active`. Free users are in good standing, not lapsed.
- **Role context is not transferable.** An owner subscription grants no
  contributor entitlement and vice versa. The return type is discriminated by
  role rather than being one bag of optional fields, so a caller cannot read a
  contributor allowance off an owner resolution by accident.
- **Expiry needs no background job.** The billing period bound is part of the
  query, so a plan stops granting the instant `current_period_end` passes.
  Both bounds are exclusive: at exactly the period end the plan no longer
  grants. A NULL end means open-ended, not "ended at the epoch".
- **Cancelled still grants until the period ends.** Cancelling stops the
  renewal; it does not refund the month already paid for. Only `expired` never
  grants. This is why the status filter admits `active` and `cancelled` while
  the period bound does the real expiry work.
- **`source` records provenance.** It defaults to `default` for seeded and
  pre-existing rows, is `admin` when `assignPlan` is called without an explicit
  source, and only a real checkout may write `payment_provider`. An admin grant
  and a paid grant are otherwise the same row shape.

## The status endpoint

`GET /me/subscription` is assembled by `SubscriptionStatusService`. Three rules
shape what it says:

- **Benefits are server-authored.** The label a user reads is written next to
  the limit the backend enforces, so the two cannot drift. The UI never
  reconstructs plan policy from the plan name.
- **No commission, in either role, on either plan.** Phase 1 has no paid tasks,
  so a commission rate has nothing to apply to, and advertising a waiver the
  user cannot benefit from would be advertising an unusable benefit. A test
  asserts the string is absent from the whole payload.
- **`usage` is the window the count is measured over, not the billing period.**
  A calendar month of published Contribution Requests for an owner, a UTC day of
  Applications for a contributor. That is what a user means by "resets", and it
  is present for free users, who have an allowance but no billing period at all.

A free user receives a complete payload. Absence of a subscription is a valid
state, so the route never 404s.

## Not here

Checkout creation, payment persistence, and payment status are owned by the
payments module. This module supplies the catalog and purchase-policy seam;
verified webhook activation remains PAY-04 and is the first workflow allowed
to call `assignPlan()` for a payment.

Usage **counting** lives with the module that owns the thing being counted:
published Contribution Requests in projects, Applications in applications. This
module supplies the limit and reads the tally for presentation; it never keeps
its own copy. That is why `SubscriptionsModule` forward-references those two
modules — for the read side of the status endpoint only. `EntitlementsService`
itself has no module dependencies, which is what lets every enforcement point
depend on it.

## Extending

Adding a tier is a change to `plan-catalog.ts` and the `SubscriptionPlanType`
enum, and nothing else. If a change requires editing a limit anywhere outside
this module, that call site is the bug.
