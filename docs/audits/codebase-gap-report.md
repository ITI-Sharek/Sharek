# ShareK Codebase Gap Report

**Status:** Point-in-time current-state audit

**Observed:** 2026-07-17

**Repository snapshot:** `fd290a030756e510b82b5d87984b272bc9f128ef`

**Normative sources:** `../product-spec.md`, `../architecture.md`,
`../api-contracts.md`, `../delivery-plan.md`, `../decision-log.md`, and
`../test-strategy.md`

This report records repository evidence only. It does not introduce product
requirements, approve open decisions, or replace the delivery plan. Runtime
systems, external repositories, secrets, and deployed database state were not
available during this audit. Existing frontend dependencies were not changed;
backend dependencies were absent and were not installed.

> **2026-07-19 update (S1-13 gate run):** GAP-008 (refresh-token transport) is
> resolved by S1-04 (#19) — refresh now uses the httpOnly cookie per ADR-005.
> The broad contributor `repo` OAuth scope and legacy-token exposure behind
> GAP findings in the GitHub area are remediated by S1-06 (#21). Current
> command-gate and scenario evidence, including remaining failures, is in
> `slice1-acceptance-gate.md`; the other findings in this report stand.

## Classification and severity

- `IMPLEMENTED` — repository evidence matches the requirement at the inspected boundary.
- `PARTIAL` — a meaningful portion exists, but required behavior or proof is missing.
- `NOT_IMPLEMENTED` — no working implementation was found.
- `IMPLEMENTED_DIFFERENTLY` — code exists but conflicts with the authoritative target.
- `OBSOLETE_CODE` — code or persistence represents explicitly deferred/rejected scope or a superseded model.
- `CANNOT_VERIFY` — the required source or runtime evidence is outside the inspected repository.

Severity describes the consequence of proceeding without resolving the finding:
`CRITICAL`, `HIGH`, `MEDIUM`, or `LOW`.

## Repository and delivery infrastructure

### GAP-001 — Workspace and package-manager contract

- **Requirement or decision ID:** Architecture §2; Test Strategy §1; Delivery Plan §2
- **Classification:** `PARTIAL`
- **Relevant code paths:** `frontend/package.json`, `frontend/pnpm-lock.yaml`, `backend/package.json`, `backend/package-lock.json`, `backend/pnpm-lock.yaml`, `backend/pnpm-workspace.yaml`
- **Current behavior:** There is no root workspace manifest or root `package.json`. The frontend declares pnpm, but `frontend/pnpm-lock.yaml` contains two concatenated YAML documents (a pnpm self-install lock followed by the app lock). The backend contains both npm and pnpm lockfiles while its Dockerfile/CI use npm; the npm lock root also retains `google-auth-library`, which is absent from `backend/package.json`.
- **Expected behavior:** Each workspace has one unambiguous, reproducible install contract and root automation enters the correct workspace.
- **Severity:** `MEDIUM`
- **Migration or security risk:** Mixed lockfiles can resolve different dependency graphs locally and in CI, weakening reproducibility and security-patch verification.
- **Recommended action:** In Slice 1, declare npm as the backend authority and pnpm as the frontend authority, remove the non-authoritative backend lockfile only in an approved tooling change, and make every command set its working directory explicitly.

### GAP-002 — TanStack Start product surface and quality gates

- **Requirement or decision ID:** Product Spec §§4.1–4.10; API-001; PD-003; Test Strategy §§1–2
- **Classification:** `NOT_IMPLEMENTED`
- **Relevant code paths:** `frontend/src/routes/index.tsx`, `frontend/src/routes/__root.tsx`, `frontend/src/router.tsx`, `frontend/package.json`, `frontend/vite.config.ts`
- **Current behavior:** The frontend is the TanStack file-counter starter. It writes `count.txt`; the only package script is an intentionally failing placeholder test, confirmed by `pnpm test`. There is no `tsconfig.json`, lint configuration, test runner, API client, authentication flow, public profile, or contribution-loop UI.
- **Expected behavior:** A responsive, accessible frontend implements the public profile and required manual/AI workflow, with runnable lint, type-check, test, and build scripts.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Starting feature work without an API/auth boundary can lead to persistent token storage, private-data rendering, contract drift, and untestable screens.
- **Recommended action:** Establish the frontend foundation and logged-out public-profile route in Slice 1, including Vitest/component-route tests, an in-memory access-token strategy coordinated with the backend, and explicit quality scripts.

### GAP-003 — FastAPI AI service source and commands

- **Requirement or decision ID:** AD-001; AI-001; AI-002; Architecture §§1, 5
- **Classification:** `CANNOT_VERIFY`
- **Relevant code paths:** `backend/src/modules/ai/integrations/fastapi-skill-profile.client.ts`, `backend/src/shared/config/env.validation.ts`, `backend/docker-compose.yml`
- **Current behavior:** NestJS calls `${AI_SERVICE_URL}/skill-profiles/generate`, but no FastAPI source, Python manifest, lockfile, tests, or container is present in this workspace.
- **Expected behavior:** A separately deployable, authenticated FastAPI service implements bounded skill inference and advisory application fit with reproducible lint/test commands and versioned contracts.
- **Severity:** `CRITICAL`
- **Migration or security risk:** The release cannot verify AI behavior, authentication, prompt-injection defenses, redaction, retention, or contract compatibility. The external service may drift independently.
- **Recommended action:** Treat the service repository, pinned revision, ownership, and commands as a Slice 1 delivery dependency; do not infer implementation from the NestJS client.

### GAP-004 — GitHub Actions pipeline

- **Requirement or decision ID:** Delivery Plan §2; Test Strategy §1
- **Classification:** `IMPLEMENTED_DIFFERENTLY`
- **Relevant code paths:** `.github/workflows/backend-ci.yml`, `backend/package.json`, `backend/scripts/check-architecture.mjs`
- **Current behavior:** The sole workflow runs `npm ci`, Prisma, architecture, lint, test, and build from the repository root, where no `package.json` exists. Its push trigger names `main`, but the verified default branch is `master`. It has no frontend or AI jobs and omits an explicit TypeScript no-emit check and Prisma validation.
- **Expected behavior:** CI installs and runs gates from each workspace and covers frontend, backend, AI, contracts, schema, and security-relevant integration paths.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Pull requests can have no meaningful required verification; dependency and schema failures may reach integration branches unnoticed.
- **Recommended action:** Make CI repair the first Slice 1 enabler, using `working-directory` per job and adding independent frontend/backend/AI jobs as their commands become available.

### GAP-005 — Architecture checker

- **Requirement or decision ID:** Architecture §4; Delivery Plan §2; Engineering Guide §8
- **Classification:** `OBSOLETE_CODE`
- **Relevant code paths:** `backend/scripts/check-architecture.mjs`, `docs/AGENTS.md`, `docs/operations/engineering-guide.md`
- **Current behavior:** `npm run check:architecture` fails. The checker resolves the backend folder as its root and requires deleted backend-local documentation, the retired module tracker, and an archived BMAD ADR. It reported 38 missing/stale-document errors during this audit.
- **Expected behavior:** The checker enforces current feature-first module boundaries and reads the active monorepo documentation layout without resurrecting retired planning systems.
- **Severity:** `HIGH`
- **Migration or security risk:** A permanently red gate encourages bypassing architecture checks and hides genuine cross-module violations among known noise.
- **Recommended action:** Update only the checker and its tests/CI invocation in the Slice 1 tooling issue; retain controller/module-boundary checks and remove obsolete documentation assertions.

## Identity, authentication, and authorization

### GAP-006 — Core identity/session endpoints

- **Requirement or decision ID:** Product Spec §4.1; SEC-002; API Contracts §2
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/src/modules/identity/controllers/`, `backend/src/modules/identity/services/`, `backend/src/modules/identity/security/`, `backend/test/github-onboarding.spec.ts`
- **Current behavior:** Registration, username availability, email OTP verification/resend, login, password reset, Google/GitHub social callbacks, refresh, logout, and current-user endpoints exist with hashed session tokens and focused tests.
- **Expected behavior:** These capabilities remain available after fixed-role removal, with verified email gating sensitive actions and no admin/profile-approval participation gate.
- **Severity:** `HIGH`
- **Migration or security risk:** Existing authentication is coupled to `User.role` and `User.status`; careless migration can lock out accounts, weaken verification, or invalidate active sessions.
- **Recommended action:** Preserve endpoint compatibility while migrating role and verification semantics in Slice 1; add migration, session, social-login, suspended-user, and email-gate regression tests.

### GAP-007 — Fixed product roles and contextual capabilities

- **Requirement or decision ID:** SEC-002; Product Spec §§2–3, 4.1; Architecture §§8, 11, 16
- **Classification:** `IMPLEMENTED_DIFFERENTLY`
- **Relevant code paths:** `backend/prisma/schema.prisma`, `backend/src/modules/identity/dto/register.request.ts`, `backend/src/modules/identity/services/auth.service.ts`, `backend/src/shared/auth/guards/roles.guard.ts`, `backend/src/modules/projects/projects.controller.ts`
- **Current behavior:** Registration requires `owner | contributor`; `User.role` persists `owner | contributor | admin`; guards and project import authorize by this account role. Pending contributors are allowed to authenticate while pending owners are not.
- **Expected behavior:** `ADMIN` is the only account-level privilege. Owner, contributor, and applicant capabilities derive from project, active application, and assignment state; email verification is independent.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Existing data and clients require a forward-safe transition. Incorrect defaults could grant owner authority, remove admin access, or preserve terminal-application access.
- **Recommended action:** Split the work into a persistence/API migration and scoped-capability enforcement issue. Do not drop the old column until reads/writes and existing clients have migrated and compatibility evidence exists.

### GAP-008 — Refresh-token transport

- **Requirement or decision ID:** Product Spec §4.1; API Contracts §2; Test Strategy §5; ADR-005 (proposed target)
- **Classification:** `IMPLEMENTED_DIFFERENTLY`
- **Relevant code paths:** `backend/src/modules/identity/dto/refresh-session.request.ts`, `backend/src/modules/identity/controllers/session.controller.ts`, `backend/src/modules/identity/services/session.service.ts`
- **Current behavior:** The refresh token is accepted and returned in JSON. Refresh rotates hashes in the existing session row; logout revokes the current session.
- **Expected behavior:** Refresh remains secure and coordinated with the frontend; the proposed target uses an httpOnly cookie and in-memory access token with CSRF protection appropriate to cookie transport.
- **Severity:** `HIGH`
- **Migration or security risk:** JavaScript-visible refresh tokens are more exposed to XSS. A one-sided cookie cutover can break login/refresh or introduce CSRF.
- **Recommended action:** Land backend cookie attributes, CSRF decision, CORS behavior, frontend interceptor, compatibility window, and session tests as one coordinated Slice 1 sub-issue.

### GAP-009 — Error envelope and request correlation

- **Requirement or decision ID:** API Contracts §1; Architecture §15; Test Strategy §§2, 5
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/src/shared/errors/http-exception.filter.ts`, `backend/src/main.ts`
- **Current behavior:** `ApplicationError` responses contain `statusCode`, `code`, and `message`; Nest `HttpException` bodies pass through unchanged. No correlation ID is generated or returned.
- **Expected behavior:** Public errors consistently use the documented code/message/details/correlation envelope without leaking internals.
- **Severity:** `MEDIUM`
- **Migration or security risk:** Inconsistent errors complicate clients and incident tracing; unstructured pass-through responses can expose unintended details.
- **Recommended action:** Standardize the filter and add contract tests after route compatibility is agreed, preserving existing error codes where clients depend on them.

## GitHub and projects

### GAP-010 — GitHub connection foundation

- **Requirement or decision ID:** Product Spec §§4.1–4.2; SEC-001; API Contracts §4
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/src/modules/github/controllers/github-oauth.controller.ts`, `backend/src/modules/github/services/github-oauth.service.ts`, `backend/src/modules/github/security/github-token-encryption.service.ts`, `backend/src/modules/github/integrations/github-api.client.ts`
- **Current behavior:** OAuth state is hashed and expiring, tokens are encrypted at rest, linked accounts can be listed/disconnected, and repository/evidence endpoints normalize partial GitHub failures.
- **Expected behavior:** Connection uses least privilege, records granted scopes/freshness, exposes only permitted public evidence for inference, and verifies maintainer permission before official project linking.
- **Severity:** `HIGH`
- **Migration or security risk:** The `GitHubAccount` model does not record granted scopes or a permission snapshot, complicating consent audits and safe token rotation.
- **Recommended action:** Retain the working OAuth/encryption foundation while adding explicit scope/permission metadata and security regression tests in Slices 1–2.

### GAP-011 — Contributor OAuth and private-repository ingestion

- **Requirement or decision ID:** AI-001; SEC-001; Product Spec §6; Architecture §§5–6, 14
- **Classification:** `IMPLEMENTED_DIFFERENTLY`
- **Relevant code paths:** `backend/src/modules/github/services/github-oauth.service.ts`, `backend/src/modules/github/integrations/github-api.client.ts`, `backend/src/modules/github/services/github-evidence.service.ts`, `backend/src/modules/skill-profiles/services/skill-profile-generation.service.ts`
- **Current behavior:** Contributors request `read:user user:email repo`; repository listing uses `visibility=all`; selected snapshots retain the private flag and can send README and commit-derived content to FastAPI. A test explicitly asserts the broad scope.
- **Expected behavior:** MVP inference analyzes accessible public GitHub evidence only and requests the least privilege necessary.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Private code and personal data may already have been sent to or stored by the AI path. Scope reduction alone does not revoke existing tokens or remove stored snapshots.
- **Recommended action:** Immediately stop selecting private repositories, reduce future consent, revoke/reauthorize broad tokens, inventory and remove impermissible snapshots under an approved retention process, and test public-only behavior before enabling generation.

### GAP-012 — Repository ownership verification

- **Requirement or decision ID:** SEC-001; Product Spec §§3, 4.2; Architecture §§6, 14
- **Classification:** `NOT_IMPLEMENTED`
- **Relevant code paths:** `backend/src/modules/projects/projects.controller.ts`, `backend/src/modules/projects/projects.service.ts`, `backend/src/modules/github/services/github-evidence.service.ts`
- **Current behavior:** An account-role owner/admin may import any resolvable public GitHub repository URL. The only ownership check prevents a second ShareK user from importing an already stored URL; GitHub `admin`, `maintain`, or `push` permission is never checked.
- **Expected behavior:** GitHub must confirm accepted maintainer permission for the authenticated account before the repository becomes an official project connection.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Users can falsely present unrelated repositories as official ShareK projects, corrupting evidence and reputation trust.
- **Recommended action:** Disable or guard official linking until permission verification, permission snapshots, refresh behavior, and forbidden-path tests land in Slice 2.

### GAP-013 — Project creation, publication, and repository-free operation

- **Requirement or decision ID:** SEC-001; PD-003 steps 6–8; Product Spec §4.2; API Contracts §7
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/prisma/schema.prisma`, `backend/src/modules/projects/`, `backend/src/modules/github/services/github-evidence.service.ts`
- **Current behavior:** Only `POST /projects/import/github` exists. `Project.github_repo_url` is required and unique, so repository-free creation is impossible. There is no create/list/detail/update/publish/connect-later workflow.
- **Expected behavior:** A verified user can create and publish a project without a repository, optionally connect an authorized repository later, and expose public discovery/detail contracts.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Making the URL nullable affects uniqueness and current imports; linking later requires concurrency and ownership safeguards.
- **Recommended action:** Implement Slice 2 with a forward migration for independent repository-connection state, owner authorization, idempotent linking, and repository-free integration tests.

## Profiles, evidence, reviews, and reputation

### GAP-014 — Public profile route

- **Requirement or decision ID:** API-001; Product Spec §4.1; PD-003 steps 2 and 17
- **Classification:** `IMPLEMENTED_DIFFERENTLY`
- **Relevant code paths:** `backend/src/modules/contributor-profiles/contributor-profiles.controller.ts`, `backend/src/modules/contributor-profiles/contributor-profiles.service.ts`, `backend/test/contributor-profile-view.e2e-spec.ts`
- **Current behavior:** `GET /contributors/profiles/:username` is under a class-level access-token guard, requires a current user, and returns only owner/authenticated-viewer relationships. Tests cover authenticated access only.
- **Expected behavior:** `GET /api/v1/profiles/:username` works without a token and never returns private fields; authenticated self-management uses `/api/v1/me/profile`.
- **Severity:** `HIGH`
- **Migration or security risk:** Removing the guard without a dedicated public projection could leak owner-only prompts, hidden skills, or future private evidence. Route replacement can break existing clients.
- **Recommended action:** Add a guest-safe projection and target route with compatibility handling, privacy tests, and a logged-out frontend route in Slice 1.

### GAP-015 — Profile trust, evidence labels, and reputation projection

- **Requirement or decision ID:** DM-001; DM-003; DM-004; Product Spec §§4.5, 4.9; Architecture §§12–14
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/src/modules/contributor-profiles/utils/contributor-profile.presenter.ts`, `backend/src/modules/contributor-profiles/dto/contributor-profile.dto.ts`, `backend/src/modules/skill-profiles/services/skill-profile-summary.service.ts`, `backend/src/modules/reputation/reputation.service.ts`
- **Current behavior:** Profiles show a fixed `roleLabel`, GitHub connection, a flat skill status, a mutable aggregate rating/count, empty contribution history, and completion prompts. Independent source, review status, verification tier, trust signals, evidence mappings, dimensions, and provenance are absent.
- **Expected behavior:** Logged-out viewers can distinguish self-declared, admin-reviewed, repository-backed, owner-attested, ShareK-verified, and AI-inferred claims, with multiple explained trust signals and traceable reputation.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Reusing current `status` fields as global verification would create misleading public claims and make later separation destructive.
- **Recommended action:** Introduce the projection incrementally after source entities exist; never add a global verified boolean or reinterpret admin/AI status as evidence source.

### GAP-016 — Tasks, applications, assignments, and contextual access

- **Requirement or decision ID:** AI-002; DM-005; SEC-002; PD-003 steps 8–13; Product Spec §§4.2–4.3
- **Classification:** `NOT_IMPLEMENTED`
- **Relevant code paths:** `backend/src/modules/contribution-tasks/contribution-tasks.module.ts`, `backend/src/modules/applications/applications.module.ts`, `backend/prisma/schema.prisma`
- **Current behavior:** Task and application NestJS modules are empty. Legacy Prisma `ContributionRequest` and `Application` tables are not exposed through services/controllers; there is no `Assignment` model or active-status capability derivation.
- **Expected behavior:** Owners publish scoped tasks; every valid application reaches the owner; the owner decides; acceptance creates one primary assignment; only active application/assignment state grants scoped access.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Legacy `eligible/ineligible/pending_validation` states encode AI gating and cannot safely be treated as the approved state machine. Assignment uniqueness needs database-level concurrency protection.
- **Recommended action:** Implement Slices 2–3 around new/forward-migrated state and one-active-primary-assignment constraints; do not activate legacy binary validation behavior.

### GAP-017 — Versioned individual delivery evidence and owner review

- **Requirement or decision ID:** DM-001; DM-005; DM-006; PD-003 steps 14–16; Product Spec §4.4
- **Classification:** `NOT_IMPLEMENTED`
- **Relevant code paths:** `backend/src/modules/delivery-reviews/delivery-reviews.module.ts`, `backend/prisma/schema.prisma` (`Delivery`, `DeliveryReview`)
- **Current behavior:** The module is empty. The legacy schema stores one required PR URL and one review per application/delivery; it has no assignment entity, evidence items, contributor attribution, submission versions, GitHub validation snapshot, audit history, or owner-silence state.
- **Expected behavior:** The assigned contributor submits versioned, individually attributable typed evidence; the owner approves, rejects, or requests changes without rewriting GitHub facts; old versions remain auditable.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Extending the single-row legacy model risks overwriting history and falsely attributing shared PR work. File evidence remains blocked by OQ-001.
- **Recommended action:** Build Slice 4 around separate submission/version/item/review entities, initially supporting safe URL/metadata evidence while leaving file transport explicitly gated.

### GAP-018 — Blind bilateral reviews

- **Requirement or decision ID:** PD-002; Product Spec §4.5; Architecture §10; Test Strategy §3
- **Classification:** `NOT_IMPLEMENTED`
- **Relevant code paths:** `backend/src/modules/` (no `reviews` module), `backend/prisma/schema.prisma`
- **Current behavior:** No blind-review window, bilateral review entities, publication job, routes, or tests exist. `DeliveryReview` is an owner delivery verdict and cannot represent the approved bilateral workflow.
- **Expected behavior:** Reviews remain hidden until both submit or 14 days expire; ratings are 1–5; ratings 1/5 require rationale; direction-specific dimensions apply.
- **Severity:** `HIGH`
- **Migration or security risk:** Reusing delivery reviews could leak reviews early, lose reviewer direction, and corrupt reputation inputs.
- **Recommended action:** Implement as its own post-delivery context/job after Slice 4, with clock-controlled tests and idempotent expiry processing.

### GAP-019 — Immutable reputation events

- **Requirement or decision ID:** DM-001; Product Spec §4.5; Architecture §13
- **Classification:** `IMPLEMENTED_DIFFERENTLY`
- **Relevant code paths:** `backend/src/modules/reputation/reputation.service.ts`, `backend/prisma/schema.prisma` (`ReputationRecord`)
- **Current behavior:** Reputation reads a mutable aggregate record containing overall rating and counters. There is no immutable event source, dimensional projection, invalidation link, policy version, or replay/idempotency mechanism.
- **Expected behavior:** Public reputation derives from append-only, traceable events; invalidation removes effect without deleting history; projections expose dimensions, sample size, provenance, reversals, and flags.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Existing totals cannot prove provenance and may not be reconstructable. Treating them as authoritative could preserve manipulated or stale reputation.
- **Recommended action:** Add the event model after accepted delivery exists, define a one-time backfill policy rather than inventing provenance, and test replay/invalidation/idempotency.

### GAP-020 — External-project evidence and administration

- **Requirement or decision ID:** DM-002; DM-004; DM-006; PD-003 steps 19–20; Product Spec §4.8
- **Classification:** `NOT_IMPLEMENTED`
- **Relevant code paths:** `backend/src/modules/admin/admin.module.ts`, `backend/prisma/schema.prisma`, `backend/src/modules/contributor-profiles/`
- **Current behavior:** The admin module is empty and no external-project submission, review-action, version, trust-label, or public projection entities/routes exist.
- **Expected behavior:** Contributors manage the approved seven-state workflow; admins perform auditable approve/reject/request-changes/flag actions; approved visible evidence is clearly `ADMIN_REVIEWED_EXTERNAL_PROJECT` and does not become ShareK/repository verification.
- **Severity:** `HIGH`
- **Migration or security risk:** File storage/scanning/retention is unresolved under OQ-001. A shortcut through generic report/status fields would collapse evidence dimensions.
- **Recommended action:** Implement metadata/URL workflow only when it can preserve the full approved state machine; keep images/files blocked and visible as an open dependency rather than silently dropping them.

### GAP-021 — Notifications and moderation

- **Requirement or decision ID:** PD-003 supporting capabilities; Product Spec §4.10; API Contracts §7
- **Classification:** `NOT_IMPLEMENTED`
- **Relevant code paths:** `backend/prisma/schema.prisma` (`Notification`, `Report`), `backend/src/modules/admin/admin.module.ts`, `backend/src/modules/` (no `notifications` module)
- **Current behavior:** Legacy tables exist, but no owning notification/moderation services, APIs, dispatch job, audit workflow, or tests are wired into NestJS.
- **Expected behavior:** Required application/evidence/review/moderation events create in-app notifications, while flags and sensitive admin actions are authorized and audited.
- **Severity:** `HIGH`
- **Migration or security risk:** Direct cross-module writes to legacy tables would violate module ownership and make retries duplicate messages/actions.
- **Recommended action:** Add owning modules and completed-fact event consumers alongside Slices 3–6, with idempotent dispatch and object-level authorization tests.

## AI behavior and persistence

### GAP-022 — AI skill inference orchestration

- **Requirement or decision ID:** AI-001; AD-001; Product Spec §4.6; Architecture §5
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/src/modules/skill-profiles/`, `backend/src/modules/ai/`, `backend/src/modules/github/services/github-evidence.service.ts`
- **Current behavior:** Authenticated users can enqueue one-to-ten selected repositories; BullMQ retries idempotently by generation ID; NestJS collects snapshots, validates FastAPI output/citations/confidence/versions, filters low-confidence claims, persists evidence snapshots, and exposes generation status. Focused service/client tests exist.
- **Expected behavior:** Public-only GitHub evidence covers the approved evidence sources; every visible inference includes confidence, uncertainty, citations, freshness and versions; insufficient evidence is explicit; contributors can dispute while originals remain auditable.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Current snapshots can contain private data, limitations are embedded in JSON rather than a complete public contract, and no dispute route/audit workflow was found.
- **Recommended action:** First close GAP-011, then add dispute/audit/public projection and a locked evaluation set. Do not claim the feature complete until the external FastAPI implementation and safety tests are available.

### GAP-023 — Advisory application-fit analysis

- **Requirement or decision ID:** AI-002; AI-003; PD-003 steps 9–12; Product Spec §4.7
- **Classification:** `NOT_IMPLEMENTED`
- **Relevant code paths:** `backend/src/modules/applications/applications.module.ts`, `backend/src/modules/ai/ai.service.ts`, `backend/prisma/schema.prisma` (`AiValidationResult`, `ApplicationStatus`)
- **Current behavior:** No application service, fit client, queue, DTO, API, or test exists. Legacy persistence contains binary `eligible/ineligible/review_needed` decisions and application states that can encode blocking.
- **Expected behavior:** Every valid application is owner-visible before/without AI; asynchronous advice reports matches, missing/uncertain requirements, confidence and citations; timeout, failure, low confidence, or negative fit never hides/rejects.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Reusing binary fields could accidentally make AI authoritative and violate an approved MVP decision.
- **Recommended action:** Mark legacy validation shapes obsolete, design an advisory output snapshot under the applications module, and test owner visibility independently of every AI outcome in Slice 8.

### GAP-024 — Obsolete persistence and vector extension

- **Requirement or decision ID:** AI-003; PD-001; Product Spec §5; Architecture §§2, 16; ADR-011; ADR-013
- **Classification:** `OBSOLETE_CODE`
- **Relevant code paths:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/000001_init/migration.sql`, `backend/prisma/migrations/20260704203533_init/migration.sql`
- **Current behavior:** The schema retains subscriptions/plans, usage limits, binary AI validation, AI ranking/matching, skill-gap guidance, rewards, and mutable reputation shapes outside or contrary to MVP. The first migration enables `vector`, although no vector field exists and semantic/vector matching is not currently required.
- **Expected behavior:** MVP persistence represents only approved/manual-loop and required advisory-AI capabilities; vector functionality remains dormant unless PD-001 makes it mandatory.
- **Severity:** `HIGH`
- **Migration or security risk:** Deleting applied structures without usage/deployment evidence is destructive; retaining them invites accidental implementation of rejected scope and unnecessary database privileges/extensions.
- **Recommended action:** Inventory runtime data and references first, then use forward migrations to deprecate/remove obsolete structures. Never edit applied migrations or assume the extension can be dropped safely.

### GAP-025 — Prisma schema/migration consistency and deployed state

- **Requirement or decision ID:** Architecture §2; Delivery Plan §2; Test Strategy §§1, 6
- **Classification:** `CANNOT_VERIFY`
- **Relevant code paths:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/`
- **Current behavior:** Ten migration directories exist. The migration creates `AuthProvider` with `google` and `github`, while the current Prisma schema declares only `github` even though Google auth code exists. No database or migration history table was available to verify which migrations are deployed or whether schema drift exists. `npx prisma validate` was not run because backend dependencies are absent and dependency installation is prohibited in this stage.
- **Expected behavior:** Prisma schema, generated client, migrations, and deployed databases agree; migration checks are reproducible and forward-safe.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Regenerating the client or migrating a database may break Google auth or conceal drift. Production data compatibility is unknown.
- **Recommended action:** Add `prisma validate` and disposable-database migration deployment to CI, compare an authorized runtime database before any corrective migration, and resolve the enum mismatch through a new migration/schema update rather than rewriting history.

## Reliability, security, tests, and operations

### GAP-026 — Redis and durable jobs

- **Requirement or decision ID:** Architecture §§2, 5, 15; Test Strategy §§2, 4
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/src/modules/skill-profiles/jobs/`, `backend/docker-compose.yml`
- **Current behavior:** Redis/BullMQ is implemented only for skill-profile generation with deterministic job IDs, three attempts, exponential backoff, worker recovery, and final failure persistence. No dead-letter queue or integration tests against Redis were found.
- **Expected behavior:** Required asynchronous workflows use idempotent, bounded, observable jobs, including application fit, review expiry, PR validation, and notifications where applicable.
- **Severity:** `HIGH`
- **Migration or security risk:** In-process assumptions for future workflows can lose or duplicate state; unlimited retained failed payloads could expose evidence.
- **Recommended action:** Keep the existing queue as the pattern, add Redis integration/replay tests, define payload-retention/redaction, and introduce new queues only with their owning slices.

### GAP-027 — Security, privacy, audit, and observability controls

- **Requirement or decision ID:** Product Spec §6; Architecture §15; Test Strategy §5
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/src/main.ts`, `backend/src/shared/`, `backend/src/modules/github/security/`, `backend/prisma/schema.prisma`
- **Current behavior:** Global validation, CORS allowlisting, hashed session/OAuth state, encrypted GitHub tokens, and generic error handling exist. No rate limiter, correlation IDs, comprehensive audit-log entity, upload scanning, explicit URL-safety layer, AI redaction pipeline, or privacy/retention implementation was found.
- **Expected behavior:** Sensitive endpoints are rate-limited and object-authorized; sensitive transitions are auditable; untrusted repository/file input is isolated and redacted; private evidence never reaches public output.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Auth/AI endpoints are abuse-prone, and current evidence snapshots may contain secrets or personal/private data without an approved retention/removal process.
- **Recommended action:** Prioritize GitHub containment and auth rate limits in Slice 1, then add subject-specific audit records and security tests with each workflow. Keep file transport blocked by OQ-001.

### GAP-028 — Automated verification coverage

- **Requirement or decision ID:** Test Strategy §§1–6; Delivery Plan §2
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/src/**/*.spec.ts`, `backend/test/*.spec.ts`, `frontend/package.json`
- **Current behavior:** The repository contains 26 backend spec files and 78 statically counted `it`/`test` cases focused on identity, profile presentation, GitHub, projects import, skill generation, and AI-client validation. Several HTTP tests use mocked/in-memory persistence. Backend unit and integration commands could not start because Jest is not installed locally. There are no frontend tests, FastAPI tests, real PostgreSQL/Redis integration suites, target API contract suite, complete-loop E2E, accessibility suite, or locked AI evaluation set.
- **Expected behavior:** Success, invalid, forbidden, and failure paths are automated at unit/integration/contract/UI/E2E boundaries, including the complete loop, repository-free flow, unavailable integration, security, and AI safety.
- **Severity:** `CRITICAL`
- **Migration or security risk:** Mock-only success can hide database constraints, migration drift, queue races, authorization leaks, and public/private projection errors.
- **Recommended action:** Add tests as vertical-slice exit criteria, starting with disposable PostgreSQL/Redis integration infrastructure and logged-out public-profile/security cases.

### GAP-029 — Docker/local topology

- **Requirement or decision ID:** AD-001; Architecture §§1–2; PD-003 stable local setup
- **Classification:** `PARTIAL`
- **Relevant code paths:** `backend/docker-compose.yml`, `backend/Dockerfile`, `backend/.env.example`
- **Current behavior:** Compose provides the NestJS API, pgvector PostgreSQL, and Redis. FastAPI and the frontend are external; the API points at `host.docker.internal`. The Dockerfile uses `npm install`, development watch mode, bind mounts, and no production/multi-stage target.
- **Expected behavior:** A documented, reproducible local topology starts every required component or explicitly pins and verifies external dependencies; deployable images use deterministic installs and production-safe commands.
- **Severity:** `HIGH`
- **Migration or security risk:** Host coupling and development defaults make cross-platform setup fragile; placeholder secrets must never reach deployment.
- **Recommended action:** After locating the AI service, add a complete local profile or a verified external-service contract, switch image installs to the authoritative lockfile, and add Compose health/integration checks.

### GAP-030 — Health endpoint

- **Requirement or decision ID:** Architecture §3; PD-003 stable local setup
- **Classification:** `IMPLEMENTED`
- **Relevant code paths:** `backend/src/modules/health/health.controller.ts`, `backend/src/modules/health/health.module.ts`, `backend/src/modules/health/health.response.ts`
- **Current behavior:** `GET /health` is wired into `AppModule` and returns the service health response without authentication.
- **Expected behavior:** A basic public liveness endpoint exists; dependency readiness/health may be added when deployment requirements are defined.
- **Severity:** `LOW`
- **Migration or security risk:** No direct migration risk; treating liveness as full PostgreSQL/Redis/AI readiness would be misleading.
- **Recommended action:** Retain it and distinguish liveness from readiness in later deployment hardening.

## Command audit at this snapshot

Commands were run without installing dependencies or contacting live product
integrations:

| Command | Result |
|---|---|
| `cd frontend && pnpm test` | `FAIL` — declared placeholder exits with `Error: no test specified` |
| `cd backend && npm run check:architecture` | `FAIL` — 38 stale/missing documentation and retired-tracker assertions |
| `cd backend && npm run lint` | `FAIL` — local `eslint` executable absent |
| `cd backend && npm test -- --runInBand --testPathPattern=src` | `FAIL` — local `jest` executable absent |
| `cd backend && npm test -- --runInBand --testPathPattern=test` | `FAIL` — local `jest` executable absent |
| `cd backend && npm run build` | `FAIL` — 235 TypeScript errors, primarily missing dependencies/generated Prisma client |
| `cd backend && npx tsc --noEmit` | `NOT_RUN` — `npx` could download missing dependencies |
| `cd backend && npx prisma validate` | `NOT_RUN` — `npx` could download missing dependencies |

No declared frontend, backend, or AI quality gate succeeded in this checkout.
This is an environment/reproducibility result, not proof that every backend test
would fail after a clean approved install.

## Audit conclusion

The repository contains a meaningful NestJS authentication, GitHub, public-import,
and queued skill-profile foundation, but it does not yet implement the authoritative
end-to-end evidence and reputation loop. The highest immediate risks are broken CI,
fixed-role authorization, broad/private GitHub access, unverified repository
ownership, Prisma drift, the absent FastAPI source, and the absence of a product
frontend. Execution sequencing and issue-sized handoff are recorded in
`team-execution-manifest.md`.
