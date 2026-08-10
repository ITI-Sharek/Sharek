# Notifications Module

Owns semantic in-app Notification records, localized presentation, and
notification-write workflows.

## Current API

All routes derive the recipient from the authenticated access-token session:

- `GET /notifications` lists retained, localized presentations using an opaque
  `(created_at,id)` cursor and optional read-state/category filters, together
  with the retained unread count.
- `GET /notifications/unread-count` returns the retained unread total.
- `PATCH /notifications/:notificationId/read-state` is an idempotent read or
  unread command and conceals missing, expired, and other-user records.
- `POST /notifications/mark-all-read` updates only the caller's committed
  snapshot and appends one read-state event per changed item.
- `PATCH /notifications/:notificationId/read` and
  `PATCH /notifications/read-all` retain the earlier inbox command paths while
  delegating to the same durable read-state workflow.
- `GET/PATCH /me/notification-preferences` owns retention, quiet hours, and
  sparse category overrides with optimistic revision checks.

HTTP response DTOs expose only semantic identity, localized copy, trusted deep
links, priority, read state, timestamps, and aggregate version. Parameters,
legacy rendered columns, deduplication keys, recipient IDs, and publication
metadata remain private.

## Current Realtime Surface

- Namespace: `/realtime`
- Transport: WebSocket only
- Client auth: `auth.token` or `Authorization: Bearer` with the same opaque
  access token used by HTTP APIs
- Server events: version-one `notification.created` and
  `notification.read_state_changed` envelopes
- Recipient room: `user:<authenticated-user-id>`
- Unauthorized event before disconnect: `realtime.error` with
  `REALTIME_UNAUTHORIZED`

`REALTIME_NOTIFICATIONS_ENABLED` controls the shared transport and defaults to
`false` for safe rollout. When enabled, bootstrap attempts Redis
publisher/subscriber fan-out; a Redis outage leaves HTTP and local Socket.IO
delivery available while durable Notification rows/events remain authoritative.
The legacy `/notifications` namespace has been retired after the client cutover;
all Notification delivery uses the shared `/realtime` transport.

## Structure

```text
notifications.module.ts
notifications.service.ts
notifications.service.spec.ts
notification-retention.service.ts
jobs/notification-retention.queue.ts
jobs/notification-retention.worker.ts
dto/
README.md
```

`NotificationsService` writes `Notification` rows for user-facing events. Other
modules request notifications through this exported service instead of writing
the `notifications` table directly.

New writes persist a versioned `template_key`, audience-safe `parameters`, a
trusted relative `deep_link`, priority, and aggregate version. Rendered
`title`, `message`, and legacy `metadata` remain nullable only for the
coordinated migration window and are not populated by new writes. The
`NotificationPresenterService` renders the retained semantic record in Arabic
or English and returns an explicit public presentation shape; unknown template
versions use generic safe localized copy.

The additive semantic migration also creates the Notification event-outbox and
preference tables required by the next implementation slices. Every current
skill-review, Application, and Proposal Notification creation now appends one
`created` event in the same transaction. Direct calls use a module-owned
transaction; workflows may supply their existing transaction. Shared realtime
publication runs only after commit, and publication failure does not remove the
durable row/event.

The `NotificationInboxService` reads the current identity language on every
presentation and applies the recipient's current retention choice. Read-state
mutations use conditional aggregate-version updates and append durable
`read_state_changed` events in the same transaction. The preferences service
validates retention, complete overnight quiet-hour ranges, IANA time zones, and
required in-app categories before a revisioned update. `NotificationRealtimeService`
renders the current semantic DTO after commit, wraps it in a version-one
envelope, publishes it through the generic shared publisher, and records
best-effort outbox handoff metadata. A bounded BullMQ recovery worker revisits
unpublished events by stable event ID, retries handoff with a capped attempt
count, and records safe operational error codes without affecting the durable
HTTP response. A separate bounded BullMQ retention worker resolves each
recipient's current retention choice, deletes only expired Notification rows,
and relies on the existing foreign-key cascade for NotificationEvent rows.
Originating workflow and audit records are not queried or changed.

Retention scheduling is controlled by `NOTIFICATION_RETENTION_QUEUE_ENABLED`,
`NOTIFICATION_RETENTION_INTERVAL_MS`, and
`NOTIFICATION_RETENTION_BATCH_SIZE`. The cleanup cutoff is strict: a row at
exactly the recipient's retention boundary is retained until the next boundary
tick.

`RealtimeGateway` authenticates socket connections against existing access token
sessions and joins each socket to a per-user room. Stored notifications and
read-state changes are emitted to the recipient's room after persistence.
Offline users still keep the durable notification row/event. The technical
gateway has no process-local socket map; cross-instance fan-out belongs to the
Redis adapter.

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
- idempotent semantic skill-profile generation notifications for
  ready-for-review, needs-more-evidence, and failed outcomes. Each
  generation/status pair is deduplicated, appends its durable event atomically,
  and includes only the generation ID, audience, and bounded counts in private
  template parameters. Ready-for-review also creates one recipient-scoped item
  per active admin. Additive migrations backfill existing `pending_review`
  generations once so users and admins do not lose completed results.

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
module. The technical cross-module socket adapter belongs under
`src/shared/realtime`; it must not own Notification persistence or policy.
