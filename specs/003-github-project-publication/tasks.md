# Tasks: GitHub-Backed Project Draft and Publication

**Branch**: `feature/sk-112-github-project-publication`  
**Input**: Design documents from `specs/003-github-project-publication/`  
**Traceability**: Jira SK-112 / TASK-2-03; dependency SK-107 / TASK-1-05;
PRD FR-034 through FR-039; constitution v3.0.0; ADR-002

**SK-107 status at generation**: **BLOCKED**. The current repository does not
contain the required GitHub App installation, explicit repository-selection,
revocation/webhook, and deterministic contract-test capability. A later T002
audit may mark it AVAILABLE only with repository evidence. Broad repository
OAuth is never an acceptable substitute.

**Repository-free boundary**: Every Project created or published by SK-112 is
GitHub-backed. The nullable source design preserves compatibility for a separate
future repository-free feature; no task below creates its DTOs, routes, creation
workflow, or publication workflow.

**Tests**: Required. Tasks include unit, PostgreSQL integration/migration,
authorization/security, API contract, provider-failure, and relevant E2E
coverage. Do not mark a task complete when its required test is skipped.

**Format**: `[ID] [P?] [Story] Description`. `[P]` permits parallel work only
after dependencies are complete and when tasks do not edit the same file.

---

## Phase 1: Setup and Brownfield Safety

**Purpose**: Reconfirm the active branch, dirty worktree, existing implementation,
and hard external dependency before product-code work.

- [ ] T001 Verify `git branch --show-current` reports `feature/sk-112-github-project-publication`; stop if it reports `main`; inspect `git status --short`, `specs/003-github-project-publication/`, `src/modules/projects/`, `src/modules/github/`, `src/modules/identity/`, `src/modules/contribution-tasks/`, `src/modules/applications/`, `src/shared/config/`, `prisma/schema.prisma`, `prisma/migrations/`, `test/`, all affected module READMEs, current API contracts, and overlapping human changes before implementation, recording blockers in `specs/003-github-project-publication/tasks.md` (SK-112, constitution VIII)
- [ ] T002 Audit current SK-107 code and tests against `specs/003-github-project-publication/contracts/github-module-contract.md` and `src/modules/github/README.md`; record SK-107 as AVAILABLE or BLOCKED with evidence; while BLOCKED, stop private and organization/shared acceptance work and do not implement installation persistence, selection storage, credentials, tokens, or webhook ownership in SK-112 (SK-107, FR-007, FR-021)

**Checkpoint**: The feature branch and human changes are protected, current
behavior is understood, and SK-107 has an explicit evidence-backed status.

---

## Phase 2: Foundational Configuration, Module Boundaries, Persistence, and Command Safety

**Purpose**: Complete every cross-story prerequisite before implementing a user
story route.

**CRITICAL**: No user-story implementation begins until this phase passes.

### Validated GitHub Configuration

- [ ] T003 [P] Add failing validation tests for default and custom `GITHUB_API_URL`, `GITHUB_API_OVERALL_TIMEOUT_MS`, and `GITHUB_API_REQUEST_TIMEOUT_MS`, including malformed/insecure production URLs, non-positive values, overall values above 8000, and request timeout greater than overall timeout in `src/shared/config/env.validation.spec.ts` (SC-001, constitution Project Constraints)
- [ ] T004 Implement validated defaults and cross-field deadline rules for `GITHUB_API_URL`, `GITHUB_API_OVERALL_TIMEOUT_MS`, and `GITHUB_API_REQUEST_TIMEOUT_MS` in `src/shared/config/env.validation.ts` (SC-001)
- [ ] T005 [P] Document `GITHUB_API_URL=https://api.github.com`, `GITHUB_API_OVERALL_TIMEOUT_MS=8000`, and `GITHUB_API_REQUEST_TIMEOUT_MS=4000` with safe operational comments in `.env.example` (SC-001)
- [ ] T006 Add failing client tests proving `ConfigService` supplies the normalized base URL and deadlines, every required/optional/README fetch receives a bounded abort signal, and no retry exceeds the absolute provider deadline in `src/modules/github/integrations/github-api.client.spec.ts` (SC-001, SC-007)
- [ ] T007 Inject `ConfigService` into `GitHubApiClient`, remove the hardcoded GitHub API base URL, normalize the configured base once, and enforce the lesser of remaining overall time and per-request timeout for every fetch in `src/modules/github/integrations/github-api.client.ts` (SC-001, SC-007)

### Deterministic Clock

- [ ] T008 [P] Add unit tests for an injectable system clock and deterministic boundary use in `src/shared/time/clock.service.spec.ts` (IR-008)
- [ ] T009 Implement the reusable technical clock provider in `src/shared/time/clock.service.ts` without project business rules in `shared/` (IR-008, ADR-002)

### Module-Owned Summary Readers

- [ ] T010 [P] Add tests for owner-scoped open-request counts, monthly request quota, bounded project IDs, and zero summaries in `src/modules/contribution-tasks/services/contribution-task-project-summary.service.spec.ts` (FR-010, constitution III)
- [ ] T011 Implement and export the typed owner-workspace summary reader from `src/modules/contribution-tasks/services/contribution-task-project-summary.service.ts` and `src/modules/contribution-tasks/contribution-tasks.module.ts`, reading only ContributionTasks-owned data (FR-010, constitution III)
- [ ] T012 [P] Add tests for approved pending-application states, server-generated request scopes, bounded project IDs, and zero summaries in `src/modules/applications/services/application-project-summary.service.spec.ts` (FR-010, constitution III)
- [ ] T013 Implement and export the typed pending-application summary reader from `src/modules/applications/services/application-project-summary.service.ts` and `src/modules/applications/applications.module.ts`, reading only Applications-owned rows (FR-010, constitution III)
- [ ] T014 [P] Add tests for persisted active-Admin authorization, batched owner IDs, allowlisted display fields, and rejection of request-supplied Admin claims in `src/modules/identity/services/identity-owner-summary.service.spec.ts` (FR-020, TS-001)
- [ ] T015 Implement and export the active-Admin-authorized owner-summary reader from `src/modules/identity/services/identity-owner-summary.service.ts` and `src/modules/identity/identity.module.ts`, reading only Identity-owned account data (FR-020, TS-001)
- [ ] T016 Add architecture/contract tests proving Projects has no direct Prisma query of ContributionRequest, Application, or User-owned relations and no private-module import fallback in `test/project-summary-module-boundaries.spec.ts` (FR-010, FR-020, constitution III)

