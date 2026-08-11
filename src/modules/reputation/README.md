# Reputation Module

Owns the contributor `ReputationRecord` projection and every calculation used
to present verified reputation (TASK-5-04; FR-021, FR-065–071).

`ReputationService.replaceProjection()` is the only write seam. Callers supply
authoritative assignment count, approved-Delivery ratings, and owner-authored
Contribution Request technology tags. The service recalculates rather than
increments, making retries and reconciliation idempotent.

The stored and presented metrics are:

- overall rating: average of all approved-Delivery ratings, rounded to two
  decimals; `null` with no ratings;
- completed contributions: number of approved Deliveries;
- total assigned tasks: all Assignments, including active and rejected work;
- success rate: `(approved Deliveries / all Assignments) × 100`, rounded to two
  decimals and zero with no Assignments;
- top verified skills: at most five Request technology tags ranked by approved
  Delivery frequency, then name. A case-insensitive tag counts once per
  Delivery.

`getSummaryForUser()` exposes the full projection to contributor profiles and
returns a stable zero/null response before the first materialization. Other
modules never write `ReputationRecord` directly.
