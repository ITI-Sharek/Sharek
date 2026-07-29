# Application Review Window Implementation Plan

**Issue:** GitHub #52, `[S4-B06] Remind owners and expire unattended Applications`
**Parent:** GitHub #46, Sprint 4 contribution workflows
**Dependency:** GitHub #51 owner review and decision implementation (present on
`main` through merged PR #63)
**Owning modules:** `applications`, with exported capabilities from
`contribution-tasks`, `projects`, and `notifications`

## Outcome

Implement the canonical owner-review window without introducing a public write
endpoint or an AI decision gate:

- at day 3, send one durable reminder to the Project's current owner;
- at day 5, expose a deterministic `overdue` presentation flag;
- at day 7, change an undecided Application from `PENDING_OWNER_REVIEW` to
  `EXPIRED`, append a system audit record, and notify the contributor;
- never change reputation, eligibility, profile data, sibling Applications, or
  an Application that has already reached another state.

All boundaries are inclusive and use the persisted timestamps created at
submission. Scheduled execution accepts an explicit clock value so tests do not
depend on wall-clock timing.

## Architecture and ownership

1. `applications` owns the sweep processor, Application state transition,
   reminder delivery marker, expiry timestamp, and Application audit.
2. `contribution-tasks` resolves the Application's Request and delegates to an
   exported `projects` capability to lock and return the current Project owner.
   The scheduler does not trust the Request's denormalized owner.
3. `notifications` creates durable, deduplicated reminder and expiry
   notifications inside the caller's transaction. Realtime delivery happens
   only after commit.
4. A BullMQ worker invokes the Applications service. BullMQ contains no domain
   decisions and Redis is not the source of truth.
5. Redis connection parsing is a technical shared helper used by both queue-owning
   modules; no module imports another module's job implementation.

## Persistence and migration

- Add nullable `Application.review_reminder_sent_at` as the durable day-3
  delivery marker.
- Add `expired` to `ApplicationAuditAction`.
- Allow `ApplicationAudit.actor_id` to be null for the day-7 system transition;
  no human is falsely attributed as the actor.
- Add indexes supporting pending reminder and expiry scans.
- Extend the isolated PostgreSQL migration harness to validate the new enum,
  nullable system actor, marker, indexes, and a representative expiry audit.

The migration is additive except for making the audit actor nullable. No data
backfill is required: existing pending Applications already contain
`review_due_at` and `expires_at`, so the first successful sweep catches up.

## Scheduling and idempotency

- Register one repeatable sweep job with configurable interval and batch size.
- Run one catch-up sweep at worker startup.
- Configure bounded retries with exponential backoff.
- Process expiry before reminders so an Application cannot receive a stale
  day-3 reminder once its day-7 boundary is due.
- Recheck `status = PENDING_OWNER_REVIEW` in every conditional update.
- Store reminder marker and notification atomically.
- Store expiry state, system audit, and contributor notification atomically.
- Rely on Notification deduplication plus Application state/marker guards so
  retries and duplicate job delivery have no duplicate external effect.

## API contract

No route is added. Authorized Application projections gain:

- `expiredAt: Date | null`;
- `overdue: boolean`, true only while status remains pending and the day-5
  boundary has been reached.

Existing authorization and safe-not-found behavior remain unchanged.

## Verification

Focused tests will cover:

- immediately before, exactly at, and immediately after day 3, day 5, and day 7;
- repeat delivery and BullMQ retry configuration;
- transaction rollback followed by retry;
- owner decision racing expiry;
- current Project owner reminder routing;
- terminal Application protection;
- exactly one audit and notification per expiry;
- absence of reputation, eligibility, profile, and sibling-Application writes.

Required gates are `check:architecture`, lint, exact type-check, Prisma
validation, migration regression, focused and full Jest suites, build, and
`git diff --check`.

## Rollout and operational controls

- `APPLICATION_REVIEW_QUEUE_ENABLED` controls worker startup.
- `APPLICATION_REVIEW_SWEEP_INTERVAL_MS` controls recurrence.
- `APPLICATION_REVIEW_SWEEP_BATCH_SIZE` bounds each phase of a sweep.
- Disabling the worker pauses processing without losing deadlines; enabling it
  later performs catch-up from PostgreSQL.
- The change can be rolled back operationally by disabling the queue. Reverting
  code does not require dropping the additive column, enum value, or indexes.
