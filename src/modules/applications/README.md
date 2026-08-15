# Applications Module

Owns contributor Applications and their owner-review state transitions. The
DEC-078 Eligibility Evaluation runs before an Application exists; every
otherwise-valid submission that clears it enters `pending_owner_review`.

## Implemented: legacy state migration (#47)

Migration `20260728150000_application_owner_review_states` replaces the legacy
AI-validation states with `pending_owner_review`, `accepted`,
`declined_by_owner`, `not_selected`, `expired`, `withdrawn`, and
`request_cancelled`. It preserves accepted/withdrawn records, requires
`owner_reviewed_at` evidence before treating legacy `rejected` as an owner
decline, returns unresolved rows on actionable Requests to owner review, and
derives decision-neutral outcomes from terminal parent Requests.

The migration has a real PostgreSQL regression harness under
`test/migrations/`; `npm run test:migrations` executes it transactionally and
rolls back its isolated fixture schema. Invalid unresolved Applications attached
to non-actionable draft Requests fail closed instead of being invented as owner
queue entries.

## Public module service

`ApplicationsService.summarizePendingByContributionRequests()` is the batched
owner-workspace read contract. It accepts only server-produced Project/Request
scopes, reads Application-owned rows, and returns per-Project counts without
exposing statuses, contributor identities, bodies, or Prisma records.

Use a controller/service/DTO structure. Request task and skill information
through exported services. The applications service owns authorization, duplicate
checks, status transitions, and final decisions. Advisory Fit Assessments may
inform an owner but cannot write Application state.

## Implemented: submit and withdraw Applications (#50)

Active contributors submit through `POST /tasks/:requestId/applications` with a
Contribution Approach, Proposed Delivery Duration, and UUID idempotency key.
The service recomputes the DEC-078 gate inside the submission transaction; a
blocked request returns `403 APPLICATION_BLOCKED_SKILL_GAP` before creating an
Application. Its metadata includes the recorded `eligibilityEvaluationId` so
the contributor can request block-triggered guidance. Every gate-passing
Application enters `pending_owner_review`
immediately. Submission does not call the inference provider. It spends one of
the contributor's daily Applications only after the gate passes — see the daily
allowance section below.

The service fixes ordered Requirement and approved, audience-bounded Evidence
Snapshots plus contributor profile context in the submission transaction.
Evidence is limited to approved skill summaries whose generation still matches
the contributor's active GitHub App link, repository selection, and explicit
consent. Submission locks and revalidates that authorization in the same
transaction before fixing the snapshot; revoked or legacy unverifiable evidence
is excluded. Application submission cannot select or expand repository access.
A database uniqueness guard permits one Application per contributor and
Contribution Request. Append-only `ApplicationAudit` rows protect submission
and withdrawal retries.

Owners list pending Applications with `GET /tasks/:requestId/applications` and
inspect an authorized Application with `GET /applications/:applicationId`.
`Application.is_priority` exists in the schema but is never written or read:
priority Application visibility is an owner-subscription benefit and is not part
of Phase 1. The owner list is ordered by submission time.
The owning contributor withdraws a pending Application through
`POST /applications/:applicationId/withdraw`; withdrawal preserves history and
notifies the owner through the exported Notifications service.

Stable submission errors are `ALREADY_APPLIED`, `APPLICATIONS_CLOSED`,
`REQUEST_CANCELLED`, `REQUEST_TERMINAL`, `APPLICATION_NOT_AUTHORIZED`, and
`APPLICATION_DAILY_LIMIT_REACHED`. Terminal withdrawal returns
`APPLICATION_TERMINAL`.

## Implemented: the daily Application allowance (#109, DEC-079)

A free contributor may submit **1 Application per day**; a Gold contributor may
submit **5**. Both numbers are resolved through the subscriptions module's
`EntitlementsService`; this module holds neither of them.

`ApplicationDailyQuotaService` owns the rule. The counter is `UsageTracker`
keyed by (user, `application_submitted`, UTC calendar day), unique in the
database rather than by convention.

Two properties matter and are the reason the code is shaped the way it is:

