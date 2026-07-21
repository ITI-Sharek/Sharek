# Data Model: GitHub-Backed Project Draft and Publication

**Feature**: Jira SK-112 / TASK-2-03  
**Dependency**: SK-107 supplies GitHub-owned installation and selection data  
**Database**: PostgreSQL 16 through Prisma 6.x (installed client/CLI 6.19.3)

This is a logical design for the later implementation. It does not alter the
current Prisma schema. Names use the repository's Prisma conventions; exact
migration names are assigned during task generation/implementation.

## Ownership Boundary

| Entity | Owning module | Write authority |
|---|---|---|
| Project | `projects` | `projects` only |
| ProjectRepositorySource | `projects` | `projects` only, from normalized GitHub service output |
| ProjectRepositorySourceAlias | `projects` | `projects` only, through collision-checked reconciliation |
| ProjectSourceSnapshot | `projects` | `projects` only |
| ProjectSourceState | `projects` | `projects` only |
| ProjectSourceRefreshAttempt | `projects` | `projects` only |
| ProjectStateTransition | `projects` | `projects` only |
| ProjectOperationReceipt | `projects` | `projects` only |
| GitHub installation/association/selected repository/webhook delivery | `github` under SK-107 | `github` only |
| Authenticated GitHub provider identity | `identity` | `identity` only |

Projects stores normalized source/evidence and opaque proof references, never an
installation identifier, permission object, access token, refresh token, App
private key, webhook secret, or raw provider object.

## Enumerations

### Existing

- `ProjectStatus`: `draft`, `published`, `archived`
- `ProjectCategory`: `web`, `mobile`, `ai_ml`, `devops`, `tools_utilities`
- `ProjectDifficulty`: `beginner`, `intermediate`, `advanced`

### Planned

- `ProjectSourceProvider`: `github`
- `RepositoryVisibility`: `public`, `private`
- `RepositoryOwnerType`: `user`, `organization`
- `ProjectSourceReconciliationStatus`: `verified`, `unresolved`, `conflict`
- `ProjectSourceAliasType`: `provider_repository_id`, `normalized_url`
- `ProjectSourceCompleteness`: `complete`, `partial`
- `ProjectSourceSyncStatus`: `fresh`, `stale`, `refreshing`, `partial`,
  `failed`, `authorization_revoked`
- `ProjectSourceAuthorizationStatus`: `public_read`, `authorized`,
  `authorization_required`, `revoked`, `unknown`
- `ProjectSourceSelectionStatus`: `not_required`, `selected`, `unselected`,
  `revoked`, `unknown`
- `ProjectPublicAttributionStatus`: `public`, `withheld`
- `ProjectSourceInvalidationReason`: `authorization_revoked`,
  `repository_unselected`, `ownership_transferred`, `repository_deleted`,
  `visibility_changed`, `equivalent_source_change`
- `ProjectTransitionType`: `publish`, `archive`, `migration_publish`,
  `migration_archive`
- `ProjectControlMethod`: `personal_identity_match`,
  `github_app_selection`, `legacy_unverified`
- `ProjectOperation`: `create_draft`, `edit`, `refresh`, `publish`, `archive`
- `ProjectOperationStatus`: `in_progress`, `succeeded`, `failed`

## Project

The existing Project remains the aggregate root and stores effective,
owner-controlled ShareK presentation.

### Fields

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Existing primary key |
| `owner_id` | UUID | Existing User relation; derived from authenticated actor on creation; immutable in this feature |
| `repository_source_id` | UUID nullable | Many Projects to one ProjectRepositorySource; nullable for future repository-free projects |
| `title` | varchar(255) | Required, trimmed owner-controlled effective value |
| `description` | text nullable | Owner-controlled, maximum 5,000 characters at API boundary |
| `tags` | JSON/array | Owner-controlled normalized unique strings, maximum 30 x 80 characters |
| `technologies` | JSON/array | Owner-controlled normalized unique strings, maximum 30 x 80 characters |
| `category` | ProjectCategory nullable | Owner-controlled; required to publish |
| `difficulty` | ProjectDifficulty nullable | Owner-controlled; required to publish |
| `title_is_manual` | boolean | New drafts default false unless caller supplied/changed title |
| `description_is_manual` | boolean | Same semantics, including explicit null |
| `tags_are_manual` | boolean | Same semantics, including explicit empty array |
| `technologies_are_manual` | boolean | Same semantics, including explicit empty array |
| `status` | ProjectStatus | Existing; new rows always `draft` |
| `revision` | integer | Starts at 1; increments on effective edit, adopted refresh, publish, archive |
| `published_at` | timestamp nullable | Set once on first `draft -> published`; never cleared |
| `archived_at` | timestamp nullable | Set on `published -> archived` |
| `created_at` / `updated_at` | timestamp | Existing audit timestamps |

