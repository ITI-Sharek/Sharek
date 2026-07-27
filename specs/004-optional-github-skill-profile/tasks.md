# Tasks: Optional GitHub Skill Profiling

**Input**: Design documents from `specs/004-optional-github-skill-profile/`

**Tests**: Required by the feature specification, implementation plan, repository definition of done, and constitution.

**Organization**: Tasks are grouped by user story so each workflow can be implemented and verified incrementally.

## Phase 1: Setup

**Purpose**: Establish safe configuration and dependency decisions without changing active runtime behavior.

- [X] T001 Verify the completed OAuth consumer/private-field inventory in `specs/004-optional-github-skill-profile/research.md` against the current controllers, services, Prisma schema, and migrations; add any newly found field as retain/redact/purge before code changes
- [X] T002 Add non-secret GitHub App variable names and safe development placeholders to `.env.example`
- [X] T003 Add GitHub App configuration descriptions, Smee forwarding, and private-key handling guidance to `docs/local-development.md`
- [X] T004 Add validated GitHub App configuration keys without logging values in `src/shared/config/env.validation.ts`
- [X] T005 [P] Add Docker Compose pass-through for GitHub App configuration names in `docker-compose.yml`
- [X] T006 [P] Add provider-operation fixtures covering the approved `Metadata: read`/`Contents: read` endpoint matrix without changing `package.json` under `test/fixtures/github-app-provider/`

---

## Phase 2: Foundational Persistence and Provider Security

**Purpose**: Add the shared GitHub App installation boundary required by all later user stories.

**Critical**: Complete this phase before any story implementation.

- [X] T007 Add canonical GitHub App installation, encrypted expiring member-authorization link, mutable selected-repository membership keyed by immutable repository ID, connection-attempt, webhook-delivery, singleton cutover-state, and generation-consent fields to `prisma/schema.prisma`
- [X] T008 Create a forward-only additive migration under `prisma/migrations/` for the GitHub App schema without deleting legacy OAuth credentials
- [X] T009 Add focused schema/migration validation fixtures for identity-only OAuth, repository OAuth, pending generation, approved skills, and no-GitHub users under `test/fixtures/`
- [X] T010 [P] Add installation-link, connection-attempt/completion, member-authorization state, and selected-repository request/response DTOs with canonical `installationLinkId` terminology in `src/modules/github/dto/github-app-installation.dto.ts`
- [X] T011 [P] Add provider payload and allowlisted mapping types in `src/modules/github/mappers/github-app.mapper.ts`
- [X] T012 Implement private-key decoding, app JWT signing, and webhook HMAC verification in `src/modules/github/security/github-app-credentials.service.ts`
- [X] T013 [P] Add credential/signature unit tests including malformed Base64, invalid PEM, expiry, and timing-safe signature comparison in `src/modules/github/security/github-app-credentials.service.spec.ts`
- [X] T014 Implement focused GitHub App provider operations for single-use user-code exchange, rotating member-token refresh, member-access installation/repository listing, app installation verification, on-demand installation-token minting, and paginated installation-repository listing with at-most-three retries only for idempotent reads in `src/modules/github/integrations/github-app-api.client.ts`
- [X] T015 Add provider contract tests for non-retried code exchange, rotating refresh, on-demand installation tokens, bounded retry/backoff, timeouts, 401/403/404, rate limits, malformed payloads, expiry, pagination, and the permission fixtures from T006 in `src/modules/github/integrations/github-app-api.client.spec.ts`
- [X] T016 Register only public GitHub App services in `src/modules/github/github.module.ts` while keeping clients, credentials, and persistence private

**Checkpoint**: Additive persistence and a testable provider boundary exist; current OAuth behavior still works.

---

## Phase 3: User Story 1 — Register Without GitHub (Priority: P1) 🎯 MVP

**Goal**: Prove registration, verification, profile access, and browsing do not require GitHub.

**Independent Test**: Register and verify a contributor with all GitHub provider calls unavailable; confirm authenticated profile and project discovery remain available while skill-gated behavior reports missing approved skills.

### Tests

- [X] T017 [P] [US1] Add E2E coverage proving email verification activates a contributor who can manage their profile and browse discovery with GitHub unavailable while missing approved skills block only skill-gated applications in `test/optional-github-profile.e2e-spec.ts`
- [X] T018 [P] [US1] Add authorization coverage proving repository-free users cannot start repository-backed generation without an installation in `src/modules/skill-profiles/skill-profiles.service.spec.ts`