### Forward-Only Persistence and Legacy Reconciliation

- [ ] T017 [P] Add reusable isolated PostgreSQL migration/concurrency helpers in `test/helpers/prisma-test-database.ts` (IR-002-IR-004, constitution VII/IX)
- [ ] T018 [P] Add normalized public/private source, legacy URL/numeric-ID alias, actor, invalidation, and command fixtures without real secrets in `test/fixtures/github-project-publication.fixture.ts` (DR-001-DR-007, PR-002-PR-005)
- [ ] T019 Add failing expand/backfill tests for legacy draft/published/archived rows, missing numeric IDs, URL normalization, numeric/URL alias collisions, conservative manual overrides, freshness/disclosure state, status timestamps, diagnostics, zero network access, and retained legacy columns in `test/project-publication-migration.integration-spec.ts` (FR-018-FR-019, SR-001-SR-010, SC-008, SC-010)
- [ ] T020 Update `prisma/schema.prisma` with nullable Project source association, revision/manual flags/archive time, `ProjectRepositorySource`, `ProjectRepositorySourceAlias`, reconciliation status/diagnostics, source snapshot/state including freshness/invalidation/public-attribution fields, refresh attempts, state transitions, and operation receipts while keeping repository-free schema compatibility (FR-018-FR-019, FR-023, IR-008-IR-009, TS-002-TS-003)
- [ ] T021 Create the first forward-only expand/backfill/diagnostic migration in `prisma/migrations/<generated-timestamp>_github_project_draft_expand_backfill/migration.sql`; perform no network access, preserve data/legacy columns, remove global URL uniqueness, reserve locally known aliases, and leave unresolved/conflicting published sources diagnosed rather than deleted or silently merged (FR-018-FR-019, constitution VII)
- [ ] T022 Validate the first migration with `npx prisma validate`, isolated apply/repair-forward tests, row-count/status/owner comparisons, and explicit network-denial assertions in `test/project-publication-migration.integration-spec.ts` (FR-018-FR-019, SC-008, SC-010)
- [ ] T023 Add failing reconciliation tests for normalized live GitHub output, numeric-ID and normalized-URL alias reservation, safe source merging/repointing, collision rollback, idempotent replay, and no GitHub-owned table writes in `test/project-source-reconciliation.integration-spec.ts` (FR-019, IR-003-IR-004)
- [ ] T024 Implement collision-checked Projects-owned legacy-source reconciliation transactions in `src/modules/projects/services/project-source-reconciliation.service.ts`, consuming only normalized output from the exported GitHub service and exposing no public route (FR-019, constitution III/VII)
- [ ] T025 Add a reviewed one-shot Nest application-context runner for reconciliation in `scripts/reconcile-project-sources.ts`, calling exported module services without decrypting credentials or performing migration-time network access (FR-019, SK-107)
- [ ] T026 Add failing readiness-gate tests for unresolved/conflicting published legacy sources, safe `PROJECT_PUBLICATION_RECONCILIATION_REQUIRED`, unchanged attempted drafts, and zero-detail public errors in `src/modules/projects/services/project-source-reconciliation.service.spec.ts` (FR-019, SR-005, PR-002)
- [ ] T027 Implement the Projects-owned global publication-readiness query and safe gate result in `src/modules/projects/services/project-source-reconciliation.service.ts` (FR-019, SR-005)
- [ ] T028 Create the second forward-only constraints migration in `prisma/migrations/<generated-timestamp>_github_project_publication_constraints/migration.sql`; recheck zero unresolved/conflicting published sources, fail diagnostically if readiness regresses, and add the partial unique published-source index without network access (FR-019, constitution VII)
- [ ] T029 Prove the second migration, partial index, concurrent winner/loser behavior, and URL/numeric-alias bypass resistance in `test/project-publication-migration.integration-spec.ts` and `test/project-publication.persistence-spec.ts` (FR-019, SR-007, SC-008)

### Narrow Project Operation Receipts

- [ ] T030 Add tests for actor/operation/key reservation, SHA-256 fingerprints, same-request replay, different-request conflict, 24-hour retention, safe result references, and transactional completion in `src/modules/projects/services/project-operation.service.spec.ts` (IR-002-IR-004, TS-001-TS-002)
- [ ] T031 Implement `ProjectOperationService` in `src/modules/projects/services/project-operation.service.ts`, limited to Projects-owned receipt reservation, replay, fingerprint conflict detection, and transactional completion; do not add authorization, provider calls, transition validation, or workflow orchestration (IR-002-IR-004, ADR-002)
- [ ] T032 Register the clock, reconciliation, and operation providers and import only exported provider modules in `src/modules/projects/projects.module.ts`; permit only the typed SK-107 invalidation contract and do not add SK-112-owned webhook, credential, installation, selection, queue, AI, port, use-case, or repository-abstraction ownership (FR-017-FR-018, FR-023, ADR-002)

**Checkpoint**: Validated configuration, owned-table reads, source identity
reconciliation, publication readiness, and command receipts are safe foundations.

---

## Phase 3: User Story 1 - Preview Allowed Repository Metadata (Priority: P1) MVP

**Goal**: An active OWNER or CONTRIBUTOR receives a normalized preview or safe
failure without a Project write.

