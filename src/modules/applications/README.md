# Applications Module

Owns contributor Applications and their owner-review state transitions. Every
otherwise-valid Application enters `pending_owner_review`; AI eligibility is not
an Application gate.

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
Every valid Application enters `pending_owner_review` immediately. Submission
does not call AI or mutate contributor attempt quotas.

The service fixes ordered Requirement and approved, audience-bounded Evidence
Snapshots plus contributor profile context in the submission transaction. Evidence is
limited to approved skill summaries derived from repositories the contributor explicitly
authorized when generating the skill profile; Application submission cannot select or
expand repository access. A database uniqueness guard permits
one Application per contributor and Contribution Request. Append-only
`ApplicationAudit` rows protect submission and withdrawal retries.

Owners list pending Applications with `GET /tasks/:requestId/applications` and
inspect an authorized Application with `GET /applications/:applicationId`.
The owning contributor withdraws a pending Application through
`POST /applications/:applicationId/withdraw`; withdrawal preserves history and
notifies the owner through the exported Notifications service.

Stable submission errors are `ALREADY_APPLIED`, `APPLICATIONS_CLOSED`,
`REQUEST_CANCELLED`, `REQUEST_TERMINAL`, and `APPLICATION_NOT_AUTHORIZED`.
Terminal withdrawal returns `APPLICATION_TERMINAL`.

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

Issue #49 still owns publication, discovery, cancellation commands, and their
Application side effects. This module consumes only the exported read/lock
submission context from `contribution-tasks`.

Focused verification:

```bash
npm test -- --runInBand src/modules/applications/applications.service.spec.ts test/applications.e2e-spec.ts src/modules/notifications/notifications.service.spec.ts
```
