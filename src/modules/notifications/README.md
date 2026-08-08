# Notifications Module

Owns in-app notification records and notification-write workflows.

## Current API

Authenticated users can use the durable inbox routes:

- `GET /notifications?limit=50` returns the newest notifications and the full
  unread count (the limit is bounded to 1-100).
- `PATCH /notifications/:notificationId/read` marks one of the caller's rows
  as read; another user's notification cannot be changed.
- `PATCH /notifications/read-all` marks all of the caller's unread rows as
  read.

## Current WebSocket Surface

- Namespace: `/notifications`
- Client auth: `auth.token` with the same opaque access token used by HTTP APIs
- Server event: `notification.created`
- Unauthorized event before disconnect: `notifications.error`

## Structure

```text
notifications.module.ts
notifications.service.ts
notifications.service.spec.ts
notifications.gateway.ts
notifications.gateway.spec.ts
dto/
README.md
```

`NotificationsService` writes `Notification` rows for user-facing events. Other
modules request notifications through this exported service instead of writing
the `notifications` table directly.

`NotificationsGateway` authenticates socket connections against existing access
token sessions and joins each socket to a per-user room. Stored notifications
are emitted to the recipient's room after persistence. Offline users still keep
the durable notification row.

Current supported workflow:

- skill-review outcome notifications for contributors after admin approval or
  rejection.
- idempotent Application-submitted and Application-withdrawn notifications for
  Project owners, deduplicated by Application and action before realtime
  delivery.
- idempotent accepted, declined-by-owner, and not-selected Application outcomes
  for contributors. The not-selected message is decision-neutral and does not
  imply a decline, eligibility failure, or reputation effect.
- idempotent day-3 Application review reminders for the current Project owner
  and day-7 expiry notifications for contributors. Expiry copy explicitly
  states that owner silence is not rejection and has no eligibility or
  reputation effect.
- idempotent Contribution Proposal revision-request, accepted, and declined
  notifications for the proposer, with the resulting draft Request ID attached
  to accepted notifications.
- idempotent skill-profile generation notifications for ready-for-review,
  needs-more-evidence, and failed outcomes. Each generation/status pair is
  deduplicated and includes the generation ID plus bounded counts in metadata.
  The additive migration also backfills existing `pending_review` generations
  once, so users do not lose a completed result created before this workflow.

Owner Decision and Application review-window workflows pass their Prisma
transaction into the notification service so durable rows commit atomically
with the state transition or reminder marker. Realtime delivery happens only
after the transaction commits.
Contribution Proposal response workflows use the same transaction-aware
notification contract.

The frontend loads this inbox after authentication and merges it with the
Socket.IO stream. Read actions update the database and optimistically update the
UI; a failed request refreshes the durable inbox. Future delivery channels,
task-match alerts, and premium-tier notification rules should stay in this
module.