### Implementation

- [X] T019 [US1] Add regression tests preserving current email-verification activation and separating account status from approved-skill eligibility in `src/modules/identity/services/auth.service.spec.ts` and `src/modules/skill-profiles/services/skill-profile-summary.service.spec.ts`
- [X] T020 [US1] Evolve contributor profile assembly to present an empty/disconnected GitHub App installation-link summary and absent generations as optional states without changing existing profile/browsing authorization in `src/modules/contributor-profiles/contributor-profiles.service.ts`
- [X] T021 [US1] Add an exported GitHub App installation-status operation that returns an empty list rather than a missing-account error for repository-free users in `src/modules/github/services/github-app.service.ts`
- [X] T022 [US1] Update identity, contributor-profile, and GitHub public behavior documentation in `src/modules/identity/README.md`, `src/modules/contributor-profiles/README.md`, and `src/modules/github/README.md`

**Checkpoint**: A complete repository-free account/profile journey passes independently.

---

## Phase 4: User Story 2 — Install GitHub App and Select Repositories (Priority: P1)

**Goal**: Link a verified installation to the authenticated Share-k user and expose only repositories selected in that active installation.

**Independent Test**: Start installation for an authenticated contributor, complete a verified callback for one selected repository, and confirm an accessible-but-unselected private repository is absent.

### Tests

- [X] T023 [P] [US2] Add service tests for install-and-authorize versus authorize-existing flows, state ownership/expiry/single use, immediate backend code exchange, encrypted pending/member token rotation, multiple installations, shared organization installations, isolated disconnects, spoofed provider IDs, failed member verification, and selected-only repositories in `src/modules/github/services/github-app.service.spec.ts`
- [X] T024 [P] [US2] Add HTTP/E2E tests proving the start URL carries state, no setup URL is used, the browser callback never forwards code/tokens, protected completion consumes an opaque attempt plus one verified provider installation choice, and status/pagination/cancellation/organization approval are user-scoped in `test/github-app-installation.e2e-spec.ts`

### Implementation

- [X] T025 [US2] Implement hashed expiring user-bound connection attempts, immediate single-use code exchange, short-lived encrypted pending credentials, transactional transfer to an installation link, member-token refresh/rotation, and live member access verification in `src/modules/github/services/github-app.service.ts`
- [X] T026 [US2] Persist one canonical provider installation plus independently verified encrypted member links and mutable repository membership keyed by immutable repository IDs; keep analysis selection/consent outside shared installation state in `src/modules/github/services/github-app.service.ts`
- [X] T027 [US2] Add authenticated installation start, opaque-attempt completion, installation-link status, and selected-repository routes using `installationLinkId` in `src/modules/github/controllers/github-app.controller.ts`
- [X] T028 [US2] Add the browser callback that consumes state, exchanges the code on the backend, stores only the bounded attempt result, and redirects with an opaque attempt ID or provider-safe error in `src/modules/github/controllers/github-app-callback.controller.ts`
- [X] T029 [US2] Return allowlisted installation and repository DTOs without tokens, private keys, secrets, or raw provider payloads in `src/modules/github/mappers/github-app.mapper.ts`
- [X] T030 [US2] Add stable GitHub App error codes and REST examples to `docs/api-contracts.md` and `sharek-api.http`

**Checkpoint**: Installation and repository selection are usable without starting analysis.

---

## Phase 5: User Story 3 — Explicitly Generate a Skill Profile (Priority: P1)

**Goal**: Require installation, current selected-repository access, explicit consent, and an explicit start before reusing the durable skill-generation workflow.

**Independent Test**: Verify installation alone starts no job; then submit one selected immutable repository ID with consent, observe durable status, and receive evidence-linked pending skills.

### Tests