The current `github_repo_url`, `github_repo_id`, `languages`,
`repo_statistics`, and `readme_content` columns become legacy migration inputs.
Source identity and imported evidence move to the source/snapshot model. They
remain temporarily during the expand/cutover rollout and are removed only by a
later forward migration after verification.

### Constraints and Indexes

- `revision >= 1`
- `draft`: `published_at IS NULL` and `archived_at IS NULL`
- `published`: `published_at IS NOT NULL` and `archived_at IS NULL`
- `archived`: `published_at IS NOT NULL` and `archived_at IS NOT NULL`
- Index `(owner_id, updated_at DESC)` for the existing owner workspace.
- Index `(status, published_at DESC, id)` for bounded public reads.
- Index `repository_source_id` for source lookups.
- Handwritten PostgreSQL partial unique index:

  ```sql
  CREATE UNIQUE INDEX "Project_one_published_repository_source"
  ON "Project" ("repository_source_id")
  WHERE "status" = 'published' AND "repository_source_id" IS NOT NULL;
  ```

Prisma 6.x does not declare this partial unique index in the schema. The custom
SQL migration and an adjacent schema comment/documentation record it, and a
PostgreSQL integration test proves it.

### Effective-Value Rules

- Category and difficulty are always manual owner fields; no manual flag is
  needed for them.
- Title, description, tags, and technologies begin from source defaults.
- Providing or later editing a field sets its manual flag, even when the valid
  value is null/empty.
- Refresh updates an effective field only when its manual flag is false.
- `restoreFromSource` copies the current permitted source default and clears
  that field's manual flag in the same revision-checked transaction.
- Source identity/visibility/default branch/version/languages/statistics/README
  cannot be mutated by an ordinary Project edit DTO.

## ProjectRepositorySource

A Projects-owned, provider-neutral association record deduplicates canonical
source identity while allowing many Projects/drafts to reference it.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `provider` | ProjectSourceProvider | `github` for this feature |
| `canonical_key` | varchar(160) | Unique; `github:<numeric-repository-id>` for verified rows; opaque legacy key only while unresolved |
| `provider_repository_id` | varchar(50) nullable | Immutable numeric GitHub repository ID; nullable only for unreconciled legacy rows |
| `current_full_name` | varchar(200) nullable | Provider-returned canonical `owner/name`; nullable only when legacy data cannot be safely normalized; mutable on rename/transfer |
| `current_url` | varchar(500) | Provider-returned canonical URL; mutable source fact |
| `owner_provider_id` | varchar(50) nullable | Immutable numeric source owner ID; required once verified |
| `owner_login` | varchar(100) nullable | Display snapshot only; never control evidence by itself |
| `owner_type` | RepositoryOwnerType nullable | Required once verified for personal vs organization/shared policy |
| `visibility` | RepositoryVisibility nullable | Required once verified; legacy absence is unknown, never inferred public |
| `reconciliation_status` | ProjectSourceReconciliationStatus | `unresolved` for legacy URL fallback, `conflict` when diagnostics require operator resolution, otherwise `verified` |
| `reconciliation_diagnostic` | varchar(100) nullable | Safe diagnostic code only; no provider error/payload |
| `created_at` / `updated_at` | timestamp | Audit timestamps |

Unique `(provider, provider_repository_id)` applies when the repository ID is
known. A legacy fallback canonical key is never silently treated as immutable
provider proof and is never publishable. Live reconciliation changes the key
only inside a collision-checked Projects transaction.

## ProjectRepositorySourceAlias

A Projects-owned alias ledger prevents a normalized legacy URL and a later
numeric identity from representing separate canonical publication claims.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `repository_source_id` | UUID | Canonical Projects-owned source |
| `provider` | ProjectSourceProvider | `github` in SK-112 |
| `alias_type` | ProjectSourceAliasType | Numeric provider ID or normalized URL |
| `alias_value` | varchar(500) | Canonical string; hashes are not used as equality evidence |
| `verified_at` | timestamp nullable | Live verification time; null for migration-only URL observations |
| `created_at` | timestamp | Audit timestamp |

