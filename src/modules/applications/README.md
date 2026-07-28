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

Issue #49 still owns publication, discovery, cancellation commands, and their
Application side effects. This module consumes only the exported read/lock
submission context from `contribution-tasks`.

Focused verification:

```bash
npm test -- --runInBand src/modules/applications/applications.service.spec.ts test/applications.e2e-spec.ts src/modules/notifications/notifications.service.spec.ts
```
