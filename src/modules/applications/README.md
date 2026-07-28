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
