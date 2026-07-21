# Implementation Plan: GitHub-Backed Project Draft and Publication

**Branch**: `feature/sk-112-github-project-publication` | **Date**: 2026-07-21 | **Spec**: `specs/003-github-project-publication/spec.md`

**Input**: Jira SK-112 / TASK-2-03, dependent on SK-107 / TASK-1-05; PRD FR-034 through FR-039; constitution v3.0.0; ADR-002.

## Summary

Replace the current combined public-repository import/save/publish behavior with
a backend-owned workflow that previews normalized GitHub metadata without a
project write, creates an owner-only draft after explicit confirmation, keeps
source snapshots separate from owner-controlled presentation, refreshes with
optimistic concurrency, and publishes or archives only through explicit audited
state transitions. `projects` remains the owner of project state and consumes a
typed, redacted repository-access contract from `github`; SK-107 must supply the
GitHub App installation and explicit-selection capability before private and
organization/shared acceptance scenarios can pass.

The change is corrective brownfield work. It reuses the existing modules,
authentication guard, error envelope, GitHub normalization, project dashboard
query, and Prisma ownership. It removes the OWNER-only creation assumption,
does not add frontend, search, filtering, semantic discovery, ranking,
recommendation, AI, or indexing behavior, and does not create a parallel project
or GitHub module.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 22 with NestJS 11

**Primary Dependencies**: NestJS 11, Prisma 6.x (installed 6.19.3), PostgreSQL; existing
`class-validator`, `@nestjs/config`, application-error filter, and Node
`crypto`/`fetch`/`AbortSignal` patterns; BullMQ/Redis only for SK-107 webhook
reconciliation, not for synchronous SK-112 publication

**Storage**: PostgreSQL via Prisma. Projects-owned source snapshots, command
receipts, and transition audits are added with forward-only migrations. GitHub
installation, repository-selection, provider state, and credential records
remain GitHub-owned under SK-107. pgvector is not used by this feature.

**Testing**: Jest service/unit tests; PostgreSQL-backed Prisma integration and
migration tests; authorization/security tests; explicit API contract tests; and
relevant Supertest E2E coverage with deterministic GitHub boundary fakes

**Target Platform**: Docker Compose local backend stack and deployable NestJS
API service

**Project Type**: Backend web API in the accepted feature-first NestJS modular
monolith

**Brownfield Worktree**: Planning began with existing changes in `AGENTS.md`,
the SK-112 specification/checklist, and generated SK-112 artifacts. They are
preserved. Implementation must re-run `git status --short`, review overlapping
diffs, and must not switch branches, discard changes, or reformat unrelated
files.

**Performance Goals**: Every preview ends provider work within 8 seconds and
returns metadata or an actionable result within 10 seconds, excluding transport
outside ShareK (SC-001). It uses an injected, validated provider budget of at
most 8 seconds and a per-call timeout that cannot exceed it. The planned
defaults are 8 seconds overall and 4 seconds per call. Non-provider project
commands retain the PRD P95 target under 3 seconds. Public lists use bounded
pagination.

**Constraints**: Standard controller -> validated DTO -> service -> Prisma or
exported service flow; no client-supplied authorization evidence; no private
provider data in public DTOs or logs; no project mutation during preview; no
automatic publication; no direct `published -> draft`; no AI or indexing
dependency; no provider writes; GitHub is optional on the core Project model

**Scale/Scope**: Extend the existing `projects` and `github` modules, consume
narrow exported readers from `identity`, `contribution-tasks`, and
`applications`, and add no duplicate business module. Plan seven canonical
interactions (preview, create draft, owner detail/edit, refresh, publish,
archive, and published read/list), retain the existing owner dashboard list,
and replace the unsafe combined import contract. Default public page size is 20
and maximum is 50. Multiple private drafts may share a repository; one
canonical repository may have at most one published project.