**Independent Test**: Preview public and, only when SK-107 is AVAILABLE,
App-selected private repositories; cover invalid, inaccessible, partial,
rate-limited, timed-out, and revoked sources; verify the eight-second provider
deadline, ten-second ShareK outcome, allowlists, and zero Project-owned writes.

### Tests for User Story 1

- [ ] T033 [P] [US1] Add GitHub client tests for immutable repository/owner IDs and owner type, canonical rename handling, required-payload validation, 401 remint, 429 retry-after, 5xx/timeout mapping, bounded optional concurrency, and partial 202/204/409 evidence in `src/modules/github/integrations/github-api.client.spec.ts` (FR-002, VR-001-VR-003, SC-001, SC-007)
- [ ] T034 [P] [US1] Add preview service tests for active OWNER/CONTRIBUTOR eligibility, pending/inactive/Admin rejection, public access without repository OAuth, conditional selected-private access, fingerprints, safe indistinguishable errors, partial evidence, and zero Prisma writes in `src/modules/projects/services/project-source.service.spec.ts` (FR-001-FR-007, IR-001, TS-001, SC-001-SC-002)
- [ ] T035 [P] [US1] Add authorization/security, deterministic deadline, and API-contract E2E coverage for `POST /projects/github/preview` in `test/github-project-publication.e2e-spec.ts`, asserting DTO redaction and unchanged Project/source/snapshot/receipt counts (FR-001-FR-007, PR-002, SC-001-SC-002, SC-006)

### Implementation for User Story 1

- [ ] T036 [P] [US1] Extend normalized evidence DTOs with numeric source/owner identity, owner type, source version, per-area status, provenance, uncertainty, safe authorization/selection status, and redaction scope in `src/modules/github/dto/github-repository.dto.ts` (FR-002, FR-005-FR-007, DR-001-DR-007)
- [ ] T037 [US1] Implement normalized required-payload validation, API version/User-Agent headers, safe rate/error/partial mapping, and read-only provider behavior in `src/modules/github/integrations/github-api.client.ts` using the foundational configured deadlines (VR-001-VR-003, SC-001, SC-007)
- [ ] T038 [US1] Implement or adapt the exported repository-evidence boundary in `src/modules/github/services/github-repository-access.service.ts` and `src/modules/github/github.module.ts`; public preview may proceed, but private preview remains blocked until T002 marks SK-107 AVAILABLE (FR-006-FR-007, PR-004-PR-005, SK-107)
- [ ] T039 [P] [US1] Add validated preview request and explicit preview response allowlists in `src/modules/projects/dto/github-project-preview.dto.ts`, accepting no identity/role/Admin/provider-internal fields (FR-001-FR-005, PR-002, TS-001)
- [ ] T040 [US1] Implement preview eligibility, absolute deadline propagation, normalized fingerprinting, safe GitHub error mapping, and zero persistence in `src/modules/projects/services/project-source.service.ts` (FR-001-FR-007, IR-001, TS-001)
- [ ] T041 [US1] Add the thin `POST /projects/github/preview` route and exported-service wiring in `src/modules/projects/projects.controller.ts` and `src/modules/projects/projects.module.ts` (User Story 1, FR-001-FR-007)

**Checkpoint**: Public preview passes independently; selected-private acceptance
remains explicitly blocked while SK-107 is BLOCKED.

---

## Phase 4: User Story 2 - Create and Save a Private Draft (Priority: P1)

**Goal**: An active ordinary account confirms a preview and receives one
unpublished GitHub-backed draft owned from the authenticated session.

**Independent Test**: Create and replay drafts as OWNER and CONTRIBUTOR, verify
session ownership/status/revision, preserve intentional duplicate drafts, and
prove non-owner, inactive, Admin, stale-preview, failure, and legacy routes
cannot publish or expose a draft.

### Tests for User Story 2

- [ ] T042 [P] [US2] Add draft-service tests for fingerprint revalidation, session-derived ownership, active ordinary roles, draft-only state, source/default/manual initialization, replay, intentional duplicates, rollback, and repository-source requirement in `src/modules/projects/services/project-draft.service.spec.ts` (FR-008-FR-010, FR-016, FR-018-FR-019, IR-002, SC-002)
- [ ] T043 [P] [US2] Add PostgreSQL tests for atomic Project/source/snapshot/state/receipt creation, concurrent same-key creation, different-key same-source drafts, and nullable source schema compatibility without a repository-free request flow in `test/project-draft.persistence-spec.ts` (FR-008-FR-010, FR-018-FR-019, SC-008, SC-010)
- [ ] T044 [P] [US2] Add create-draft/owner-detail E2E coverage for OWNER/CONTRIBUTOR success, inactive/Admin rejection, extra authority-field rejection, non-owner 404, rollback, pagination, and legacy route 410 in `test/github-project-publication.e2e-spec.ts` (FR-003, FR-008-FR-010, FR-014, FR-016, FR-020, TS-001)

### Implementation for User Story 2