- **The allowance is spent inside the submission transaction.** The advisory
  lock `pg_advisory_xact_lock('application_daily_quota:' || id)` is the first
  statement in that transaction, so a contributor's concurrent submissions
  queue instead of both reading the same tally and both passing. It is issued
  through `$executeRaw`: the function returns `void`, which Prisma cannot
  deserialize, and `$queryRaw` would throw `P2010` at runtime where no mocked
  test could see it. `pnpm run test:concurrency:application-quota` proves the
  behaviour against a real database.
- **Only a created Application costs a slot.** The reservation is the last
  check in the transaction, after the replay lookup, the request-state check and
  the duplicate check, so none of those spend the allowance. Anything that
  throws afterwards rolls the tally back with everything else.

**Withdrawal does not refund the allowance.** The owner has already spent
attention on the Application, and refunding would make withdraw-and-resubmit an
unlimited-application loop.

Exceeding the allowance returns `409 APPLICATION_DAILY_LIMIT_REACHED` carrying
`used`, `limit`, and `resetsAt` — the exact UTC instant the allowance refills,
so the UI can state it rather than approximate it. The boundary is UTC, not the
contributor's local midnight: one global boundary is the only version of the
rule that stays true when a contributor travels or changes their device clock.

The Phase 0 eligibility gate is checked **before** this reservation, so a
contributor never burns a daily Application on a task the gate blocks. A blocked
submission creates no Application, snapshot, or Application audit row and
records one append-only Eligibility Evaluation instead.

## Implemented: Owner Decisions and Assignments (#51)

The current Project owner accepts or declines a pending Application through
`POST /applications/:applicationId/accept` and
`POST /applications/:applicationId/decline`. Both commands require a UUID
`Idempotency-Key`, recheck ownership and lifecycle state inside the transaction,
and create one immutable `OwnerDecision`.

Ownership is revalidated against the current Project row through the exported,
transaction-scoped Projects capability; the denormalized Request owner is not an
authorization source. Replay lookup happens only after that check.

Acceptance assigns the Contribution Request in the same transaction, creates
exactly one `Assignment`, and derives its due date from the acceptance timestamp
plus the Application's Proposed Delivery Duration. Other pending Applications
become `not_selected` through Application audits only; they do not receive
decline decisions or feedback. Decline trims and requires feedback, changes only
the selected Application, and creates no Assignment.

The database permits null feedback for accepted decisions but enforces non-null,
non-blank feedback for declines with `btrim`. Unique Request, Application, and
Owner Decision assignment keys protect concurrent acceptance. AI assessment data
is absent from queue and transition predicates and remains informational only.
Durable accepted, declined, and not-selected notifications are deduplicated and
written on the decision transaction; realtime emission is deferred until commit.

`getOwnerDecisionReportContext()` is the narrow exported read used by the admin
module. It exposes an explicit declined decision only to its affected
contributor; reporting does not mutate or reopen the Application.

Authorized Application detail returns nullable Owner Decision and Assignment
projections. This makes the declined decision identifier and feedback available
to the affected contributor before they invoke the moderation-report route.
Owner review access is based on current Project ownership and remains available
after Project archival, so pending Applications cannot become stranded.

Issue #49 still owns publication, discovery, cancellation commands, and their
Application side effects. This module consumes only the exported read/lock
submission context from `contribution-tasks`.

`ApplicationReputationFactsService` is an exported, read-only boundary for the
Reputation projection coordinator. It counts all Assignments for one
contributor and lists distinct assigned contributor IDs in deterministic,
bounded batches. It never calculates or writes reputation.

Issue #49 adds the exported transaction-scoped
`cancelPendingForRequest()` capability. Contribution Request cancellation calls
it after locking the Request; the Applications module locks and changes only
its own pending rows to `request_cancelled` and appends one immutable audit per
transition. Each child audit carries the cancellation reason, a shared
correlation ID, and the parent Request audit ID as causation. Terminal
Application history is not rewritten.

## Implemented: owner review window (#52)

Every new Application persists its day-3 reminder and day-7 expiry boundaries.
Authorized Application projections expose `overdue: true` from the inclusive
day-5 boundary while the status remains `pending_owner_review`, plus nullable
`expiredAt` for the terminal expiry timestamp.

`ApplicationReviewWindowWorker` registers one repeatable BullMQ sweep and one
startup catch-up job. PostgreSQL remains the source of truth: the worker passes
an explicit clock to `ApplicationReviewWindowService`, which scans bounded
batches, processes expiry before reminders, and conditionally rechecks pending
state at each write. Redis downtime therefore delays work without losing it.

