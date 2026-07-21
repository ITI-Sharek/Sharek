# Phase 0 Research: GitHub-Backed Project Draft and Publication

**Feature**: Jira SK-112 / `specs/003-github-project-publication/spec.md`  
**Dependency**: Jira SK-107  
**Authority**: constitution v3.0.0, 2026-07-21 canonical decisions, ADR-002

## 1. Brownfield Scope and Module Ownership

**Decision**: Extend the existing `projects` and `github` modules and add only
minimum exported readers to the existing `identity`, `contribution-tasks`, and
`applications` modules. `projects` orchestrates preview and owns drafts, owner
metadata, source snapshots, refresh attempts, idempotency receipts, publication
state, and audit records. `github` owns provider clients, credentials,
installations, selections, webhooks, and current repository authorization/control
checks. `identity` owns account state/provider association;
`contribution-tasks` owns request aggregates; `applications` owns application
aggregates.

**Rationale**: This follows ADR-002 and the repository ownership map. The
existing `ProjectsService -> GitHubEvidenceService` dependency is reusable, but
the exported GitHub DTO must become authorization-aware and redaction-safe.
Current `ProjectsService.getMyProjects` directly reads contribution-request and
application relations, and `listPublishedProjectOwners` directly selects User
fields; touching these paths requires replacing those reads with typed exported
service calls rather than preserving a known boundary violation.

**Alternatives considered**: A new import module would duplicate completed
behavior and split project ownership. A shared repository service would place
provider business logic in `shared/`. Leaving cross-table joins in Projects
would contradict module ownership. Clean Architecture ports/use cases would
violate ADR-002 without adding another implementation.

## 2. Eligible Account Modes and Resource Authorization

**Decision**: Ordinary project-owning interactions require an active
authenticated account whose persisted role is OWNER or CONTRIBUTOR. Controllers
may express this coarse role boundary, but Projects services receive the
authenticated actor and enforce active status plus persisted project ownership.
ADMIN is excluded from ordinary private-draft routes. Non-owner and ordinary
Admin access use the same safe not-found result.

**Rationale**: Constitution v3.0.0 makes both ordinary roles eligible while
keeping role and resource ownership distinct. Service enforcement is necessary
because the current access-token guard deliberately permits pending contributors
for onboarding; simply widening the current role decorator would grant more than
the project workflow intends.

**Alternatives considered**: Keeping OWNER-only contradicts the approved
decision. Allowing any session accepted by the global guard would admit pending
contributors. Treating ADMIN as an implicit owner would violate the explicit,
auditable-bypass rule.

## 3. Preview and Draft Creation Boundary

**Decision**: Use a side-effect-free preview interaction followed by a distinct
idempotent draft-creation interaction. Creation echoes the previewed numeric
repository identity and source version/update marker, and the backend re-resolves
required source facts before persisting. Preview data is not stored as a Project
and is never a publish command.

**Rationale**: Separate interactions make review observable and prevent the
current import request from publishing as a side effect. Re-resolution avoids
trusting client-echoed source facts and detects rename/transfer/change between
preview and confirmation without requiring a persistent preview table.

**Alternatives considered**: Persisting previews conflicts with the clarified
transient preview model. A signed preview token adds key/configuration and expiry
complexity without removing the need to revalidate authorization. Continuing a
combined import/save route cannot enforce explicit review and publication.

## 4. Existing Import Route Compatibility

**Decision**: Replace and clearly retire `POST /projects/import/github` when the
new contract lands. Do not silently reinterpret it, and do not keep a second
authoritative import path. Document a breaking corrective change in API docs and
HTTP examples; draft creation no longer accepts `status`, and publication has a
separate command.

**Rationale**: The current route can create a published Project, refresh by
repository URL, and overwrite omitted owner values. Preserving that behavior
would keep a constitution violation and two conflicting workflows. There is no
API versioning/deprecation framework in the current repository, so a clear
cutover is less ambiguous than an indefinite compatibility adapter.

**Alternatives considered**: Repurposing the old route as preview breaks its
response semantics silently. Keeping it as a draft-only wrapper would bypass
the required preview/review sequence. Maintaining both contracts would duplicate
business behavior and make idempotency inconsistent.