- [ ] T045 [P] [US2] Add GitHub-backed draft-create, source confirmation, pagination, and owner-detail request DTOs in `src/modules/projects/dto/create-github-project-draft.dto.ts` and `src/modules/projects/dto/my-projects.dto.ts`, accepting no null source, status, or authority field (FR-008-FR-010, FR-016, FR-018, TS-001)
- [ ] T046 [P] [US2] Add explicit owner Project/source response DTOs and allowlist mapping in `src/modules/projects/dto/project-owner-response.dto.ts` and `src/modules/projects/mappers/project-owner.mapper.ts` (DR-003-DR-007, PR-002, SC-006)
- [ ] T047 [US2] Implement current-source re-resolution and atomic GitHub-backed draft/source/snapshot/state/receipt creation in `src/modules/projects/services/project-draft.service.ts`, deriving owner from session and forcing `draft`, revision 1 (FR-008-FR-010, SR-001-SR-003, IR-002)
- [ ] T048 [US2] Add `POST /projects` and persisted-owner-only `GET /projects/me/:projectId` with idempotency/actor binding in `src/modules/projects/projects.controller.ts` (FR-008-FR-010, PR-002)
- [ ] T049 [US2] Add owner-workspace tests proving batched ContributionTasks/Applications readers supply counts/quota, OWNER and CONTRIBUTOR are eligible, and Projects performs no foreign-table query or fallback in `src/modules/projects/projects.service.spec.ts` and `test/project-summary-module-boundaries.spec.ts` (FR-003, FR-010, constitution III)
- [ ] T050 [US2] Refactor `getMyProjects` to query only Projects-owned data and compose exported ContributionTasks/Applications summaries with bounded cursor pagination in `src/modules/projects/projects.service.ts` and `src/modules/projects/projects.module.ts` (FR-003, FR-010, TS-001)
- [ ] T051 [US2] Replace `POST /projects/import/github` with a no-write `410 PROJECT_IMPORT_ROUTE_RETIRED` tombstone and remove status-driven create/update behavior in `src/modules/projects/projects.controller.ts`, `src/modules/projects/projects.service.ts`, and `src/modules/projects/dto/import-project.dto.ts` (FR-008, FR-016, SR-001-SR-003)
- [ ] T052 [US2] Adapt obsolete direct-publish/global-private-duplicate assertions while preserving valid owner/Admin baselines in `src/modules/projects/projects.service.spec.ts` and `test/github-onboarding.spec.ts` (FR-003, FR-016, FR-019)

**Checkpoint**: Every SK-112-created Project is an unpublished GitHub-backed
draft, and the owner workspace respects module ownership.

---

## Phase 5: User Story 3 - Review and Edit Owner-Controlled Information (Priority: P1)

**Goal**: The persisted owner edits only approved ShareK presentation fields or
explicitly restores source defaults without changing source identity.

**Independent Test**: Edit valid/null/empty values, restore one source default,
reject source/authority changes, and race owner/non-owner/Admin revisions.

### Tests for User Story 3

- [ ] T053 [P] [US3] Add edit-service tests for validation limits, manual flags, explicit null/empty semantics, restore-from-source, edit/restore exclusion, immutable source identity, owner lookup, invalid state, and revision conflict in `src/modules/projects/services/project-draft.service.spec.ts` (FR-010-FR-011, DR-003-DR-005, IR-004, SC-004)
- [ ] T054 [P] [US3] Add PostgreSQL tests for conditional owner/revision updates, concurrent winner/loser behavior, and atomic effective-value/override changes in `test/project-draft.persistence-spec.ts` (FR-011, IR-004, SC-008)
- [ ] T055 [P] [US3] Add authorization/security and API-contract E2E coverage for `PATCH /projects/me/:projectId`, non-owner/Admin 404, rejected authority/source fields, and stale revision 409 in `test/github-project-publication.e2e-spec.ts` (FR-010-FR-011, PR-002, TS-001, SC-006)

### Implementation for User Story 3

- [ ] T056 [P] [US3] Add the validated update request and `restoreFromSource` mutual-exclusion rules in `src/modules/projects/dto/update-project.dto.ts` (FR-011, DR-003-DR-005, IR-004)
- [ ] T057 [US3] Implement persisted-owner lookup, state/revision validation, manual tracking, and source restoration in `src/modules/projects/services/project-draft.service.ts` without accepting source identity changes (FR-010-FR-011, IR-004, TS-001)
- [ ] T058 [US3] Extend `src/modules/projects/mappers/project-owner.mapper.ts` to distinguish effective values, manual overrides, and source defaults without returning Prisma/provider objects (DR-004-DR-007, PR-002)
- [ ] T059 [US3] Add the thin `PATCH /projects/me/:projectId` route with idempotency/actor binding in `src/modules/projects/projects.controller.ts` (User Story 3, FR-010-FR-011)

**Checkpoint**: Owner edits are durable, source identity is immutable through
ordinary edits, and concurrent changes cannot silently overwrite newer data.

---

## Phase 6: User Story 5 - Explicitly Publish a Valid Draft (Priority: P1)

**Goal**: The persisted owner explicitly publishes one valid GitHub-backed
draft after current source/control verification and may later archive it.

**Independent Test**: Publish complete/incomplete/stale drafts; cover personal
identity and conditional App-selected control, readiness failure, provider
failure, duplicate races, replay, archive, and indexing independence.

### Tests for User Story 5

- [ ] T060 [P] [US5] Add Identity provider-account tests for immutable numeric GitHub ID, absent/unlinked identity, actor scope, and no token/raw-profile disclosure in `src/modules/identity/services/identity-provider-account.service.spec.ts` (FR-021, TS-001)
- [ ] T061 [P] [US5] Add publication-validator tests for `draft -> published -> archived`, title/category/difficulty, optional field validity, explicit confirmation, revision, verified numeric source, readiness gate, current control, invalid transitions, and indexing independence in `src/modules/projects/validators/project-publication.validator.spec.ts` (FR-015-FR-019, SR-003-SR-010, SC-005, SC-009)
- [ ] T062 [P] [US5] Add GitHub control tests for numeric personal match, login rename, transfer, organization/shared/private App selection, revocation, no collaborator-OAuth fallback, and safe provider failure in `src/modules/github/services/github-repository-access.service.spec.ts`; block App cases while SK-107 is BLOCKED (FR-015, FR-021, PR-004-PR-005)
- [ ] T063 [P] [US5] Add publication-service tests for publication-time identity/visibility/control revalidation, exact stale handling, timeout/rate-limit/revocation safe retries, unchanged draft/revision/owner/current snapshot on failure, and `PROJECT_PUBLICATION_RECONCILIATION_REQUIRED` in `src/modules/projects/services/project-publication.service.spec.ts` (FR-015, FR-019, IR-008-IR-009, SC-005, SC-007)
- [ ] T064 [P] [US5] Add PostgreSQL tests for publication/archive CAS, Project+transition+receipt atomicity, readiness rollback, numeric/URL alias races, losing-draft preservation, audit redaction, and released claim after archive in `test/project-publication.persistence-spec.ts` (FR-019, SR-004-SR-010, IR-003-IR-004, SC-005, SC-008)
- [ ] T065 [P] [US5] Add publish/archive E2E coverage for required fields, stale revalidation, safe provider/reconciliation failure, owner/non-owner/Admin authorization, personal/App proof, retry, duplicates, invalid transitions, and AI/indexing independence in `test/github-project-publication.e2e-spec.ts` (FR-015-FR-021, IR-008-IR-009, SC-005, SC-009)

