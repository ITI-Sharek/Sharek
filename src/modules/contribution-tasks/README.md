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
- Optional `Idempotency-Key` values protect create, update, discard, publish,
  and cancel retries.
  Reusing a key for a different command payload returns a stable conflict.

## HTTP routes

```text
GET   /projects/:projectId/contribution-requests
POST  /projects/:projectId/contribution-requests
GET   /contribution-requests/:requestId
PATCH /contribution-requests/:requestId
POST  /contribution-requests/:requestId/discard
POST  /contribution-requests/:requestId/publish
POST  /contribution-requests/:requestId/cancel
GET   /tasks
GET   /tasks/:requestId
```

Draft and owner-command routes require a bearer session; `/tasks` reads are
public. Draft lookup deliberately returns the same
`CONTRIBUTION_REQUEST_NOT_FOUND` result for unknown and other-owner IDs.
Responses use dedicated DTOs and never expose Prisma row names or audit data.
Malformed Requirement shapes return the stable
`CONTRIBUTION_REQUEST_REQUIREMENT_INPUT_INVALID` code; semantic missing and
duplicate cases retain their more specific domain codes.

The owner Project list returns every Request grouped under an exhaustive
`byStatus` object (`draft`, `published`, `assigned`, `completed`, `cancelled`,
and `discarded`) plus `totalCount`. It uses ownership-only Project access, so
historical Requests remain visible after the Project is archived. Every group
is present even when empty, allowing the frontend to render stable lifecycle
sections without reconstructing them from local state.

## Implemented: public lifecycle (#49)

- Publication is an explicit active-owner command. It rechecks owned published
  Project access, draft completeness, close-time validity, and the active owner
  plan in the transaction. Owners without a current assignment receive the
  default Bronze entitlement. Monthly publication limits are Bronze 10, Silver
  20, and Gold 30; prior publications continue to count for their UTC calendar
  month after cancellation. The monthly enforcement gate is intentionally open
  in `NODE_ENV=development` for local QA against existing Projects, while test
  and production environments keep the plan limits enforced.
- `GET /tasks` and `GET /tasks/:requestId` are public reads. Both query only
  `published` Requests with a publication time and an Applications Close Time
  strictly after the server clock whose parent Project is still published.
  Draft, discarded, cancelled, assigned, completed, closed, and Requests on
  archived Projects share the audience-safe
  `CONTRIBUTION_REQUEST_NOT_FOUND` detail outcome.
- Feed filters are `q`, `technologies`, `difficulty`, and `hasReward`.
  Technology matches use any requested tag. Detail returns ordered
  Requirements with explicit `required`/`preferred` classification. A Request
  created from an accepted Proposal also exposes the proposer username for the
  approved public “Suggested by @username” attribution.
- Cancellation is an idempotent `published -> cancelled` owner command. It
  preserves the Request and calls the exported Applications service in the same
  transaction. Every pending Application becomes `request_cancelled` with an
  immutable audit; already terminal Applications remain unchanged. The owner
  may still cancel after the parent Project is archived so pending Applications
  are not stranded. Request and child Application audits share a correlation
  ID, and each child records the Request cancellation audit as its cause.

The exported `getApplicationSubmissionContext()` and transaction-scoped
`lockApplicationSubmissionContext()` capabilities expose only the Request
lifecycle, close time, owner, revision time, and ordered Requirements needed by
issue #50. Both also require the parent Project to remain published, including
under the transaction lock. Applications owns submission decisions and writes
no Contribution Request tables.

For Owner Decision acceptance (#51), the exported transaction-scoped
`assignFromOwnerDecision()` capability locks the Contribution Request, rechecks
the current Project owner through `ProjectsService`, checks actionable
`published` Request state, transitions it to `assigned`, and appends the
Request-owned audit on the caller's Prisma transaction. The companion
`reconfirmOwnerDecisionActor()` performs the same current-Project check for a
decline. This keeps the accepted Application, Assignment, sibling closure, and
Request state atomic while preserving table ownership.

For the Application review window (#52),
`lockApplicationReviewOwner()` locks the Request and asks the exported Projects
capability for its current owner on the scheduler's transaction. It returns
only that owner ID and does not change Request state.

## Persistence

Migration `20260728013000_contribution_request_drafts` preserves legacy request
rows, renames legacy technology/deadline columns, adds Applications Close Time,
creates ordered `contribution_request_requirements`, and creates append-only
`contribution_request_audits`. Only this module writes those tables.

Migration `20260728230000_contribution_request_publication` adds publication
and cancellation audit actions, the Application cancellation audit action, and
the actionable-discovery index. Publication asks the Projects module for the
canonical owner entitlement and monthly limit; this module does not read or
write Subscription records.

Focused verification:

```bash
npm test -- --runInBand src/modules/contribution-tasks/services/contribution-tasks.service.spec.ts src/modules/contribution-tasks/services/contribution-request-publication.service.spec.ts src/modules/contribution-tasks/services/public-contribution-requests.service.spec.ts src/modules/applications/applications.service.spec.ts test/contribution-requests.e2e-spec.ts test/contribution-request-public-lifecycle.e2e-spec.ts
```