## 5. Canonical Repository Identity and Rename/Transfer

**Decision**: Canonicalize GitHub repositories in a Projects-owned
`ProjectRepositorySource` association by provider plus immutable numeric
repository ID. Store the current full name and URL there as mutable source-owned
attribution, and include immutable numeric owner ID plus owner type (`User` or
`Organization`) in the normalized source contract. Projects reference this
record through a nullable foreign key so repository-free work remains possible.
Existing rows without a repository ID use a normalized URL fallback key marked
for later reconciliation.

**Rationale**: GitHub names and URLs change on rename/transfer; numeric IDs are
stable and support safe duplicate-publication and owner matching. The current
payload discards `owner.id` and `owner.type`, which makes login-based ownership
and personal/organization classification unsafe.

**Alternatives considered**: URL or lowercased `owner/name` keys are rename
fragile. Login matching is case/rename fragile. A migration-time provider fetch
would make a forward migration network-dependent and non-deterministic.

## 6. Source Snapshots and Owner-Controlled Values

**Decision**: Keep effective owner presentation fields on Project, track an
explicit manual-override set, and store imported evidence in immutable,
Projects-owned source snapshots. New drafts copy source defaults into effective
fields; owner edits mark applicable fields overridden. Refresh changes the
latest source snapshot and only updates effective defaults not in the override
set. Restore-from-source is explicit.

**Rationale**: This gives a clear source/effective comparison, preserves manual
edits, and keeps GitHub optional for future repository-free projects. Immutable
snapshots preserve provenance/freshness and allow a failed refresh to leave the
last valid evidence untouched.

**Alternatives considered**: Keeping source and effective values in the same
columns caused the current silent overwrite. Making every field a normalized
key/value row would add unnecessary query and validation complexity. Updating
no defaults after refresh would preserve edits but fail the requirement that
non-overridden source-derived defaults can advance.

## 7. Partial Metadata and Refresh Adoption

**Decision**: Resolve required identity/visibility/version first, then collect
optional metadata with bounded concurrency. Adopt complete or explicitly
partial snapshots only when required facts are trustworthy. For unavailable
optional areas, retain the last valid value and mark that area's provenance as
retained/stale. On timeout, rate limit, revocation, malformed required data, or
concurrency conflict, update only a safe refresh-attempt result.

**Rationale**: The current `Promise.allSettled` approach is a useful starting
pattern, but discarded failure details and empty fallbacks cannot distinguish
missing from verified-empty data. Two-phase adoption preserves the valid draft
and makes uncertainty visible.

**Alternatives considered**: All-or-nothing optional evidence makes the workflow
too fragile. Blind partial overwrites turn provider failure into false empty
facts. Holding a database transaction open during GitHub I/O increases lock
duration and still cannot prevent provider uncertainty.

The approved freshness rule is deterministic: required source facts become
stale at 15 minutes from the last successful required-data read and immediately
on a known revocation, unselection, transfer, deletion, visibility change, or
equivalent invalidation. Publication always performs a current source/control
check. Failure changes neither draft nor current snapshot. For a published
Project, a known invalidation withholds affected source attribution/content but
does not change `published` status; only the owner can archive it.

## 8. Optimistic Concurrency

**Decision**: Add a monotonic Project `revision`. Every owner edit, adopted
refresh, publication, and archive command supplies `expectedRevision` and uses
a conditional transactional update. Refresh records its base revision before
provider I/O and refuses adoption if the Project changed meanwhile.

**Rationale**: This prevents two sessions or an overlapping refresh from
silently losing a newer owner edit. A safe 409 is actionable and works with the
existing application-error envelope.

**Alternatives considered**: Last-write-wins violates IR-004. Database locks
across provider calls are unsafe and slow. HTTP timestamp comparison has lower
precision and unclear semantics. ETags could mirror the revision later, but the
existing API has no ETag convention.

## 9. Command Idempotency

**Decision**: Require `Idempotency-Key` on side-effecting canonical commands.
Persist a Projects-owned receipt keyed by actor, operation, and key with request
hash and safe result reference. The business write and successful receipt share
one transaction. Same key/hash replays the outcome; same key with different
input returns 409. Retain receipts for at least 24 hours.