Unique `(provider, alias_type, alias_value)` means one alias maps to exactly one
source. Every verified source reserves its numeric-ID alias and current
normalized-URL alias. Reconciliation that encounters aliases on different
sources stops with `conflict` diagnostics unless Projects can safely repoint all
Projects-owned relations in one reviewed transaction. Publication accepts only
a `verified` source with a stable numeric alias, then the partial unique Project
index chooses one published Project for that canonical source.

## ProjectSourceSnapshot

Append-only imported evidence. A snapshot is never edited after adoption; a
later refresh creates another row.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Evidence/snapshot identifier |
| `project_id` | UUID | Owning Project |
| `repository_source_id` | UUID | Canonical source used |
| `sequence` | integer | Monotonic per Project; unique `(project_id, sequence)` |
| `provider_repository_id` | varchar(50) nullable | Identity observed at fetch |
| `full_name` / `repository_url` | string | Canonical attribution observed at fetch |
| `owner_provider_id` / `owner_type` | string/enum nullable | Immutable control inputs observed at fetch; null only for explicitly `legacy_unverified` migration evidence |
| `visibility` | RepositoryVisibility | Visibility observed at fetch |
| `default_branch` | varchar(255) | Source-owned |
| `provider_version` | varchar(255) nullable | ETag/content marker/normalized version when available |
| `source_updated_at` / `source_pushed_at` | timestamp nullable | Provider facts when available |
| `fetched_at` | timestamp | Successful required source read |
| `completeness` | ProjectSourceCompleteness | Complete or explicitly partial |
| `field_status` | JSON | Per area: `updated`, `unchanged`, `retained_stale`, `unavailable`, or `not_provided` |
| `description` | text nullable | Source description; status distinguishes verified null from unknown |
| `languages` | JSON nullable | Source-owned |
| `topics` | JSON/array nullable | Source-owned |
| `derived_technologies` | JSON/array nullable | Deterministic source default with provenance |
| `statistics` | JSON nullable | Allowlisted normalized source facts only |
| `readme_content` | text nullable | Owner-only evidence; never public for private source |
| `safe_failure_codes` | JSON/array | Sanitized unavailable-area codes, never raw provider errors |
| `provenance` | JSON | Endpoint/category and normalization version, no provider object/token |
| `authorization_evidence_ref` | varchar(160) nullable | Opaque internal proof reference from GitHub module; not an installation ID |
| `authorization_checked_at` | timestamp nullable | Time current read authority was established; null only for legacy migration evidence |
| `selection_status` | ProjectSourceSelectionStatus | Safe selection observation |
| `uncertainty` | JSON nullable | Explicit unknown/stale/retained areas |
| `redaction_scope` | JSON | Owner/private/public disclosure classification |
| `created_at` | timestamp | Insert time |

Missing data is represented through `field_status` and `uncertainty`; a missing
value is not assumed to be a verified empty value. Private snapshot rows remain
backend-private after publication and revocation.

## ProjectSourceState

One mutable, safe status row per source-backed Project.

| Field | Type | Rules |
|---|---|---|
| `project_id` | UUID | Primary key and Project relation |
| `current_snapshot_id` | UUID | Last successfully adopted snapshot |
| `sync_status` | ProjectSourceSyncStatus | Owner-visible safe state |
| `authorization_status` | ProjectSourceAuthorizationStatus | Last observed read state |
| `selection_status` | ProjectSourceSelectionStatus | Last observed selection state |
| `last_required_read_at` | timestamp nullable | Last successful read of required identity/visibility facts |
| `fresh_until` | timestamp nullable | Exactly `last_required_read_at + 15 minutes`; stale at or after this instant |
| `invalidated_at` | timestamp nullable | Known invalidation recognition time; immediately overrides `fresh_until` |
| `invalidation_reason` | ProjectSourceInvalidationReason nullable | Safe reason from a typed SK-107 signal or live check |
| `public_attribution_status` | ProjectPublicAttributionStatus | `withheld` for private sources and after affected known invalidation; never inferred from frontend state |
| `last_attempt_at` | timestamp nullable | Latest refresh attempt start |
| `last_success_at` | timestamp nullable | Same as current snapshot fetch/adoption time |
| `last_failure_code` | varchar(100) nullable | Safe application code only |
| `last_failure_at` | timestamp nullable | Owner recovery context |
| `updated_at` | timestamp | Status update time |

Revocation may update this safe Projects-owned observation, but the authoritative
installation/selection state remains in `github`. Every private read and
publication control check revalidates through `github`; this row is never used
as sole authorization evidence. Freshness is evaluated with an injected clock:
`fresh` only while `now < fresh_until` and no invalidation is present. At
`now >= fresh_until`, or immediately when `invalidated_at` is set, the effective
state is stale/revoked even if a background update has not run.