### Implementation for User Story 5

- [ ] T066 [P] [US5] Implement and export the narrow authenticated GitHub provider-ID lookup in `src/modules/identity/services/identity-provider-account.service.ts` and `src/modules/identity/identity.module.ts` (FR-021, TS-001)
- [ ] T067 [P] [US5] Implement current publication-control verification and redacted proof output in `src/modules/github/services/github-repository-access.service.ts`, using trusted Identity output for personal public control and only real SK-107 App/selection evidence for organization/shared/private control (FR-015, FR-021, PR-004)
- [ ] T068 [P] [US5] Implement deterministic publication completeness/control/state rules in `src/modules/projects/validators/project-publication.validator.ts` without AI/indexing or invented description/tag/technology minimums (FR-015-FR-017, SR-003-SR-010)
- [ ] T069 [P] [US5] Add publish/archive request and transition response DTO allowlists with `expectedRevision` and `confirm: true` in `src/modules/projects/dto/project-transition.dto.ts` (FR-015-FR-016, TS-002)
- [ ] T070 [US5] Implement publication preflight in `src/modules/projects/services/project-publication.service.ts`: owner/state/revision, global readiness, verified numeric identity, and live source/control checks outside the transaction, mapping failure to safe retry/recovery without changing the draft (FR-015, FR-019, FR-021, IR-008-IR-009)
- [ ] T071 [US5] Implement the transactional published-source claim, first publication timestamp, transition audit, receipt completion/replay, and safe uniqueness mapping in `src/modules/projects/services/project-publication.service.ts` (FR-015-FR-019, SR-004-SR-007, IR-003-IR-004)
- [ ] T072 [US5] Implement explicit `published -> archived` and reject direct return-to-draft or archived reactivation in `src/modules/projects/services/project-publication.service.ts` while preserving publication history (SR-008-SR-010)
- [ ] T073 [US5] Add thin publish/archive routes with actor/idempotency binding in `src/modules/projects/projects.controller.ts` (User Story 5, FR-015-FR-016, SR-008)
- [ ] T074 [US5] Wire `IdentityModule`, exported GitHub control, reconciliation readiness, publication service, and validator through `src/modules/projects/projects.module.ts` without circular/private imports (FR-019, FR-021, ADR-002)

**Checkpoint**: Public-personal publication can pass independently; App-backed
organization/shared/private acceptance remains blocked until SK-107 is AVAILABLE.

---

## Phase 7: User Story 6 - View Only Published Projects Publicly (Priority: P1)

**Goal**: Visitors use minimal `/public/projects` list/detail reads that include
only allowlisted published Projects and safely withhold private or invalidated
source attribution.

**Independent Test**: Query published/draft/archived/missing Projects, pagination,
private and invalidated source variants, Admin aggregates, and `/projects/me`;
prove query-level visibility, public DTO redaction, immediate withholding without
automatic archive, and route-namespace isolation.

### Tests for User Story 6

- [ ] T075 [P] [US6] Add public mapper tests for exact allowlists, public attribution, private source withholding, known-invalidated source withholding, and exclusion of revision/owner-private/evidence/auth/provider fields in `src/modules/projects/mappers/public-project.mapper.spec.ts` (FR-022-FR-023, PR-001-PR-004, SC-003, SC-006-SC-007)
- [ ] T076 [P] [US6] Add PostgreSQL tests for `status = published`, stable cursor pagination, draft/archived 404, withdrawal/read races, invalidation disclosure state, and preservation of `published` after source loss in `test/project-publication.persistence-spec.ts` (FR-022-FR-023, SR-010, TS-004)
- [ ] T077 [P] [US6] Add authorization/security and API-contract E2E coverage for `GET /public/projects`, `GET /public/projects/:projectId`, guessed private IDs, cursor limits, invalidated/private redaction, post-loss published visibility, and a regression proving `/projects/me` reaches only the authenticated owner route in `test/project-public-visibility.e2e-spec.ts` (FR-022-FR-023, PR-001-PR-005, SC-003, SC-006-SC-007)
- [ ] T078 [P] [US6] Add Admin aggregate tests proving active-Admin authorization occurs in Identity, account summaries are allowlisted, published-only Projects are grouped in Projects, and no direct User relation/fallback is queried in `src/modules/projects/projects.service.spec.ts` and `test/project-summary-module-boundaries.spec.ts` (FR-020, PR-001-PR-003)
- [ ] T079 [P] [US6] Add invalidation-service tests for revocation, unselection, ownership transfer, deletion, visibility change, equivalent signals, duplicate/out-of-order versions, immediate stale/withheld state, stopped source use, and no automatic archive in `src/modules/projects/services/project-source-invalidation.service.spec.ts` (FR-023, SR-010, PR-004, IR-008, SC-005, SC-007)

### Implementation for User Story 6