**Configuration**: `src/shared/config/env.validation.ts` validates
`GITHUB_API_URL`, `GITHUB_API_OVERALL_TIMEOUT_MS`, and
`GITHUB_API_REQUEST_TIMEOUT_MS`; `.env.example` documents safe defaults. The
GitHub client receives values through injected `ConfigService`, normalizes the
base URL once, and never relies on a module constant. Production requires an
HTTPS provider URL; the overall timeout is positive and at most 8,000 ms; the
per-call timeout is positive and no greater than the overall timeout.

**External Dependency**: SK-107 must expose the typed repository-read,
installation-selection, invalidation/revocation, and current
publication-control evidence defined in `contracts/github-module-contract.md`.
SK-112 may adapt to that exported service but must not create GitHub App
installation persistence, repository-selection persistence, credential
management, or webhook ownership. Existing broad repository OAuth is current
behavior only and is not an acceptable fallback. Private and
organization/shared paths remain blocked until SK-107 and its contract tests
are complete.

## Constitution Check

*GATE: Passed before Phase 0 research and passed again after Phase 1 design.*

- **Authority and Traceability — PASS**: The spec and plan separate current
  behavior from approved target behavior and trace Jira SK-112/SK-107,
  TASK-2-03/TASK-1-05, PRD FR-034-FR-039, the 2026-07-21 decision-log entries,
  constitution v3.0.0, and ADR-002.
- **Roles and Context — PASS**: Ordinary project routes admit eligible OWNER
  and CONTRIBUTOR accounts; mutations query persisted `owner_id`; Admin has no
  ordinary draft bypass. Request DTOs contain no `ownerId`, `userId`, `role`, or
  Admin flag.
- **Module Ownership — PASS**: `projects` alone writes Project, snapshot,
  idempotency, and transition-audit records. `github` alone writes installation,
  selection, webhook, and credential records. Owner-workspace request/application
  summaries come from exported `contribution-tasks` and `applications` services;
  the Admin published-owner aggregate obtains account summaries from an exported,
  Admin-authorized `identity` service. Projects does not query those modules'
  tables or import their private implementation.
- **HTTP Flow — PASS**: Planned controllers bind validated DTOs and delegate to
  focused services. Provider access and persistence stay out of controllers,
  and every response uses an explicit mapper/DTO.
- **GitHub and Evidence — PASS**: Public reads and GitHub App-selected private
  reads are distinct. Personal control uses immutable numeric GitHub identity;
  organization/shared control uses a live installation plus explicit ShareK
  selection. Snapshot provenance, visibility, freshness, uncertainty,
  authorization observation, and redaction are retained.
- **AI Boundary — PASS**: AI and semantic indexing are absent from the
  synchronous workflow. Publication is a deterministic NestJS decision and is
  not reversed if a later consumer fails.
- **State and Persistence — PASS**: Only `draft -> published` and `published ->
  archived` are introduced. Transactions protect publication, audit,
  idempotency, and the duplicate-publication invariant. Migrations expand,
  backfill, verify, and preserve legacy records.
- **API Contract — PASS**: `contracts/http-api.md` specifies allowlisted owner
  and public views, safe errors, pagination, compatibility, and concurrency.
  Provider/Prisma objects never become transport contracts.
- **Testing and Reliability — PASS**: The quickstart and design cover unit,
  integration, authorization/security, contract, and E2E verification plus
  timeout, rate limit, revocation, retry, idempotency, concurrency, and partial
  failure. Configuration validation and injected-client deadline behavior are
  explicit test targets.
- **Brownfield Safety — PASS**: Existing source, schema, migrations, route
  docs, tests, module READMEs, architecture checks, and worktree state were
  inspected. The plan extends existing modules and explicitly retires the
  conflicting combined route instead of duplicating it indefinitely. Planning
  was performed on `feature/sk-112-github-project-publication`; implementation
  must stop if the active branch is `main`.

### Post-Design Gate Result

No constitution exception is required. Two implementation gates remain:

1. Private and organization/shared paths are blocked until SK-107 delivers and
   contract-tests the GitHub App boundary; public work must not introduce a
   temporary broad-OAuth fallback.
2. New publication is globally blocked until the legacy reconciliation query
   reports that every existing published GitHub source has one stable numeric
   provider repository identity and no alias collision.

