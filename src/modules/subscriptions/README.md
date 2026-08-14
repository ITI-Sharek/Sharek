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

`SubscriptionsModule` exports `EntitlementsService` only.

| Method | Answers |
|---|---|
| `resolveForOwner(userId, database?, now?)` | Monthly Contribution Request limit, priority placement, commission rate |
| `resolveForContributor(userId, database?, now?)` | Daily Application limit, matched-project cap, commission rate |
| `resolve(userId, roleContext, database?, now?)` | Either of the above, when the role is only known at runtime |
| `hasMinimumOwnerPlan(userId, minimumPlan, now?)` | Whether an owner's plan clears a threshold |
| `assignPlan(input, database?)` | Records a plan an administrator or a payment provider granted |

Every read takes an optional Prisma client so callers can resolve **inside their
own transaction**, which is where authorization and invariant checks belong.

## The model (DEC-077)

|  | Free | Gold — 500 EGP / ~$10 per month |
|---|---|---|
| **Owner** | 5 published Contribution Requests per month | 30 per month · top priority |
| **Contributor** | 1 Application per day · no matched projects | 5 per day · 10 matched projects |

The numbers live in `plan-catalog.ts` and nowhere else.

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

## Not here

Checkout, webhooks, and payment persistence are the PAY-xx issues. Usage
counting lives with the module that enforces the limit — publication counts in
contribution-tasks, Application counts in applications — because the count is
part of that module's transaction. This module supplies the limit, not the
tally.

## Extending

Adding a tier is a change to `plan-catalog.ts` and the `SubscriptionPlanType`
enum, and nothing else. If a change requires editing a limit anywhere outside
this module, that call site is the bug.