## ProjectSourceRefreshAttempt

Append-only operational record for idempotency, concurrency, and owner status.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | UUID | Project relation |
| `actor_user_id` | UUID | Authenticated persisted owner |
| `base_revision` | integer | Project revision before provider I/O |
| `operation_receipt_id` | UUID | Idempotency relation |
| `status` | enum/string | `refreshing`, `adopted`, `partial`, `failed`, `conflict`, `authorization_revoked` |
| `adopted_snapshot_id` | UUID nullable | Set only after successful adoption |
| `safe_failure_code` | varchar(100) nullable | No raw provider details |
| `started_at` / `completed_at` | timestamp | Duration and status |

Failed attempts never replace `ProjectSourceState.current_snapshot_id`.

## ProjectStateTransition

Append-only business audit for publication and archive.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | UUID | Project relation |
| `actor_user_id` | UUID nullable | Authenticated owner; null only for migration records |
| `transition_type` | ProjectTransitionType | Explicit action/provenance |
| `from_status` / `to_status` | ProjectStatus | Must match approved matrix |
| `from_revision` / `to_revision` | integer | Exact Project versions |
| `source_snapshot_id` | UUID nullable | Evidence used for publication |
| `control_method` | ProjectControlMethod nullable | Required for repository-backed publication; legacy migration is unverified |
| `authorization_evidence_ref` | varchar(160) nullable | Opaque internal proof reference |
| `control_checked_at` | timestamp nullable | Required for new publication |
| `validation_outcome` | JSON | Allowlisted rule/result codes; no source payload/secrets |
| `operation_receipt_id` | UUID nullable | Retry trace |
| `occurred_at` | timestamp | Transition time |

Unique `(project_id, transition_type)` is valid for this feature because it
allows at most one publish and one archive and defines no reactivation. A future
reactivation specification must revise this constraint deliberately.

## ProjectOperationReceipt

Projects-owned idempotency ledger.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `actor_user_id` | UUID | Authenticated actor |
| `operation` | ProjectOperation | Scopes key reuse |
| `key_hash` | varchar(128) | SHA-256 of `Idempotency-Key`; raw key not persisted |
| `request_fingerprint` | varchar(128) | Canonical request hash including target and expected revision |
| `status` | ProjectOperationStatus | In progress/succeeded/failed |
| `project_id` | UUID nullable | Result reference |
| `result_revision` | integer nullable | Safe replay result |
| `transition_id` | UUID nullable | Publish/archive result reference |
| `safe_failure_code` | varchar(100) nullable | Recorded deterministic result when appropriate |
| `created_at` / `completed_at` / `expires_at` | timestamp | Minimum 24-hour replay window |

Unique `(actor_user_id, operation, key_hash)`. A matching fingerprint replays
the stored outcome. A different fingerprint returns
`PROJECT_IDEMPOTENCY_KEY_REUSED` and changes nothing.

The planned `ProjectOperationService` is the sole owner of receipt reservation,
replay, fingerprint-conflict detection, and transactional completion. It does
not authorize a Project, call a provider, validate a transition, or mutate
Project/source presentation; those decisions remain in the focused Projects
workflow services.

## Relationships

```text
User 1 ──< Project >── 0..1 ProjectRepositorySource ──< ProjectRepositorySourceAlias
              │
              ├── 0..1 ProjectSourceState ──> current ProjectSourceSnapshot
              ├── * ProjectSourceSnapshot
              ├── * ProjectSourceRefreshAttempt
              ├── * ProjectStateTransition
              └── * ProjectOperationReceipt (result reference)

User 1 ──< ProjectOperationReceipt

GitHub installation/selection (github-owned)
        ── typed, redacted proof/invalidation ──> Projects workflow/audit state
```

No Projects table has a writable foreign key to a GitHub-owned installation or
credential record. The opaque evidence reference is an audit value, not a
cached authorization grant.

## State Transitions

| Current | Command | Required checks | Result |
|---|---|---|---|
| none | create draft | active OWNER/CONTRIBUTOR, trustworthy current preview source, idempotency | `draft`, revision 1 |
| draft | edit | persisted owner, expected revision, allowlisted fields | draft, revision +1 |
| draft/published | refresh | persisted owner, current source authorization, expected revision at adoption | same state, revision +1 only if adopted |
| draft | publish | persisted owner, expected revision, completeness, globally ready legacy reconciliation, verified numeric source, current source/control evidence, unique published source | `published`, set `published_at`, revision +1 |
| published | publish retry | matching receipt or already-applied same intent | unchanged; replay one result |
| published | archive | persisted owner, expected revision | `archived`, set `archived_at`, revision +1 |
| published | return to draft | never allowed | 409, unchanged |
| archived | publish/edit/reactivate | outside this feature | 409, unchanged |
| any | failed/conflicting command | no complete valid transition | unchanged business state; safe attempt/receipt outcome only |