All product and architecture decisions needed for planning are otherwise
resolved in the Phase 0 decisions.

## Technical Design

### Request and Ownership Flow

1. The authenticated caller submits a repository reference to the preview
   interaction. `Projects` delegates source resolution to the exported GitHub
   access service and maps the normalized result to a preview DTO; no Project,
   snapshot, or command receipt is written.
2. The caller confirms a draft with the previewed repository identity/version,
   owner-controlled starting values, and an idempotency key. The backend
   re-resolves required source facts, derives `owner_id` from the session, and
   atomically creates a `draft`, its initial adopted snapshot, and its command
   receipt.
3. Owner detail, edit, refresh, publish, and archive load the Project by both
   project ID and authenticated owner ID. Non-owner and ordinary Admin requests
   receive the same safe not-found result.
4. Edits update allowlisted owner fields and the manual-override set. Refresh
   fetches outside a database transaction, then adopts a complete-enough
   immutable snapshot only if the expected Project revision still matches.
5. Publish revalidates completeness and current repository control, then in one
   transaction claims the canonical repository, changes `draft -> published`,
   records the first publication time and audit, increments the revision, and
   completes the idempotency receipt. Archive performs the equivalent explicit
   `published -> archived` transaction and releases the public repository claim.
6. The owner workspace queries only Projects-owned rows directly, then asks
   exported ContributionTasks and Applications summary readers for the minimum
   counts needed by the existing response. The Admin published-owner aggregate
   obtains account display summaries from an exported Identity reader that
   performs the Admin authorization check. Projects composes the DTO and never
   joins or selects those modules' tables.
7. Public reads use the collision-free `/public/projects` namespace, query
   `status = published` at the Projects service boundary, and map only the
   public DTO. Draft and archived identifiers return the same not-found
   contract; `/projects/me` remains exclusively an authenticated owner route.

### Provider Configuration and Deadlines

- Add `GITHUB_API_URL`, `GITHUB_API_OVERALL_TIMEOUT_MS`, and
  `GITHUB_API_REQUEST_TIMEOUT_MS` to `src/shared/config/env.validation.ts` and
  `.env.example`. Defaults are `https://api.github.com`, `8000`, and `4000`.
- Validation rejects malformed/insecure production URLs, an overall deadline
  above 8,000 ms, non-positive deadlines, and a request timeout greater than
  the overall deadline. Configuration tests cover defaults and every invalid
  relation.
- `GitHubApiClient` injects `ConfigService`, removes the hardcoded base URL,
  builds URLs from the normalized configured base, and attaches a bounded abort
  signal to every provider fetch, including README and optional metadata calls.
- Projects creates one absolute deadline for each preview and propagates it
  through the typed GitHub contract. GitHub uses the lesser of remaining time
  and the configured request timeout. No retry or optional call may extend the
  overall 8-second ceiling; ShareK maps expiration to the safe timeout contract
  and retains the 10-second end-to-end server outcome requirement.

### Concurrency and Atomicity

- Every mutable owner command carries `expectedRevision`; Project revision is
  incremented on owner edits, adopted refreshes, publish, and archive.
- The service uses conditional Prisma updates/transactional checks. A stale
  revision returns `PROJECT_REVISION_CONFLICT` with the current safe revision and
  never applies a partial write.
- A refresh attempt records its base revision before provider I/O. If the
  Project changes before adoption, the new snapshot is not made current and the
  caller receives a conflict; owner edits are never overwritten.
- Project creation, successful snapshot adoption, publication, and archive use
  transactions for their Project-owned multi-write invariants.
- A PostgreSQL partial unique index on `Project.repository_source_id` for
  `status = 'published'` is the final race-safe duplicate guard. Service checks
  improve the error, but the database decides concurrent winners.

### Idempotency

- Preview is read-only and has no project-side idempotency record.
- Every side-effecting canonical command requires `Idempotency-Key`. The scope
  is authenticated actor + operation + key; the stored request hash prevents a
  key from being reused for different input.
