# Delivery Reviews Module

Owns Delivery submissions, immutable submission versions, owner review history,
feedback, and ratings for accepted Applications (TASK-5-02; FR-007–009,
FR-020, FR-060–065).

## HTTP interface

- `POST /applications/:applicationId/deliveries` — the accepted contributor
  submits a canonical GitHub pull-request URL and optional notes.
- `PATCH /deliveries/:deliveryId` — the contributor corrects the current PR or
  resubmits after requested changes; every command creates an immutable
  `DeliverySubmission` version.
- `GET /deliveries/:deliveryId` — the assigned contributor or current Project
  owner reads current state plus submission and review history.
- `GET /owner/deliveries` — the active owner lists `submitted` and
  `resubmitted` Deliveries with ordered Contribution Request requirements.
- `GET /me/deliveries` — the active contributor reads the composed lifecycle;
  it spans every Application outcome through Delivery completion and exposes
  the nested Delivery state separately (`NOT_STARTED` when accepted with no
  Delivery).
- `GET /owner/delivery-lifecycle` — the active owner reads the same composed
  lifecycle for Applications on owned Contribution Requests.
- `POST /deliveries/:deliveryId/reviews` — the current Project owner approves,
  requests changes, or rejects the current submission.

All write commands require a UUIDv4 `Idempotency-Key`. A retry with the same
payload returns the existing result; key reuse with different content is a
stable conflict. Pull-request URLs must match
`https://github.com/{owner}/{repository}/pull/{number}`.

## Workflow and ownership

The module writes `Delivery`, `DeliverySubmission`, `DeliveryReview`, and the
durable `DeliveryApprovedEvent` outbox.
It asks the exported Applications capability to lock and verify the accepted
assignee, and the exported Contribution Tasks capability to resolve the current
Project owner and complete the Request. Durable semantic `delivery_update`
Notifications are created on the caller transaction and emitted through the
shared realtime path only after commit.

Canonical persisted states are `submitted`, `changes_requested`, `resubmitted`,
`approved`, and `rejected`. Approval requires a 1–5 rating, changes requested
and rejection require non-blank feedback, and only approval changes the
Contribution Request to `completed`. Every new submission/resubmission notifies
the current owner; every review outcome notifies the contributor and includes
required owner feedback where applicable.

Approval appends a rating-bearing `DeliveryApprovedEvent` in the same
transaction. `DeliveryApprovedEventsService` is the durable polling and
acknowledgement boundary for the Reputation reaction.

For TASK-5-04, `DeliveryReputationProjectionService` groups pending approval
facts by contributor, rebuilds each contributor projection from authoritative
Application/Delivery/Request facts, and acknowledges an event only after the
Reputation-owned write succeeds. A BullMQ worker runs that outbox pass before a
bounded reconciliation of assigned contributors, so assignment and rejection
changes are reflected without inventing negative rating entries. PostgreSQL is
authoritative; Redis loss delays processing but does not lose approval facts.
The worker is controlled by `DELIVERY_REPUTATION_QUEUE_ENABLED` and
`DELIVERY_REPUTATION_SWEEP_INTERVAL_MS`.

Migrations `20260811090000_delivery_submission_idempotency`,
`20260811091000_delivery_submission_history`, and
`20260811092000_delivery_review_workflow`, and
`20260811093000_delivery_approved_event_outbox` align the legacy schema with the
canonical state machine, preserve existing Delivery evidence, allow one review
per submission version, and add Request-completion audit support.

Focused verification:

```bash
npm test -- --runInBand test/delivery-reviews.e2e-spec.ts
npm test -- --runInBand src/modules/notifications/templates/notification-template.catalog.spec.ts src/modules/notifications/notifications.service.spec.ts
```