At day 3, the service resolves the current Project owner through exported,
transaction-scoped Contribution Tasks and Projects capabilities. It atomically
stores `review_reminder_sent_at` and one durable, deduplicated owner
notification. At day 7, it atomically changes only the due pending Application
to `expired`, stores `expired_at`, appends an `ApplicationAudit` with a null
system actor, and notifies the contributor. Expiry is decision-neutral: it
does not write reputation, eligibility, profile, sibling Application, Request,
or Assignment state.

Owner Decision commands also compare the persisted expiry boundary with their
transaction clock before writing. An accept or decline at or after day 7 is
rejected as terminal even when a delayed sweep has not persisted `expired` yet.

Retries, duplicate jobs, and owner-decision races are safe because the marker,
status transition, audit, and notification use transaction guards and durable
deduplication. Exact pre-boundary, boundary, post-boundary, retry, duplicate,
and race behavior is covered with a controlled clock.

Review-window policy uses named day-3 reminder, day-5 overdue, and day-7 expiry
constants. The queue and worker share one enabled-state resolver, and focused
tests directly cover marker-only reminders, side-effect-free overdue reads,
overdue and expired decisions, both race directions, decision-neutral expiry,
deterministic audit keys, exhausted worker retries, and the unchanged public
route inventory.

## Implemented: Advisory Fit Assessment (#53)

The current Project owner may request one advisory assessment for a pending
Application through `POST /applications/:applicationId/assessment-requests`.
The body contains a UUIDv4 `idempotencyKey`; the request fixes the immutable
Requirement and authorized Evidence Snapshots already stored on the
Application. `GET /applications/:applicationId/assessment` returns the latest
owner-scoped request, findings, derived fit band, and first-presentation time.

NestJS calls the separate FastAPI contract only after it confirms that the
Application is still pending and that the fixed evidence snapshot contains
assessable evidence. Before transport it converts authorized approved-skill
evidence into bounded capsules and sends an exact evidence-ID allowlist rather
than the opaque persisted snapshot. It validates one finding per Requirement, requirement
kind, citation scope, finding vocabulary, and confidence before storing the
attempt and append-only audit rows. NestJS derives `STRONG`, `PARTIAL`,
`LIMITED`, or `UNKNOWN`; Preferred Requirements never change the band.

System limits and missing evidence do not create attempts. Terminal races are
recorded as `CANCELLED_NOT_NEEDED`. Provider failures or invalid responses
append an immutable failed attempt with safe provider metadata and return
`UNAVAILABLE`; a new idempotency key may retry that request once, with the
retry linked to the prior attempt, after which `ASSESSMENT_RETRY_LIMIT_REACHED`
is returned. Assessment projections expose `retryAvailable`, so clients do not
duplicate the bounded-attempt policy or offer an exhausted retry. No assessment
result changes Application state, visibility, owner
decisions, Assignments, or contributor eligibility. Reading an assessment
performs no writes, so it is safe to prefetch, retry, or poll while a request is
still being processed. The first authorized owner presentation is recorded only
by the explicit presentations command, protected by a unique durable marker, and
audited exactly once including when concurrent calls race.

Focused verification:

```bash
npm test -- --runInBand src/modules/applications/applications.service.spec.ts test/applications.e2e-spec.ts src/modules/notifications/notifications.service.spec.ts
npm test -- --runInBand src/modules/applications/services/application-review-window.service.spec.ts src/modules/applications/jobs/application-review-window.queue.spec.ts src/modules/applications/jobs/application-review-window.worker.spec.ts
```

## Exported Delivery submission context (TASK-5-02)

`lockDeliverySubmissionContext()` locks the Application on the caller's Prisma
transaction, verifies that the actor is its assigned contributor, and requires
the canonical `accepted` state. It returns only Application, Contribution
Request, contributor, and status facts; the Delivery Reviews module owns every
Delivery write.
`listDeliveryLifecycleContextsForContributor()` and the request-scoped owner
variant expose Application status, contributor identity, optional Assignment
dates, and Request title so Delivery Reviews can compose both dashboards
without reading Application-owned tables.