Refresh of published metadata may update owner-visible source state and
non-overridden effective fields, but it cannot make the project private or
republish it. A known visibility/control/access invalidation immediately marks
evidence stale/revoked and withholds affected public repository attribution and
content; the Project remains `published` until explicit archive.

## Publication Validation

A repository-backed draft is publishable only when all are true:

- acting account is active OWNER or CONTRIBUTOR;
- persisted `owner_id` matches the actor;
- expected revision and current state `draft` match;
- non-empty title satisfies its limit; optional description satisfies its limit;
- category and difficulty are selected;
- tags/technologies satisfy normalized limits when present; this feature does
  not invent a new minimum count;
- the global legacy-publication readiness gate has no unresolved or conflicting
  already-published sources;
- its source is `verified`, has a stable numeric ID/alias, and is not only a URL
  fallback;
- a current adopted source snapshot has trustworthy canonical identity and
  visibility and is not in authorization-revoked state;
- a live publication check successfully revalidates required identity,
  visibility, and control regardless of whether the 15-minute display freshness
  window has elapsed; failure leaves draft and current snapshot unchanged;
- personal public source has immutable owner-ID identity match, or the current
  GitHub App/explicit-selection proof applies;
- no other Project holds the published-source unique constraint;
- explicit `confirm: true` and a valid idempotency key are present.

Indexing, AI, semantic search, notification delivery, and README availability
are not publication conditions.

## Forward-Only Migration and Data Repair

1. Preflight current status/timestamps, duplicate non-null repository IDs, URL
   normalization collisions, null IDs, and conflicts between URL and numeric
   observations. Emit stable diagnostics when published rows need a human
   decision; never silently archive a Project.
2. Add new nullable relations/fields and new Projects-owned source, alias,
   snapshot, state, attempt, transition, and receipt tables without removing
   legacy columns. Migrations perform no DNS, HTTP, provider, or other network
   access.
3. Backfill one ProjectRepositorySource per locally known provider repository
   ID and reserve its numeric and normalized-URL aliases. When ID is absent,
   create only the URL fallback alias and set reconciliation status
   `unresolved`; when observations collide, mark/report `conflict`.
4. Backfill one snapshot/source-state pair from stored legacy source fields.
   Preserve unknown-vs-empty conservatively in `field_status`.
5. Mark all legacy title/description/tags/technologies as manual because their
   provenance cannot be reconstructed safely.
6. Preserve `published_at`; create `migration_publish` audits with
   `legacy_unverified`. For legacy archived rows, preserve available timestamps
   and label any timestamp fallback as migration provenance.
7. Drop the global `github_repo_url` unique constraint, make legacy GitHub
   columns nullable, and add state/alias checks and indexes. Keep the core
   Project source relation nullable for future repository-free work, while
   SK-112 commands require it.
8. Run the publication-readiness diagnostic. New publication remains disabled
   in Projects while any already-published legacy source is `unresolved` or
   `conflict`. Reconcile through live GitHub output outside the migration and a
   collision-checked Projects transaction; never use URL equality as numeric
   proof.
9. After readiness reaches zero, apply a second forward-only constraints
   migration that rechecks the gate and adds the partial published-source unique
   index. It fails diagnostically if readiness regresses. Prove URL and numeric
   aliases cannot bypass it with PostgreSQL integration tests.
10. Deploy source-relation reads/writes and verify counts, status, owner fields,
   and public visibility. Keep legacy columns during the first verified rollout.
11. Repair forward if needed. Drop legacy columns only in a separately reviewed
   later migration; never edit deployed migration history.

## Retention and Redaction

- Private snapshots remain accessible only through owner-authorized backend
  paths and are never included in public DTOs, indexing, or AI inputs.
- Revocation stops future private reads and downstream use; it does not corrupt
  or automatically delete valid owner-controlled Project data. For an already
  published Project it also changes the Projects-owned public attribution state
  to `withheld` while preserving `published` status.
- Snapshot/transition retention follows the platform's later approved retention
  policy. Until then, no destructive cleanup is introduced by SK-112.
- Operation receipts contain only hashes and safe result references and may be
  purged after their replay/audit window by a later bounded maintenance task.