- [ ] T080 [P] [US6] Add published-summary/detail/page DTOs and public/withheld source attribution variants in `src/modules/projects/dto/project-public-response.dto.ts` and `src/modules/projects/mappers/public-project.mapper.ts` (FR-022-FR-023, PR-001-PR-004)
- [ ] T081 [US6] Implement published-only cursor list/detail queries and indistinguishable missing/draft/archived behavior in `src/modules/projects/services/public-projects.service.ts`, selecting only public-mapper fields (FR-022, PR-001, TS-004)
- [ ] T082 [US6] Add unauthenticated `GET /public/projects` and `GET /public/projects/:projectId` in `src/modules/projects/public-projects.controller.ts` and register them without any dynamic public `/projects/:projectId` route in `src/modules/projects/projects.module.ts` (FR-022, PR-001)
- [ ] T083 [US6] Refactor the Admin published-owner aggregate to compose Projects-owned publication groups with `IdentityOwnerSummaryService`, never selecting the User relation or private source URL, in `src/modules/projects/projects.service.ts`, `src/modules/projects/dto/admin-published-project-owner.dto.ts`, and `src/modules/projects/projects.module.ts` (FR-020, PR-002-PR-003, constitution III)
- [ ] T084 [US6] Implement idempotent Projects-owned invalidation/disclosure updates in `src/modules/projects/services/project-source-invalidation.service.ts`, stopping affected source use and withholding attribution/content while leaving Project status `published` until explicit archive (FR-023, SR-010, PR-004, IR-008)
- [ ] T085 [P] [US6] Add SK-107 safe invalidation notification contract tests for normalized repository ID, approved reason, recognized time/version, redaction, and duplicate/out-of-order delivery in `src/modules/github/services/github-repository-access.service.spec.ts`; keep this task BLOCKED while SK-107 is BLOCKED (FR-023, PR-004, SK-107)
- [ ] T086 [US6] Adapt and export only the typed safe invalidation notification from `src/modules/github/services/github-repository-access.service.ts` and `src/modules/github/github.module.ts`, leaving webhook signature/delivery, installations, selections, credentials, tokens, and reconciliation state owned by SK-107; keep real wiring BLOCKED while SK-107 is BLOCKED (FR-023, constitution IV)
- [ ] T087 [US6] Register the Projects invalidation consumer against the exported GitHub notification in `src/modules/projects/projects.module.ts` and prove duplicate/out-of-order events cannot change publication state in `test/github-project-publication.e2e-spec.ts` (FR-023, SR-010, SC-005, SC-007)

**Checkpoint**: Minimal public reads are observable and collision-free; drafts
and archived Projects remain undiscoverable, and source loss withholds evidence
without hiding or archiving a published Project.

---

## Phase 8: User Story 4 - Refresh Without Losing Manual Edits (Priority: P2)

**Goal**: The persisted owner refreshes source evidence without losing manual
values or corrupting the last valid snapshot.

**Independent Test**: Refresh complete, partial, failed, timed-out, rate-limited,
revoked, exactly-15-minute, immediately-invalidated, and concurrently edited
sources; verify deterministic adoption and unchanged business state on failure.

### Tests for User Story 4

- [ ] T088 [P] [US4] Add refresh-service tests for exact fresh-before/stale-at-15-minute boundaries with the injected clock, immediate invalidation, complete/partial merge, retained-stale areas, manual preservation, replay, and no adoption on conflict/revocation in `src/modules/projects/services/project-source.service.spec.ts` (FR-012-FR-014, IR-004-IR-009, SC-004, SC-007)
- [ ] T089 [P] [US4] Add PostgreSQL tests for refresh-attempt reservation, provider I/O outside transactions, immutable snapshot/current-pointer adoption, freshness fields, CAS revisions, edit/refresh and refresh/publish/invalidation races, and failed-attempt isolation in `test/project-refresh.persistence-spec.ts` (FR-012-FR-014, IR-004-IR-009, SC-008)
- [ ] T090 [P] [US4] Add refresh E2E coverage for complete/partial/timeout/429/5xx/malformed/revoked behavior, exact freshness boundary, immediate invalidation, owner authorization, safe errors, and preserved owner/current-snapshot data in `test/github-project-publication.e2e-spec.ts` (FR-012-FR-014, PR-004-PR-006, IR-008-IR-009, SC-004, SC-007)

### Implementation for User Story 4

- [ ] T091 [P] [US4] Add the validated refresh command and safe refresh/status result fields in `src/modules/projects/dto/refresh-project-source.dto.ts` (FR-012-FR-013, IR-004, IR-008)
- [ ] T092 [P] [US4] Extend the exported GitHub access service with purpose-bound refresh, safe partial areas, current authorization/selection, and bounded failure in `src/modules/github/services/github-repository-access.service.ts`; keep private refresh BLOCKED while SK-107 is BLOCKED (FR-007, FR-012-FR-014)
- [ ] T093 [US4] Implement refresh reservation, provider fetch outside transaction, revision recheck, complete-enough immutable snapshot adoption, `lastRequiredReadAt`/`freshUntil`, and safe no-adoption failure in `src/modules/projects/services/project-source.service.ts` using the injected clock (FR-012-FR-014, IR-004-IR-009)
- [ ] T094 [US4] Implement per-area merge/provenance rules and source-default updates that skip manual overrides and preserve unknown versus verified-empty values in `src/modules/projects/services/project-source.service.ts` (DR-004-DR-007, SC-004)
- [ ] T095 [US4] Add the thin `POST /projects/me/:projectId/source/refresh` route with actor/idempotency binding in `src/modules/projects/projects.controller.ts` (User Story 4, FR-012-FR-014)

**Checkpoint**: Refresh is deterministic and cannot replace a valid snapshot or
newer manual value after provider, authorization, or concurrency failure.

---

## Phase 9: User Story 7 - Understand Source and Refresh Status (Priority: P2)

**Goal**: The owner understands attribution, freshness, uncertainty,
authorization, selection, invalidation, and recovery without provider internals.

**Independent Test**: Read fresh, exactly stale, refreshing, partial, failed,
revoked, unselected, transferred, deleted, and visibility-changed public/private
sources; verify safe recovery and conditional cached-evidence redaction.

### Tests for User Story 7

