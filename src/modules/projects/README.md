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
  legacy AI eligibility states are not treated as an owner queue. Quota usage
  counts Request publications by `published_at` in the current UTC month and
  reports the same Free 5 / Gold 30 entitlement used at
  publication.
- `GET|PATCH /projects/me/:projectId`: persisted-owner detail and editable
  presentation fields. Unknown and non-owned IDs share `PROJECT_NOT_FOUND`.
- `PUT /projects/me/:projectId/hero-image`: owner-only multipart replacement of
  a draft or published Project hero image. It requires `Idempotency-Key` and
  `expectedRevision`, accepts only signature-validated PNG/JPEG/WebP files up
  to 5 MB, and increments the Project revision.
- `GET /projects/me/:projectId/hero-image`: owner-only delivery of the current
  hero image. `GET /public/projects/:projectSlug/hero-image` delivers the same
  image only when that Project is published.
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
  source attribution is withheld. Public GitHub-backed responses additionally
  expose only persisted `stars`, `forks`, contributor count, default branch,
  latest commit time, source-update time, bounded recent-commit summaries,
  root file-entry summaries, and a bounded default-branch recursive tree; they
  never spread the provider snapshot JSON. The Project owner card is present
  only for an active owner with a public profile and contains name, username,
  avatar URL, and published-Project count.
- `GET /public/projects/:projectSlug/applicants`: public, bounded applicant
  cards for the published Project. Only active contributors whose profile is
  public are included; the projection excludes contribution approaches,
  evidence, assessments, requirements, owner decisions, and delivery data.
- `GET|POST|DELETE /public/projects/:projectSlug/save`: authenticated reader
  saved-state read, idempotent save, and idempotent unsave for a published
  Project. Saved Projects are private to the reader.
- `GET /projects/discover`: authenticated filtered discovery over published
  projects only (existing Sprint 3 contract).
- `POST /projects/import/github`: retired compatibility route; returns
  `410 PROJECT_IMPORT_ROUTE_RETIRED` and performs no write.

Every side-effecting canonical command requires an `Idempotency-Key`; mutable
commands also require `expectedRevision`. Project creation, successful state
transitions, transition audit facts, and command receipts use transactions.
Owner-route Project IDs are validated as UUIDv4 values at the HTTP boundary,
and presentation titles are trimmed before their non-empty length check.

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
`lockContributionRequestProjectOwnerContext()` returns the same minimal locked
projection without requiring a pre-known owner ID. The scheduled Application
review workflow uses it to address day-3 reminders to the current Project owner;
it does not treat the denormalized Request owner as authoritative.
`getProposalProjectContext()` and `lockProposalProjectContext()` expose the same
minimal ID/owner/status projection to Contribution Proposals; the lock variant
keeps proposal submission and intake commands consistent with Project state.
`listContributionRequestProjectReferences()` exposes only Project ID, title,
and slug projections for published Projects in public Contribution Request
discovery; callers may resolve known IDs or search titles without joining
Project-owned tables. Separate owner-only access capabilities permit a Request
on an archived Project to be cancelled, while publication, discovery, and new
Application submission continue to require a published Project. The canonical
owner-plan lookup used by publication and the owner dashboard also lives here.

The module writes `Project`, `ProjectOperation`, and
`ProjectStateTransition`. It calls exported GitHub services for normalized
repository evidence/control and the exported Identity service for immutable
GitHub identity. It never reads provider tokens or GitHub App credentials.

Migration `20260728120000_project_publication_owner_flow` adds platform slugs,
optimistic revisions, source status fields, archive timestamps, command
receipts, transition audits, removes global draft URL uniqueness, and adds the
partial unique published-repository guard.

Migration `20260817193000_saved_projects` adds the reader-private
`SavedProject` join table with a composite primary key and cascade cleanup.

Migration `20260818110000_project_hero_images` adds nullable image bytes and a
validated MIME type to `Project`. The bytes are never included in JSON Project
responses; owner and public projections expose a URL only when an image exists.