- [X] T031 [P] [US3] Add DTO/service tests for missing/foreign `installationLinkId`, missing/false/versioned consent, repository IDs without client-authoritative full names, duplicates, selection limits, duplicate active generations, revoked member/repositories, and retry ownership/terminal-state/new-consent rules in `src/modules/skill-profiles/skill-profiles.service.spec.ts`
- [X] T032 [P] [US3] Adapt GitHub evidence tests to member-token refresh, live member/repository validation, on-demand installation tokens, immutable repository IDs, selected-only reads, authorization revocation, and partial failures in `src/modules/github/services/github-evidence.service.spec.ts`
- [X] T033 [P] [US3] Add E2E coverage proving registration/link/installation alone creates no generation, explicit consent/start returns durable state within three seconds, and retry prefills selection/reconfirms consent/revalidates access/returns a new generation without reconnecting in `test/github-app-skill-generation.e2e-spec.ts`
- [X] T034 [P] [US3] Add worker tests for access removed between queue and processing, retryable provider failure, and fail-closed evidence collection in `src/modules/skill-profiles/jobs/skill-profile-generation.worker.spec.ts`

### Implementation

- [X] T035 [US3] Extend generation start/retry request and response DTOs with `installationLinkId`, repository ID arrays, versioned explicit consent, prior-generation ownership, and new-generation linkage while deriving display full names server-side in `src/modules/skill-profiles/dto/start-skill-profile-generation.dto.ts` and `src/modules/skill-profiles/dto/skill-profile-generation.dto.ts`
- [X] T036 [US3] Add an exported GitHub service operation that refreshes member authorization when needed, performs live member-link/repository validation at picker, start, and evidence-read boundaries, and returns bounded evidence without exposing credentials in `src/modules/github/services/github-evidence.service.ts`
- [X] T037 [US3] Adapt private evidence reads to use on-demand installation credentials while preserving the anonymous public-project import path and removing broad-token coupling from `src/modules/github/integrations/github-api.client.ts` and `src/modules/github/services/github-evidence.service.ts`
- [X] T038 [US3] Persist immutable consent, installation-link/provider-installation, repository ID/display snapshot, authorization freshness, and opaque evidence IDs with the generation in `src/modules/skill-profiles/repositories/skill-profile-generation.repository.ts`
- [X] T039 [US3] Require an owned active installation link, server-derived selection, consent, and explicit start before generation creation/enqueue; reject duplicate active work and implement retry as a new generation with prefilled prior selection, renewed consent, and access revalidation in `src/modules/skill-profiles/skill-profiles.service.ts`
- [X] T040 [US3] Implement the contracted retry endpoint and delegate ownership/terminal-state/new-consent checks to the skill-profile service in `src/modules/skill-profiles/controllers/skill-profiles.controller.ts`
- [X] T041 [US3] Update generation, retry, evidence, three-second initial status, consent, and error contracts in `docs/api-contracts.md`, `sharek-api.http`, `src/modules/github/README.md`, and `src/modules/skill-profiles/README.md`

**Checkpoint**: Feature 1's installation/select/consent/generate/review path works end-to-end using no broad OAuth repository credential.

---

## Phase 6: User Story 4 — Review and Revoke Access (Priority: P2)

**Goal**: Process lifecycle changes idempotently, stop later unauthorized reads, preserve identity login, and keep admin review authoritative.

**Independent Test**: Remove a repository, suspend/uninstall the app, and deliver duplicate/out-of-order signed events; confirm new affected reads fail while Share-k profile/login and approved-review history remain safe.

### Tests

- [X] T042 [P] [US4] Add raw-body HMAC, delivery deduplication, duplicate/out-of-order event, and invalid-signature tests in `src/modules/github/controllers/github-app-webhook.controller.spec.ts`
- [X] T043 [P] [US4] Add controlled-clock service tests proving received revocations block affected reads within five minutes plus repository added/removed, installation suspend/unsuspend/delete, user-authorization revoke, and stale callback races in `src/modules/github/services/github-app-webhook.service.spec.ts`
- [X] T044 [P] [US4] Add disconnect tests proving repository integration is removed without deleting identity-only GitHub login or locking passwordless users in `src/modules/identity/services/social-auth.service.spec.ts` and `test/github-app-installation.e2e-spec.ts`
- [X] T045 [P] [US4] Add contract/E2E projection tests for owner-generation detail, bounded admin review, authorized skill-profile AI input, and other-user/public approved-skill output with a captured log sink; prove private identifiers/content/raw evidence cannot cross the allowed audience boundaries and pending/rejected skills remain ineligible in `test/private-github-evidence-redaction.e2e-spec.ts`, `src/modules/ai/ai.service.spec.ts`, `src/modules/ai/integrations/fastapi-skill-profile.client.spec.ts`, and `src/modules/skill-profiles/services/skill-profiles-review.service.spec.ts`