**Rationale**: Repository identity cannot distinguish an uncertain retry from
an intentional second private draft. Explicit intent does, and the same pattern
prevents duplicate publication audits or later completed-fact side effects.

**Alternatives considered**: Deduplicating by repository would prohibit
intentional drafts. Client-generated project IDs broaden the public write
contract unnecessarily. Natural idempotency alone cannot safely recover a lost
create response.

## 10. One Published Project per Repository

**Decision**: Remove global GitHub URL uniqueness so private drafts can coexist,
and add a PostgreSQL partial unique index on
`Project.repository_source_id` where status is `published`. Perform a friendly
service precheck, but map a database uniqueness race to
`PROJECT_REPOSITORY_ALREADY_PUBLISHED`.

**Rationale**: Only a database constraint can guarantee one winner during
concurrent publication. A partial index allows any number of draft/archived rows
and makes archiving release the claim atomically.

**Alternatives considered**: Service-only checks race. Keeping the current
global URL uniqueness rejects approved private drafts and fails on renames.
A separate publication-claim table is valid but adds another synchronization
invariant when a partial index on Project can enforce the rule directly.

## 11. Publication and Archive Audit

**Decision**: Allow only `draft -> published` and `published -> archived` in
this feature. Each successful transition writes an append-only Project
transition record containing actor, prior/resulting state, revision, time,
validation outcome, safe evidence references, and command receipt. Existing
published rows receive a system migration record that preserves `published_at`.

**Rationale**: A timestamp alone cannot prove who acted, what was validated, or
whether a retry duplicated the transition. Transactional audit records satisfy
traceability without storing provider secrets or private payloads.

**Alternatives considered**: Reusing `updated_at` is not auditable. Returning a
published record directly to draft erases its history and violates the approved
state machine. Reactivation requires a later policy decision.

## 12. Personal and Organization/Shared Control

**Decision**: At publication, `projects` requests current, normalized control
evidence. A public personal repository qualifies only when GitHub reports owner
type `User` and its immutable owner ID matches the authenticated user's current
identity-owned GitHub provider ID. Organization/shared and all private sources
require an active GitHub App installation, current repository accessibility,
and an explicit ShareK selection by the acting owner. Collaboration access or a
repository name from request data is insufficient.

**Rationale**: This implements the 2026-07-21 canonical GitHub decision without
turning OAuth into repository-access authorization. Live App verification also
handles transfer, suspension, and unselection before a sensitive read or
publication.

**Alternatives considered**: Matching login/email is mutable. Treating current
broad `repo` OAuth as private authorization violates the constitution. Treating
an installation configured for `all` repositories as automatic ShareK selection
would violate explicit selection; the provider grant and ShareK choice are both
required.

## 13. SK-107 GitHub App Contract

**Decision**: Treat SK-107 as a real prerequisite, not a hidden subfeature or
OAuth shim. SK-107 owns installation setup correlation, App user association,
installation and selected-repository records, token minting, webhook signature
verification/deduplication, and reconciliation. SK-112 consumes only the typed
contract in `contracts/github-module-contract.md`.

**Rationale**: No installation or selection model exists today. Keeping those
writes in `github` preserves module ownership and prevents Projects from seeing
tokens, installation IDs, raw permissions, or provider objects.

**Alternatives considered**: Implementing App tables in Projects violates table
ownership. Simulating explicit selection from `/user/repos` repeats the current
broad OAuth flaw. Blocking all SK-112 work would unnecessarily delay the public
preview/draft slice, but private and organization/shared acceptance cannot be
claimed until SK-107 is real.

## 14. GitHub Least Privilege, Tokens, and Revocation

**Decision**: SK-107 requests only repository Metadata: read and Contents: read,
mints repository-scoped installation tokens, never persists those short-lived
tokens, and stores both provider installation grant and explicit ShareK
selection. Installation suspension/deletion or repository removal immediately
revokes later private reads; webhooks accelerate invalidation and live checks
remain authoritative. Webhook deliveries are HMAC-SHA256 verified, GUID
deduplicated, acknowledged quickly, and reconciled asynchronously.