- Project creation and each state transition write their successful receipt in
  the same transaction as business state. A same-key/same-hash retry returns the
  stored safe outcome; a same-key/different-hash retry returns
  `IDEMPOTENCY_KEY_REUSED`.
- Refresh reserves a receipt/attempt before provider work and records a safe
  completed or failed outcome. A deliberate retry after a recorded provider
  failure uses a new key; an uncertain network retry uses the same key.
- Receipts retain only hashes, safe outcome references, and timestamps for at
  least 24 hours; they never store provider payloads or credentials.
- `ProjectOperationService` is the only planned service responsible for
  Projects-owned receipt reservation, matching-key replay, fingerprint conflict
  detection, and transactional completion. It does not authorize Projects,
  call GitHub, validate publication, mutate presentation/source snapshots, or
  own another module's data.

### Source Refresh and Failure Adoption

- Repository identity is resolved first and is required. Optional languages,
  topics, statistics, and README areas use bounded concurrency and per-area
  availability markers.
- A complete or explicitly partial result may be adopted only when required
  identity/visibility/version facts are trustworthy. Unavailable optional areas
  inherit their last valid values with provenance marking them retained/stale;
  they are never converted into verified empty values.
- A timeout, rate limit, outage, malformed required payload, revocation, or
  revision conflict leaves the current snapshot, Project state, publication,
  and owner fields unchanged. Only the safe refresh-attempt status changes.
- Non-overridden source-derived defaults may follow the new snapshot. Fields in
  the manual-override set remain untouched until an explicit restore action
  copies the latest permitted source default and clears that override.

### Freshness, Invalidation, and Published Disclosure

- A required-data read is fresh strictly before 15 minutes have elapsed from
  `lastRequiredReadAt`. At or after that instant it is stale. The status is
  derived with an injected clock; no background timer or migration write is
  needed merely for time to pass.
- A typed SK-107 invalidation for revocation, repository unselection, ownership
  transfer, deletion, visibility change, or equivalent access/control change
  marks the Projects-owned safe source state stale immediately and withholds
  affected public repository attribution/content. GitHub owns webhook receipt,
  signature verification, deduplication, credentials, and authoritative state;
  Projects owns only the resulting Project disclosure/status update.
- Publication always performs a current required identity, visibility, and
  control verification, even if the adopted snapshot is less than 15 minutes
  old. A successful check adopts or references the current facts inside the
  publication transaction. A failed, timed-out, rate-limited, or revoked check
  leaves the draft and its current snapshot unchanged and returns only a safe
  retry/recovery result.
- A published Project remains published after a known source invalidation.
  Public list/detail continues to return owner-controlled presentation but maps
  its source to `{ provider: github, attributionStatus: withheld }` until a
  later authorized refresh restores safe attribution. Only explicit archive
  removes the Project from public reads.

### Migration and Compatibility

1. Add nullable Projects-owned repository-source relations, aliases, revision,
   override, safe source-state, reconciliation, and archive fields; add the
   Project-owned snapshot, refresh-attempt, command-receipt, and transition-audit
   models. Keep the core Project/source relation nullable for a future
   repository-free feature, but every SK-112 create/publish command requires a
   GitHub source.
2. Run no provider or other network access from a Prisma migration. Backfill a
   canonical source and aliases using the numeric repository ID already stored
   locally when present; otherwise create a normalized-URL fallback alias and
   mark the source `unresolved`. Backfill a current snapshot from existing
   columns and conservatively mark existing presentation fields manual.
3. Preserve `published_at`; create migration audit transitions without
   fabricating actors. Produce deterministic diagnostics for published rows
   with missing numeric identity, duplicate IDs, URL/numeric alias collisions,
   or inconsistent status timestamps. Never merge, archive, delete, or fetch a
   source inside migration SQL.
4. Reconcile unresolved sources only through an explicit, separately invoked
   application/operations workflow: GitHub returns normalized live identity;
   Projects reserves the numeric and normalized-URL aliases and merges/repoints
   Projects-owned associations in a collision-checked transaction. An alias can
   belong to only one canonical source. Publication requires a verified numeric
   source, so URL fallback and numeric-ID aliases cannot form separate public
   claims for the same repository.