- [ ] T096 [P] [US7] Add owner mapper tests for effective/source comparison, evidence ID/version/provenance, `lastRequiredReadAt`, `freshUntil`, exact staleness, uncertainty/redaction, invalidation reason, all sync/auth/selection states, and recovery actions in `src/modules/projects/mappers/project-owner.mapper.spec.ts` (FR-005, FR-013, FR-023, IR-006-IR-009, TS-003)
- [ ] T097 [P] [US7] Add private-evidence read tests for current App/selection success, revocation/unselection/provider uncertainty, no historical-grant fallback, and redacted results in `src/modules/github/services/github-repository-access.service.spec.ts`; keep App cases BLOCKED while SK-107 is BLOCKED (PR-003-PR-005, TS-003)
- [ ] T098 [P] [US7] Add owner-detail E2E coverage across all freshness/invalidation states, public/private views, current private-read denial, archive/recovery guidance, and absence of installation/permission/error internals in `test/github-project-publication.e2e-spec.ts` (User Story 7, FR-023, PR-002-PR-006, IR-006-IR-009, SC-006-SC-007)

### Implementation for User Story 7

- [ ] T099 [P] [US7] Implement `verifyPrivateEvidenceRead` on the exported GitHub boundary in `src/modules/github/services/github-repository-access.service.ts`, requiring current App access and selection; keep private acceptance BLOCKED while SK-107 is BLOCKED (PR-003-PR-005)
- [ ] T100 [P] [US7] Complete owner source/snapshot/status DTO variants and conditional redaction in `src/modules/projects/dto/project-owner-response.dto.ts` and `src/modules/projects/mappers/project-owner.mapper.ts` (FR-005, FR-013, FR-023, PR-006, TS-003)
- [ ] T101 [US7] Update owner-detail orchestration to compute time-based freshness with the injected clock and verify current private access before including cached evidence in `src/modules/projects/services/project-draft.service.ts` (PR-003-PR-006, IR-006-IR-009)
- [ ] T102 [US7] Add integration coverage proving every invalidation reason yields immediate actionable owner status, safe source-use denial, idempotent recovery, and no publication-state change in `test/project-source-invalidation.integration-spec.ts` (FR-023, SR-010, PR-004, SC-005, SC-007)

**Checkpoint**: Owner status is deterministic, recoverable, and traceable
without treating cached authorization as current evidence.

---

## Phase 10: Polish and Cross-Cutting Verification

**Purpose**: Complete resilience, documentation, traceability, and repository
quality gates without expanding into another feature.

- [ ] T103 [P] Add consolidated GitHub failure tests for timeout cancellation, retry bounds, 401 remint, 429 retry-after, outage, revocation, malformed required data, partial data, and secret-safe logging in `src/modules/github/integrations/github-api.client.spec.ts` and `src/modules/github/services/github-repository-access.service.spec.ts` (VR-002-VR-005, SC-006-SC-007)
- [ ] T104 [P] Add deterministic fake-clock/provider performance coverage for the eight-second provider deadline and ten-second ShareK preview outcome in `test/github-project-publication.performance-spec.ts` (SC-001)
- [ ] T105 [P] Add a cross-contract security suite rejecting raw Prisma/provider objects, tokens, installation/permission data, internal errors, private content, unpublished rows, and invalidated attribution in `test/project-contract-security.e2e-spec.ts` (FR-022-FR-023, PR-001-PR-006, TS-001-TS-004, SC-003, SC-006-SC-007)
- [ ] T106 [P] Update current/target workflows, exports, table ownership, role/status rules, configuration, SK-107 BLOCKED/AVAILABLE status, invalidation behavior, and repository-free future boundary in `src/modules/projects/README.md`, `src/modules/github/README.md`, `src/modules/identity/README.md`, `src/modules/contribution-tasks/README.md`, and `src/modules/applications/README.md` (SK-112, SK-107, ADR-002)
- [ ] T107 [P] Update public `/public/projects` routes, owner routes, request/response/error allowlists, configuration, retirement guidance, and post-publication withholding examples in `docs/api-contracts.md` and `sharek-api.http` (FR-001-FR-023, PR-002)
- [ ] T108 [P] Update the two-stage forward migration, network prohibition, alias reconciliation runner, readiness gate, partial index, repair-forward process, retained legacy columns, and separate future repository-free compatibility in `docs/database-plan.md` (FR-018-FR-019, constitution VII)
- [ ] T109 Run `npm run check:architecture` and inspect imports/Prisma calls to prove Projects consumes only exported GitHub, Identity, ContributionTasks, and Applications services; verify `ProjectOperationService` remains receipt-only and no Clean Architecture layer/port/abstract repository/duplicate module was added, recording results in `specs/003-github-project-publication/tasks.md` (constitution III, ADR-002)
- [ ] T110 Run `npm run lint`, `npx tsc --noEmit`, Projects/GitHub/Identity/ContributionTasks/Applications/config unit tests, PostgreSQL migration/reconciliation/concurrency tests, authorization/contract/security/E2E suites, `npm test -- --runInBand`, `npx prisma validate`, and `npm run build`, recording exact results and SK-107-blocked cases in `specs/003-github-project-publication/tasks.md` (SC-001-SC-010, constitution IX)
- [ ] T111 Append the completed SK-112 implementation record with files, requirement IDs, tests, architecture result, both migrations, reconciliation/readiness status, API/authorization impact, SK-107 status, and risks to `docs/module-development-tracker.md` only after code behavior changes are complete (repository workflow)
- [ ] T112 Review the final diff against `specs/003-github-project-publication/spec.md`, `specs/003-github-project-publication/plan.md`, all contracts, and `.specify/memory/constitution.md`; confirm no repository-free flow, frontend, search/filtering/discovery/ranking/recommendation, AI/indexing implementation, broad-OAuth fallback, GitHub ownership leak, duplicate module, unrelated reformat, unauthorized branch switch, or unauthorized commit/push remains (SK-112 final handoff)

---

## Dependencies and Execution Order

### External SK-107 Gate

- Current status is **BLOCKED** until T002 proves the real exported service and
  contract tests exist.
- Public repository preview/draft and personal-public work may proceed through
  the typed public boundary.