### Implementation

- [X] T046 [US4] Capture the exact raw webhook body and verify signature/delivery headers before delegation in `src/modules/github/controllers/github-app-webhook.controller.ts` and `src/main.ts`
- [X] T047 [US4] Implement idempotent canonical installation/repository reconciliation plus `github_app_authorization` revocation that clears only the matching provider user's member authorization and disables their affected links in `src/modules/github/services/github-app-webhook.service.ts`
- [X] T048 [US4] Add per-user installation-link disconnect that immediately disables that user's reads, preserves identity-only login, other installations, and other verified users of the same organization installation, and returns a separate GitHub manage/uninstall URL in `src/modules/github/services/github-app.service.ts`
- [X] T049 [US4] Prevent queued/running work from performing new reads after member revocation/reauthorization-required, installation suspension/deletion, or repository removal in `src/modules/skill-profiles/services/skill-profile-generation.service.ts`
- [X] T050 [US4] Implement explicit owner-generation, bounded-admin-review, authorized-skill-AI, and public-safe approved-skill projection allowlists with opaque private evidence IDs in `src/modules/skill-profiles/utils/skill-profile-generation.mapper.ts`, `src/modules/skill-profiles/services/skill-profiles-review.service.ts`, `src/modules/skill-profiles/services/skill-profile-summary.service.ts`, and `src/modules/ai/dto/skill-profile-ai.dto.ts`
- [X] T051 [US4] Document webhook forwarding, delivery replay, member-token rotation/reauthorization, revocation, evidence audiences, and disconnect operations in `docs/local-development.md`, `docs/api-contracts.md`, and `src/modules/github/README.md`

**Checkpoint**: Revocation is prompt, signed, idempotent, and does not confuse repository access with login identity.

---

## Phase 7: Cutover, Polish, and Cross-Cutting Verification

**Purpose**: Complete compatibility, security, documentation, and delivery gates after all stories pass.

- [X] T052 Make legacy repository credential fields nullable through a forward-only migration while retaining the singleton cutover state introduced by T007/T008 in `prisma/schema.prisma` and `prisma/migrations/`
- [X] T053 Remove `repo`/`public_repo` from repository authorization and explicitly retire or remap every broad-token repository list/README/description/statistics/contribution/commit/disconnect route while preserving identity OAuth and anonymous public-project import in `src/modules/github/services/github-oauth.service.ts`, `src/modules/github/controllers/github-oauth.controller.ts`, `src/modules/github/services/github-repository.service.ts`, and `src/modules/github/services/github-evidence.service.ts`
- [X] T054 Add API compatibility tests proving post-cutover legacy private routes fail with stable migration errors, identity login remains usable, and anonymous public project import still works in `test/github-oauth-cutover.e2e-spec.ts` and `src/modules/projects/projects.service.spec.ts`
- [X] T055 Add one database-owned audited cutover operation whose transaction persists the singleton timestamp and disables legacy reads, then attempts provider revocation per credential, records safe success/failure counts, purges every local broad credential regardless of provider outcome, exposes manual-revocation actions, and preserves separate identity links in `src/modules/github/services/github-evidence-cutover.service.ts`
- [X] T056 Add cutover service tests for transactionality, provider-revocation partial failure, credential purge, idempotent rerun, one authoritative clock, and preserved identity links in `src/modules/github/services/github-evidence-cutover.service.spec.ts`
- [X] T057 Add the GitHub-owned day-30 raw-profile cleanup operation with fail-closed unknown-key removal and controlled-clock before/at/after/rerun tests in `src/modules/github/services/github-legacy-cleanup.service.ts` and `src/modules/github/services/github-legacy-cleanup.service.spec.ts`
- [X] T058 Add an idempotent controlled-clock skill-profiles-owned evidence cleanup operation that applies the pre-approved field allowlist without altering approved skills or review decisions in `src/modules/skill-profiles/services/skill-profile-legacy-cleanup.service.ts`
- [X] T059 Add skill evidence cleanup tests for private/unknown JSON keys, all projection DTOs, reruns, approved skills, and retained admin decisions in `src/modules/skill-profiles/services/skill-profile-legacy-cleanup.service.spec.ts`
- [X] T060 Implement unresolved legacy candidate transition to `needs_more_evidence` as a separate idempotent skill-profiles-owned operation in `src/modules/skill-profiles/services/skill-profile-generation.service.ts`
- [X] T061 Add focused transition tests proving approved/rejected decisions remain unchanged and only unresolved legacy candidates transition after the deadline in `src/modules/skill-profiles/services/skill-profile-generation.service.spec.ts`
- [X] T062 Document the single cutover clock, dry-run/count reporting, provider-revocation outcomes, credential purge, day-30 cleanup, rollback boundary, retained fields, and verification procedure in `docs/database-plan.md` and `specs/004-optional-github-skill-profile/quickstart.md`
- [X] T063 [P] Perform a secret/projection review across `src/modules/github/`, logging configuration, DTOs, error paths, and AI boundaries and record results in `src/modules/github/README.md`
- [X] T064 [P] Update the GitHub App operational contract and environment inventory without changing secret values in `.env.example`, `docker-compose.yml`, `docs/local-development.md`, and `docs/team-onboarding.md`
- [ ] T065 Produce a deployable pre-release environment and record the SC-004 ten-contributor usability protocol, participant count, first-attempt completion count, and pass/fail result in `specs/004-optional-github-skill-profile/quickstart.md` and `docs/module-development-tracker.md`
- [X] T066 Run migration validation/generation and relevant focused tests, recording exact commands and results in `docs/module-development-tracker.md`
- [X] T067 Run `npm run check:architecture`, `npm run lint`, `npx tsc --noEmit`, `npm test -- --runInBand`, `npm run build`, and `git diff --check`, then record results in `docs/module-development-tracker.md`
- [X] T068 Review the final diff for API compatibility, module ownership, authorization, migration safety, evidence audiences, and unrelated changes, then complete the handoff record in `docs/module-development-tracker.md`