5. Enforce a global publication-readiness query in Projects. Until every
   already-published legacy GitHub source is numerically verified and all alias
   conflicts are resolved, every new publish command fails safely with the
   reconciliation gate code and leaves its draft unchanged. The first
   forward-only migration is the expand/backfill/diagnostic migration.
6. After the operational reconciliation report reaches zero, apply a second
   forward-only constraints migration that verifies readiness and creates the
   partial unique published-source index. Retain a database-backed concurrency
   test as the final race guard; the second migration fails with diagnostics if
   readiness regresses.
7. Deploy new reads/writes against the expanded schema while retaining legacy
   columns for one verified rollout. Column removal is a later forward-only
   cleanup migration; deployed migration history is never edited.
8. Replace `POST /projects/import/github`: it currently combines preview,
   refresh, save, and optional publish and cannot satisfy the approved workflow.
   The implementation must document this intentional breaking correction,
   remove `status` from draft creation, publish only through the explicit
   command, update `sharek-api.http`/API docs, and remove or fail the old route
   clearly rather than leaving two authoritative import workflows.

## Project Structure

### Documentation (this feature)

```text
specs/003-github-project-publication/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── github-module-contract.md
│   └── project-summary-module-contracts.md
└── tasks.md                         # existing; regenerate separately after this revised plan
```

### Source Code (planned implementation surface)

```text
src/modules/projects/
├── projects.module.ts
├── projects.controller.ts          # existing dashboard plus owner commands
├── public-projects.controller.ts   # minimal published list/detail boundary
├── projects.service.ts             # retain current dashboard/admin behavior
├── services/
│   ├── project-draft.service.ts
│   ├── project-operation.service.ts
│   ├── project-source.service.ts
│   ├── project-publication.service.ts
│   └── public-projects.service.ts
├── dto/                             # explicit request/preview/owner/public DTOs
├── mappers/                         # owner/public/source allowlist mappers
├── validators/
│   └── project-publication.validator.ts
├── *.spec.ts and services/*.spec.ts
└── README.md

src/modules/github/
├── github.module.ts
├── services/                        # SK-107 exported access/control service
├── integrations/github-api.client.ts
├── integrations/github-api.client.spec.ts
├── dto/                             # normalized internal evidence DTOs
├── security/                        # remains private to github
└── README.md

src/modules/identity/
├── identity.module.ts
├── services/
│   ├── identity-provider-account.service.ts
│   └── identity-owner-summary.service.ts
└── README.md

src/modules/contribution-tasks/
├── contribution-tasks.module.ts
├── services/contribution-task-project-summary.service.ts
├── *.spec.ts and services/*.spec.ts
└── README.md

src/modules/applications/
├── applications.module.ts
├── services/application-project-summary.service.ts
├── *.spec.ts and services/*.spec.ts
└── README.md

src/shared/config/
├── env.validation.ts
└── env.validation.spec.ts

.env.example

prisma/
├── schema.prisma
└── migrations/
    ├── <timestamp>_github_project_draft_expand_backfill/migration.sql
    └── <timestamp>_github_project_publication_constraints/migration.sql

test/
├── github-project-publication.e2e-spec.ts
└── project-public-visibility.e2e-spec.ts

docs/api-contracts.md
docs/database-plan.md
docs/module-development-tracker.md
sharek-api.http
```

**Structure Decision**: Keep `projects` as the owning module and the current
root controller/service for compatible dashboard and Admin-published-summary
behavior. Add focused services because source I/O/adoption, draft mutation,
publication transactions, operation receipts, and public querying have distinct
authorization and failure models. `ProjectOperationService` remains limited to
receipt mechanics. Add a second controller under the unambiguous
`/public/projects` namespace so public DTOs cannot accidentally reuse owner
mappings and `/projects/me` cannot be captured as a public identifier. Use
direct Prisma only from the service that owns the relevant table; no repository
abstraction is justified. `github` exposes the SK-107 normalized service/DTO
boundary, `identity` exposes provider-ID and Admin owner-summary readers, and
`contribution-tasks`/`applications` expose only their minimum project summary
readers. No Clean Architecture folders, ports, abstract repositories, use cases,
new shared business logic, duplicate modules, SK-112 jobs, or AI modules are
added.

