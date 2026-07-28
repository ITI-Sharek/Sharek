# Projects Module

Owns GitHub-backed project drafts, owner-controlled presentation, explicit
publication/archive transitions, publication idempotency receipts, and public
project visibility.

## Current API

- `POST /projects/github/preview`: active owner/contributor preview of an
  allowed public or GitHub-App-selected repository. The response is allowlisted
  and the interaction performs no Project write.
- `POST /projects`: idempotent confirmation of a preview into a private draft.
  The authenticated account becomes the persisted owner; request bodies cannot
  supply owner or status.
- `GET /projects/me`: cursor-paginated owner workspace for active owners and
  contributors, including revision, request/application counters, and quota.
  `pendingApplicationsCount` includes only `pending_owner_review` Applications;
  legacy AI eligibility states are not treated as an owner queue.
- `GET|PATCH /projects/me/:projectId`: persisted-owner detail and editable
  presentation fields. Unknown and non-owned IDs share `PROJECT_NOT_FOUND`.
- `POST /projects/me/:projectId/source/refresh`: idempotent source refresh that
  preserves fields marked as manual overrides.
- `POST /projects/me/:projectId/publish`: explicit `draft -> published`
  transition. It validates revision, required metadata, live repository
  identity, personal GitHub identity or selected GitHub App control, and the
  one-published-project-per-repository invariant.
- `POST /projects/me/:projectId/archive`: explicit `published -> archived`
  transition. Published projects never return directly to draft.
- `GET /public/projects` and `GET /public/projects/:projectSlug`: public,
  cursor-paginated, allowlisted reads that query only `published` rows. Private
  source attribution is withheld.
- `GET /projects/discover`: authenticated filtered discovery over published
  projects only (existing Sprint 3 contract).
- `POST /projects/import/github`: retired compatibility route; returns
  `410 PROJECT_IMPORT_ROUTE_RETIRED` and performs no write.

Every side-effecting canonical command requires an `Idempotency-Key`; mutable
commands also require `expectedRevision`. Project creation, successful state
transitions, transition audit facts, and command receipts use transactions.

## Boundaries and persistence

`ProjectsController` binds authenticated owner commands and delegates to
`ProjectPublicationService`. `PublicProjectsController` delegates public reads
to `PublicProjectsService`. `ProjectsService` retains owner-dashboard,
discovery, and exported admin-summary behavior. Owner-dashboard pending counts
come through the exported `ApplicationsService`; Projects does not interpret
Application lifecycle states.

`ProjectsService.getContributionRequestProjectAccess()` exposes the minimal
owner/publication facts needed by the Contribution Requests module.
`lockContributionRequestProjectAccess()` provides the same check with a shared
Project-row lock on the caller's write transaction so an archive or ownership
change cannot race a Contribution Request mutation.
`listContributionRequestProjectReferences()` exposes only Project ID, title,
and slug projections for public Contribution Request discovery; callers may
resolve known IDs or search titles without joining Project-owned tables.

The module writes `Project`, `ProjectOperation`, and
`ProjectStateTransition`. It calls exported GitHub services for normalized
repository evidence/control and the exported Identity service for immutable
GitHub identity. It never reads provider tokens or GitHub App credentials.

Migration `20260728120000_project_publication_owner_flow` adds platform slugs,
optimistic revisions, source status fields, archive timestamps, command
receipts, transition audits, removes global draft URL uniqueness, and adds the
partial unique published-repository guard.