- T038 private preview, T062/T067 organization/shared/private control,
  T085-T087 real invalidation wiring, T092 private refresh, and T097/T099 private
  evidence acceptance remain blocked while SK-107 is BLOCKED.
- SK-112 may adapt to SK-107 exports but never owns App installation,
  repository-selection, credential/token, webhook, or GitHub reconciliation
  persistence. Broad OAuth is never a fallback.

### Migration Gates

1. T019-T022 establish and validate the network-free expand/backfill/diagnostic
   migration.
2. T023-T027 reconcile legacy aliases outside migrations and require zero
   unresolved/conflicting published sources before new publication.
3. T028-T029 apply and validate the second constraints migration and partial
   index only after readiness succeeds.
4. Legacy-column cleanup is a separately reviewed future forward migration and
   is not an SK-112 implementation task.

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks every user-story route.
- US1 depends on Phase 2; private acceptance additionally depends on SK-107.
- US2 depends on US1's normalized preview contract.
- US3 depends on US2's draft and owner view.
- US5 depends on US2 and US3 plus the reconciliation readiness gate;
  organization/shared/private acceptance also depends on SK-107.
- US6 depends on US5's publication/archive state; real invalidation wiring also
  depends on SK-107.
- US4 depends on US2 and US3 and may proceed alongside US5 after those
  prerequisites; published-refresh races require US5.
- US7 depends on US4 and the Projects invalidation state; private disclosure
  acceptance also depends on SK-107.
- Phase 10 depends on every selected story and records any SK-107 blockers.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 -> US2 -> US3
                                  |      \
                                  |       -> US5 -> US6
                                  |      \
                                  |       -> US4 -> US7
                                  |
SK-107 --------------------------> private/App paths and real invalidation wiring
```

### Parallel Opportunities by User Story

| Story | Parallel test preparation | Parallel implementation after tests |
|---|---|---|
| US1 | T033-T035 | T036 and T039; T037-T038 feed T040-T041 |
| US2 | T042-T044 | T045-T046; T047 feeds T048; T049 feeds T050 |
| US3 | T053-T055 | T056 and T058; T057 feeds T059 |
| US5 | T060-T065 | T066-T069; T070 feeds T071-T074 |
| US6 | T075-T079 | T080, T083-T086; T081 feeds T082; T084-T086 feed T087 |
| US4 | T088-T090 | T091-T092; T093-T094 feed T095 |
| US7 | T096-T098 | T099-T100; both feed T101-T102 |

## Requirement Coverage Map

| Requirement group | Primary tasks |
|---|---|
| FR-001-FR-007 / US1 | T003-T007, T033-T041 |
| FR-008-FR-010 / US2 | T010-T016, T042-T052 |
| FR-011 / US3 | T053-T059 |
| FR-012-FR-014 / US4 | T088-T095 |
| FR-015-FR-017 / US5 | T060-T074 |
| FR-018-FR-019 | T019-T029, T042-T052, T061-T071, T108 |
| FR-020 | T014-T016, T044, T078, T083 |
| FR-021 | T002, T060, T062, T066-T067, T074 |
| FR-022 / US6 | T075-T083, T105, T107 |
| FR-023 / US5-US7 | T020, T063-T065, T075-T087, T096-T102, T105 |
| SR-001-SR-003 | T019-T022, T042-T052 |
| SR-004-SR-010 | T061-T087, T102 |
| DR-001-DR-007 | T018-T024, T036, T042-T058, T088-T101 |
| PR-001-PR-006 | T014-T016, T033-T041, T044-T046, T055, T062-T087, T090-T105 |
| VR-001-VR-005 | T003-T007, T033-T041, T062-T067, T088-T095, T103-T104 |
| IR-001-IR-007 | T028-T031, T034, T042-T043, T053-T054, T063-T071, T088-T095 |
| IR-008-IR-009 | T008-T009, T020, T026-T027, T061-T065, T079, T084, T088-T102 |
| TS-001-TS-005 | T010-T016, T018-T041, T044-T087, T096-T105 |
| SC-001 | T003-T007, T033-T041, T104 |
| SC-002 | T034-T035, T042-T052 |
| SC-003 | T075-T083, T105 |
| SC-004 | T053-T059, T088-T095 |
| SC-005 | T061-T087, T102 |
| SC-006 | T033-T041, T044-T046, T055, T060-T087, T096-T105 |
| SC-007 | T006-T007, T033, T062-T065, T075-T105 |
| SC-008 | T017-T031, T042-T043, T053-T054, T064-T071, T076, T088-T094 |
| SC-009 | T061, T065, T068-T074 |
| SC-010 | T019-T022, T043, T106, T108, T112 |

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Complete US1 public preview and validate it independently.
3. Do not claim selected-private preview while SK-107 is BLOCKED.
4. The first business-capable increment is US1 + US2 because preview alone does
   not persist a draft.

### Incremental Delivery

1. US1: side-effect-free public preview.
2. US2: explicit unpublished GitHub-backed draft and owner view.
3. US3: manual review/edit with immutable source identity.
4. US5: readiness-gated explicit publication/archive.
5. US6: minimal `/public/projects` reads and safe invalidation disclosure.
6. US4: conflict-safe refresh and exact freshness.
7. US7: complete owner source/recovery status.
8. Finish cross-cutting verification and rerun `$speckit-analyze` before
   implementation approval.

## Notes

- Every task follows the required checkbox, sequential ID, optional `[P]`, and
  user-story-label format.
- `[P]` never permits simultaneous edits to the same file.
- Controllers stay thin; owning services enforce authorization and state.
- Projects reads/writes only Projects-owned data directly and consumes typed
  exported services for other modules.
- `ProjectOperationService` remains receipt-only.
- No task implements repository-free publication, frontend work, public search,
  filtering, semantic discovery, ranking, recommendations, AI/indexing,
  repository writes, contribution workflows, role changes, or archived
  reactivation.
- Do not commit, push, merge, switch branches, or stage unrelated work unless
  separately authorized.