### External Pre-release Validation (release evidence, not an automated backend task)

The product/test owner recruits at least ten representative contributors and
records the SC-004 first-attempt result using `quickstart.md`. The implementer
must provide a deployable test environment and resolve defects, but completion
does not falsely claim that an automated repository task recruited participants.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundation (Phase 2)**: Depends on setup; blocks all stories.
- **US1 (Phase 3)**: Depends on foundation and can ship as the repository-free MVP.
- **US2 (Phase 4)**: Depends on foundation; independent of US1 runtime changes.
- **US3 (Phase 5)**: Depends on US2 installation/repository selection.
- **US4 (Phase 6)**: Depends on US2 and should complete before production cutover of US3.
- **Cutover/Polish (Phase 7)**: Depends on all user stories.

### User Story Dependency Graph

```text
Foundation ──> US1 (repository-free profile)
          └──> US2 (verified installation) ──> US3 (explicit generation)
                                         └──> US4 (revocation)
US1 + US2 + US3 + US4 ──> cutover and legacy credential cleanup plan
```

### Parallel Opportunities

- T003, T005, and T006 can run while configuration validation is implemented.
- T010, T011, and T013 can run in parallel after schema names stabilize.
- US1 E2E and service authorization tests can run in parallel.
- US2 service and E2E tests can run in parallel before implementation.
- US3 DTO, evidence, E2E, and worker tests affect distinct files and can run in parallel.
- US4 webhook, service, disconnect, and review regression tests can run in parallel.
- Documentation/security review tasks T063 and T064 can run in parallel after behavior stabilizes.

## Parallel Example: User Story 3

```text
T031: skill generation DTO/service consent tests
T032: GitHub installation evidence tests
T033: explicit-start E2E tests
T034: worker revocation/rate-limit tests
```

After those tests define the boundaries, implement T035 through T040 in dependency order.

## Implementation Strategy

### MVP First

1. Complete setup and foundation.
2. Complete US1 and prove GitHub is optional.
3. Stop and validate the repository-free account/profile journey.

### Incremental Delivery

1. Add verified installation and selected-repository listing (US2) alongside legacy OAuth.
2. Switch explicit skill generation to installation evidence (US3).
3. Complete lifecycle revocation and disconnect safety (US4).
4. Execute the audited credential-purging cutover, observe through the 30-day
   evidence window, then execute the already specified and tested cleanup workflow
   (T052–T062).

## Format Validation

All 68 tasks use the required checkbox, sequential ID, optional parallel marker,
required user-story label within story phases, actionable description, and exact
file path format.
