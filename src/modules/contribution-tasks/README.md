# Contribution Requests Module

This module owns Contribution Request records, their ordered Requirements, and
their immutable lifecycle audit. New domain code uses **Contribution Request**;
the directory keeps its historical `contribution-tasks` name to avoid a broad
module rename.

## Implemented: private draft lifecycle (#48)

- An authenticated active owner can create a draft for a Project they own only
  when that Project is already published.
- Ownership is derived from the session. Client-supplied owner identifiers are
  rejected by DTO whitelisting.
- Project facts are requested through the exported
  `ProjectsService.getContributionRequestProjectAccess()` and transaction-scoped
  `lockContributionRequestProjectAccess()` capabilities. This module never
  reads or writes Project tables directly.
- Required and Preferred Requirements are ordered relational rows. Technology
  tags remain separate request metadata.
- Draft update uses an optimistic `updated_at` predicate inside a transaction.
- Project ownership and publication are revalidated on that same transaction
  connection before every draft write.
- Discard is the terminal, idempotent `discarded` transition; it never deletes
  the request and appends one immutable audit row.
- Optional `Idempotency-Key` values protect create, update, and discard retries.
  Reusing a key for a different command payload returns a stable conflict.

## HTTP routes

```text
POST  /projects/:projectId/contribution-requests
GET   /contribution-requests/:requestId
PATCH /contribution-requests/:requestId
POST  /contribution-requests/:requestId/discard
```

All routes require a bearer session. Draft lookup deliberately returns the
same `CONTRIBUTION_REQUEST_NOT_FOUND` result for unknown and other-owner IDs.
Responses use dedicated DTOs and never expose Prisma row names or audit data.
Malformed Requirement shapes return the stable
`CONTRIBUTION_REQUEST_REQUIREMENT_INPUT_INVALID` code; semantic missing and
duplicate cases retain their more specific domain codes.

## Not implemented: public lifecycle (#49)

Publication, public discovery, filters, cancellation, request entitlement
limits, and Application side effects remain issue #49 work. Issue #47 now
provides the approved owner-review states and terminal `request_cancelled`
transition; issue #49 should consume those states without recreating their
migration in this module.

The exported `getApplicationSubmissionContext()` and transaction-scoped
`lockApplicationSubmissionContext()` capabilities expose only the Request
lifecycle, close time, owner, revision time, and ordered Requirements needed by
issue #50. Applications owns submission decisions and writes no Contribution
Request tables.

For Owner Decision acceptance (#51), the exported transaction-scoped
`assignFromOwnerDecision()` capability locks the Contribution Request, rechecks
the current Project owner through `ProjectsService`, checks actionable
`published` Request state, transitions it to `assigned`, and appends the
Request-owned audit on the caller's Prisma transaction. The companion
`reconfirmOwnerDecisionActor()` performs the same current-Project check for a
decline. This keeps the accepted Application, Assignment, sibling closure, and
Request state atomic while preserving table ownership.

## Persistence

Migration `20260728013000_contribution_request_drafts` preserves legacy request
rows, renames legacy technology/deadline columns, adds Applications Close Time,
creates ordered `contribution_request_requirements`, and creates append-only
`contribution_request_audits`. Only this module writes those tables.

Focused verification:

```bash
npm test -- --runInBand src/modules/contribution-tasks/contribution-tasks.service.spec.ts test/contribution-requests.e2e-spec.ts
```