**Rationale**: GitHub installation tokens are short-lived and can be narrowed by
repository and permission. GitHub documents that callback installation IDs can
be spoofed, webhook delivery can fail or arrive out of order, and App user-token
revocation is not the same as uninstall. Live checks plus reconciliation are
therefore required. See GitHub's official documentation for [installation
access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app),
[installation APIs](https://docs.github.com/en/rest/apps/installations), and
[webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).

**Alternatives considered**: Persisting installation tokens increases secret
exposure. Trusting a setup redirect ID permits spoofing. Webhook-only state can
be stale because deliveries are not guaranteed. Broad `repo` OAuth is not
least-privilege App authorization.

## 15. Provider Client and Failure Budget

**Decision**: Keep the existing focused fetch-based GitHub client and supported
REST API version `2022-11-28`; inject `ConfigService`; and validate
`GITHUB_API_URL`, `GITHUB_API_OVERALL_TIMEOUT_MS`, and
`GITHUB_API_REQUEST_TIMEOUT_MS` in the shared environment schema. Defaults are
the official API URL, 8 seconds overall, and 4 seconds per call. Production
rejects a non-HTTPS URL, overall values above 8 seconds, and a per-call value
above the overall value. Remove the hardcoded client constant, normalize the
configured base URL once, and add an explicit User-Agent, validated payload
mapping, abort deadlines on every fetch, and safe rate/error metadata. Use at
most two optional evidence calls concurrently. Retry only once for an internally
cached token that can be reminted after 401; do not synchronously retry rate
limits, timeouts, or 5xx.

**Rationale**: The installed stack needs no second HTTP/auth abstraction for
SK-112. Headroom is required for SC-001's 10-second outcome, and GitHub advises
avoiding excessive concurrent requests. Parse `Retry-After` and rate-limit
headers internally while returning only safe retry guidance. The selected API
version remains supported according to GitHub's [REST API version
documentation](https://docs.github.com/en/rest/about-the-rest-api/api-versions).

**Alternatives considered**: Retaining the module constant prevents environment
validation and deterministic client tests. A configurable deadline above eight
seconds violates SC-001. Adding Octokit now duplicates transport/auth patterns
and adds ESM integration risk. Unbounded five-way fan-out increases
secondary-rate-limit risk. Blind immediate retries can worsen provider
throttling and exceed the response target.

## 16. Public Visibility and DTO Redaction

**Decision**: Add separate owner and public mappers. Public list/detail queries
select only `published` rows in the backend and return owner-controlled
presentation plus safe attribution. Place the public list/detail under
`/public/projects`, leaving authenticated owner routes under `/projects/me`;
this structural namespace separation means `me` can never be captured as a
public project identifier. A private-backed publication exposes no
repository identity, README, languages/statistics payload, installation status,
authorization proof, refresh failure, or raw snapshot. Draft and archived IDs
produce the same 404 as missing IDs.

**Rationale**: A shared generic Project response currently includes repository
URL, raw JSON, and README content and cannot safely serve public/private-backed
projects. Query-time state filtering plus allowlists enforce privacy independently
of frontend or indexing availability.

**Alternatives considered**: Frontend filtering violates the constitution.
Relying only on controller registration order for `/projects/:projectId` versus
`/projects/me` is fragile and requires permanent ordering discipline. Runtime
property deletion from raw Prisma objects is brittle. Disallowing all
private-backed publication was not approved; redacted public presentation is
the required boundary.

## 17. Migration Strategy

**Decision**: Use expand/backfill/verify/cutover. Keep legacy columns during the
first rollout, make repository association nullable, backfill snapshots without
network calls, conservatively mark existing presentation as overridden, and
create unique Projects-owned numeric-ID and normalized-URL aliases. Mark sources
without locally stored numeric IDs unresolved and diagnose every unresolved or
colliding published source. A Projects publication-readiness query blocks all
new publication until every existing published source has one stable numeric
identity and no alias conflict. Reconciliation calls GitHub outside migration
and reserves/merges aliases inside a collision-checked Projects transaction.
Use one forward-only expand/backfill/diagnostic migration, then a second
forward-only constraints migration that rechecks readiness and adds the partial
unique index only after repair. Any cleanup is a later forward migration.

**Rationale**: This preserves existing drafts, publication timestamps, and
manual edits while enabling multiple drafts and repository-free compatibility.
It also provides a rollback-forward path if dirty legacy data blocks the new
constraint.

**Alternatives considered**: Dropping/recreating Project loses data. Rewriting
deployed migrations violates governance. Fetching GitHub during migration makes
deployment depend on network and credentials. Allowing publication while legacy
fallbacks remain lets URL and numeric aliases bypass the one-published-project
rule. Assuming current URLs are stable preserves hidden duplicate risk.

## 18. AI, Indexing, and Completed-Fact Side Effects

**Decision**: Publish synchronously and commit independently of AI, semantic
indexing, or notifications. This plan neither chooses an indexing provider nor
creates an indexing job. A later feature may consume an idempotent completed
publication fact after the Project transaction.

**Rationale**: FR-017 and SC-009 explicitly make AI/indexing non-blocking and
out of scope. The owning NestJS service makes the final state decision.

**Alternatives considered**: Waiting for indexing couples availability and can
corrupt/reverse a valid publication. Adding a queue now is speculative because
SK-114 owns indexing behavior.

## 19. Branch and Brownfield Delivery Gate

**Decision**: Record `feature/sk-112-github-project-publication` as the actual
planning/implementation branch. Before implementation, inspect `git status` and
the active branch; stop if it is `main`, and never switch branches or discard
existing work automatically.

**Rationale**: The repository contains human/earlier Spec Kit changes, and the
constitution requires feature-branch, brownfield-safe delivery. The previous
plan incorrectly recorded `main` even though the current branch is the named
feature branch.

**Alternatives considered**: Leaving the branch generic makes the delivery gate
unverifiable. Automatically creating/switching a branch could strand or overlap
uncommitted human work and is forbidden by repository guidance.

## 20. Projects Operation-Receipt Boundary

**Decision**: Add `ProjectOperationService` and limit it to reservation of a
Projects-owned idempotency receipt, same-fingerprint replay, different-fingerprint
conflict detection, and transactional completion/failure recording.

**Rationale**: Receipt logic is shared by create/edit/refresh/publish/archive and
has its own concurrency invariant, but authorization and workflow decisions
remain understandable in their owning feature services.

**Alternatives considered**: Duplicating receipt logic across services risks
different replay semantics. Expanding the operation service into an orchestrator
would obscure ownership and become a use-case layer prohibited by ADR-002.

## 21. Typed Owner-Workspace and Admin Summary Reads

**Decision**: Projects loads Project rows only, then batches project IDs through
an exported ContributionTasks reader for open-request counts and an exported
Applications reader for pending-application counts. The contribution-task reader
also supplies the existing owner monthly request count. The Admin published-owner
aggregate groups Projects-owned publication facts, authorizes through and fetches
the minimum owner display summary from an exported Identity service, then joins
the typed results in memory. Inputs are authenticated actor/owner and allowlisted
IDs; outputs contain counts or approved display fields only.

**Rationale**: The current implementation directly traverses
`Project.contributionRequests.applications`, counts `ContributionRequest`, and
selects the `Project.owner` relation. That violates the accepted module table
ownership rules. Batched service reads preserve behavior without creating a
shared repository or circular persistence access.

**Alternatives considered**: Direct Prisma joins are shorter but violate the
module boundary. Copying counts into Projects introduces synchronization and
eventual-consistency policy that SK-112 does not need. A generic query bus or
abstract repository would add architecture ceremony.

## 22. Repository-Free Compatibility Boundary

**Decision**: Make the core Project-to-source relationship nullable and apply
source validation conditionally when a source exists, while requiring a GitHub
source in every SK-112 create and publish command. Do not expose a repository-free
request variant or public workflow in this feature.

**Rationale**: This prevents a second schema redesign when the separately
specified repository-free feature arrives without silently expanding SK-112's
acceptance scope.

**Alternatives considered**: Requiring the relation at database level would
block the approved future workflow. Accepting a null source through SK-112 would
implement an unapproved repository-free creation/publication journey.

## Resolved Unknowns

All technical-context unknowns have a selected design. Implementation readiness
for private and organization/shared scenarios is conditional on SK-107 and real
GitHub App test configuration. New publication is also conditional on zero
unresolved/conflicting published legacy sources. These are known dependency and
operational gates, not unresolved product decisions.