## Verification Strategy

- **Unit**: reference normalization mapping, owner-field validation and override
  tracking, completeness rules, transition matrix, safe provider error mapping,
  idempotency replay/hash mismatch, refresh merge/adoption, 15-minute boundary,
  immediate invalidation, exported summary-reader composition, environment
  validation, injected GitHub base URL, and per-call/overall abort behavior.
- **Integration**: forward migration/backfill, legacy nullable ID fallback,
  migration network isolation, unresolved-published diagnostics, alias
  reconciliation and collision handling, global publication-readiness gate,
  partial unique published-source index, transactional receipt/audit behavior,
  optimistic concurrency, and simultaneous publication races in PostgreSQL.
- **Authorization/security**: OWNER and CONTRIBUTOR ordinary creation; persisted
  owner-only mutation; non-owner/admin indistinguishable not-found behavior;
  public/private App selection; personal numeric identity matching; revocation;
  draft/archived exclusion; DTO/log redaction.
- **Contract**: every route/status/error and allowlisted field in
  `contracts/http-api.md`, including `/public/projects` isolation, the absence
  of `ownerId` authority,
  installation IDs, permissions, tokens, raw README/private evidence, and raw
  Prisma/provider objects from public responses. Internal contract tests prove
  Projects receives only typed summaries from Identity, ContributionTasks, and
  Applications.
- **E2E**: preview creates no record; create begins draft; manual edit survives
  successful/partial/failed refresh; explicit publish; duplicate-publication
  conflict; idempotent retry; publish without indexing; archive; public 404 for
  draft/archived; `/projects/me` route-collision regression; stale publication
  revalidation; immediate post-publication attribution withholding; GitHub
  timeout/rate-limit/revocation safe behavior.
- **Quality gates**: `npm run check:architecture`, `npm run lint`,
  `npx tsc --noEmit`, focused tests, `npm test -- --runInBand`,
  `npx prisma validate`, migration test against PostgreSQL, and `npm run build`.

## Delivery Sequence

1. Verify the active branch is not `main`; implementation stops rather than
   switching branches. Confirm SK-107's exported contract and test fixtures match
   `contracts/github-module-contract.md`; stop before private/organization work
   if they do not.
2. Add and test validated GitHub base URL/deadline configuration, inject it into
   the existing client, and remove all hardcoded provider URL usage.
3. Land the forward-only schema expansion/backfill, diagnostics, aliases, and
   database invariants with migration tests. Keep new publication blocked until
   the published-legacy reconciliation gate reaches zero unresolved/conflicting
   rows.
4. Export and contract-test the minimum ContributionTasks, Applications, and
   Identity summary readers, then make Projects compose the existing owner/Admin
   views without foreign-table reads.
5. Add request/response contracts and focused project services, starting with
   preview and unpublished draft creation for both ordinary account modes.
6. Add owner detail/edit plus immutable source identity and override tracking.
7. Add refresh attempts, bounded provider behavior, snapshot adoption,
   optimistic concurrency, 15-minute stale calculation, and SK-107 invalidation
   consumption.
8. Add publication/archival transactions, control revalidation, audit,
   idempotency, and duplicate-publication race coverage.
9. Add the minimal `/public/projects` list/detail boundary and exhaustive draft,
   archived, revoked-attribution, and route-collision tests. Do not add search,
   filtering, semantic discovery, ranking, indexing, or frontend behavior.
10. Retire the conflicting combined import route, update API/database/module
   documentation and HTTP examples, run all gates, and append the implementation
   record to the module tracker.

## Complexity Tracking

No constitution violations or approved exceptions are required. The SK-107 and
published-legacy reconciliation gates are external/operational blockers, not
architecture waivers.
