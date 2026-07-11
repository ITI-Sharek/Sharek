# Tasks: Contributor Profile Redirect

**Input**: Design documents from `/specs/001-contributor-profile-redirect/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/contributor-profile-redirect.openapi.yaml, quickstart.md

**Tests**: Required by the feature spec, plan, constitution, and quickstart for login DTO shape, username generation/collision handling, profile ensure idempotency, viewer-specific profile responses, skill visibility, and protected error outcomes.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently after foundational schema/module work is complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on incomplete tasks in the same phase
- **[Story]**: Maps to user stories in `specs/001-contributor-profile-redirect/spec.md`
- Every task includes exact file paths

## Path Conventions

- **Identity module**: `src/modules/identity/`
- **Contributor profiles module**: `src/modules/contributor-profiles/`
- **GitHub module**: `src/modules/github/`
- **Skill profiles module**: `src/modules/skill-profiles/`
- **Reputation module**: `src/modules/reputation/`
- **Shared auth/errors**: `src/shared/auth/`, `src/shared/errors/`
- **Prisma**: `prisma/schema.prisma`, `prisma/migrations/`
- **Contracts/docs**: `docs/api-contracts.md`, `specs/001-contributor-profile-redirect/`

## Phase 1: Setup (Shared Feature Preparation)

**Purpose**: Establish feature scope, module shell, and shared contract references.

- [X] T001 Create contributor profiles module shell in `src/modules/contributor-profiles/contributor-profiles.module.ts`
- [X] T002 Create contributor profiles module README with ownership and public API notes in `src/modules/contributor-profiles/README.md`
- [X] T003 Register `ContributorProfilesModule` in `src/app.module.ts`
- [X] T004 [P] Update frontend-facing API contract summary for contributor profile redirect in `docs/api-contracts.md`
- [X] T005 [P] Add feature implementation notes and requirement IDs to `src/modules/identity/README.md`
- [X] T006 [P] Add feature implementation notes and owned-table rules to `src/modules/contributor-profiles/README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add schema, public module boundaries, DTOs, and domain policies required before any user story can be implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 Update `User` with nullable unique `username` and add `ContributorProfile` relation/model in `prisma/schema.prisma`
- [X] T008 Create Prisma migration for `User.username` and `ContributorProfile` in `prisma/migrations/20260711000000_contributor_profile_redirect/migration.sql`
- [X] T009 Regenerate Prisma client after schema change using `prisma/schema.prisma`
- [X] T010 [P] Define username normalization and validation policy in `src/modules/identity/domain/username/username.policy.ts`
- [X] T011 [P] Add username policy tests for regex, normalization, email fallback, and 10-attempt suffix behavior in `src/modules/identity/domain/username/username.policy.spec.ts`
- [X] T012 Define contributor profile account-status and viewer relationship policies in `src/modules/contributor-profiles/domain/policies/contributor-profile.policy.ts`
- [X] T013 Add contributor profile policy tests for active/pending, suspended/deactivated, owner, and authenticated-viewer cases in `src/modules/contributor-profiles/domain/policies/contributor-profile.policy.spec.ts`
- [X] T014 [P] Add contributor profile DTOs and nested summary DTOs in `src/modules/contributor-profiles/application/dto/contributor-profile.dto.ts`
- [X] T015 [P] Add contributor profile application ports for identity, GitHub, skill, and reputation readers in `src/modules/contributor-profiles/application/ports/profile-readers.port.ts`
- [X] T016 [P] Add contributor profile repository port in `src/modules/contributor-profiles/application/ports/contributor-profile.repository.ts`
- [X] T017 Add Prisma contributor profile repository implementation in `src/modules/contributor-profiles/infrastructure/persistence/prisma-contributor-profile.repository.ts`
- [X] T018 Export an identity username reader/ensurer application service from `src/modules/identity/identity.module.ts`
- [X] T019 Add identity username service implementation using the username policy in `src/modules/identity/application/use-cases/identity-username.service.ts`
- [X] T020 Add public GitHub status reader service and export it from `src/modules/github/github.module.ts`
- [X] T021 Add public skill summary reader service and export it from `src/modules/skill-profiles/skill-profiles.module.ts`
- [X] T022 Add public reputation summary reader service and export it from `src/modules/reputation/reputation.module.ts`
- [X] T023 Add typed application errors for 400/403/404/409/422 profile outcomes in `src/shared/errors/application.error.ts`
- [X] T024 Update access-token status handling for active and pending authenticated users while keeping suspended/deactivated blocked in `src/shared/auth/guards/access-token.guard.ts`
- [X] T025 Update login and refresh status policy for active users and pending contributors while keeping suspended/deactivated users blocked in `src/modules/identity/application/use-cases/identity.service.ts`

**Checkpoint**: Schema, module shell, public reader boundaries, domain policies, and shared auth/error foundations are ready.

---

## Phase 3: User Story 1 - Contributor Login Redirect Path (Priority: P1) MVP

**Goal**: A contributor can log in, receive a stable username, ensure a profile, and load `/profile/{username}` as the profile owner.

**Independent Test**: Sign in as an active contributor, call profile ensure with the returned access token, and verify the returned username loads the same profile with `viewerRelationship: "owner"`.

### Tests for User Story 1

- [X] T026 [P] [US1] Add identity service tests for active login, pending contributor login/refresh, suspended/deactivated rejection, username generation, and public auth DTO shape in `src/modules/identity/application/use-cases/identity.service.spec.ts`
- [X] T027 [P] [US1] Add identity username service tests for uniqueness retries and 409 after 10 collisions in `src/modules/identity/application/use-cases/identity-username.service.spec.ts`
- [X] T028 [P] [US1] Add contributor profile ensure use-case tests for create, existing profile return, active/pending contributor eligibility, and owner viewer DTO in `src/modules/contributor-profiles/application/use-cases/ensure-contributor-profile.use-case.spec.ts`
- [X] T029 [P] [US1] Add HTTP/E2E test for login -> ensure -> lookup owner redirect flow in `test/contributor-profile-redirect.e2e-spec.ts`

### Implementation for User Story 1

- [X] T030 [US1] Add `username` to `AuthUserDto` in `src/modules/identity/application/dto/auth-session.dto.ts`
- [X] T031 [US1] Include `username` in auth user mapping in `src/modules/identity/application/mappers/auth-user.mapper.ts`
- [X] T032 [US1] Ensure contributor usernames during login/current-user flows in `src/modules/identity/application/use-cases/identity.service.ts`
- [X] T033 [US1] Implement ensure contributor profile use case in `src/modules/contributor-profiles/application/use-cases/ensure-contributor-profile.use-case.ts`
- [X] T034 [US1] Implement owner completion prompt builder in `src/modules/contributor-profiles/application/use-cases/profile-completion-prompts.ts`
- [X] T035 [US1] Implement contributor profile response assembler for owner view in `src/modules/contributor-profiles/application/use-cases/contributor-profile-presenter.ts`
- [X] T036 [US1] Add contributor profile controller with `POST /contributors/profiles/me/ensure` in `src/modules/contributor-profiles/presentation/http/controllers/contributor-profiles.controller.ts`
- [X] T037 [US1] Wire contributor profile use cases, repository, and reader providers in `src/modules/contributor-profiles/contributor-profiles.module.ts`
- [X] T038 [US1] Implement contributor profile lookup repository methods by canonical username in `src/modules/contributor-profiles/infrastructure/persistence/prisma-contributor-profile.repository.ts`
- [X] T039 [US1] Implement owner-capable get contributor profile use case with active/pending visibility and 404 hidden profile handling in `src/modules/contributor-profiles/application/use-cases/get-contributor-profile.use-case.ts`
- [X] T040 [US1] Add `GET /contributors/profiles/:username` controller route in `src/modules/contributor-profiles/presentation/http/controllers/contributor-profiles.controller.ts`

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Authenticated Profile Viewing (Priority: P2)

**Goal**: Authenticated users can load contributor profiles by canonical username and receive safe non-owner viewer responses.

**Independent Test**: Load the same contributor profile as the owner and as another authenticated user, then compare `viewerRelationship`, `completionPrompts`, and skill visibility.

### Tests for User Story 2

- [X] T041 [P] [US2] Add profile lookup use-case tests for authenticated-viewer responses on an existing profile route in `src/modules/contributor-profiles/application/use-cases/get-contributor-profile.use-case.spec.ts`
- [X] T042 [P] [US2] Add skill visibility tests for owner all-generated skills and other-viewer approved-only skills in `src/modules/contributor-profiles/application/use-cases/contributor-profile-presenter.spec.ts`
- [X] T043 [P] [US2] Add HTTP/E2E tests for `GET /contributors/profiles/:username` authenticated-viewer responses in `test/contributor-profile-view.e2e-spec.ts`

### Implementation for User Story 2

- [X] T044 [US2] Implement GitHub status reader adapter for profile responses in `src/modules/github/application/use-cases/github-profile-status-reader.service.ts`
- [X] T045 [US2] Implement skill summary reader adapter with owner/all and viewer/approved filters in `src/modules/skill-profiles/application/use-cases/skill-profile-summary-reader.service.ts`
- [X] T046 [US2] Implement reputation summary reader adapter with default empty summary in `src/modules/reputation/application/use-cases/reputation-summary-reader.service.ts`
- [X] T047 [US2] Enhance get contributor profile use case for authenticated-viewer response assembly in `src/modules/contributor-profiles/application/use-cases/get-contributor-profile.use-case.ts`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Protected Error Handling (Priority: P3)

**Goal**: The backend returns precise, useful, and safe error outcomes for invalid credentials, invalid tokens, role/status denial, conflicts, invalid source data, and unknown/hidden profiles.

**Independent Test**: Attempt each rejected action with invalid credentials, missing tokens, owner/admin users, suspended/deactivated contributors, duplicate usernames, invalid generated usernames, and unknown profile usernames.

### Tests for User Story 3

- [X] T048 [P] [US3] Add identity auth error tests for invalid credentials and pending/suspended/deactivated token behavior in `src/modules/identity/application/use-cases/identity.service.spec.ts`
- [X] T049 [P] [US3] Add contributor profile error use-case tests for owner/admin 403, suspended/deactivated 403, unresolved username 409, invalid source 422, and hidden lookup 404 in `src/modules/contributor-profiles/application/use-cases/contributor-profile-errors.spec.ts`
- [X] T050 [P] [US3] Add HTTP/E2E tests for 400/401/403/404/409/422 outcomes in `test/contributor-profile-errors.e2e-spec.ts`

### Implementation for User Story 3

- [X] T051 [US3] Map contributor profile application errors to safe HTTP responses in `src/shared/errors/http-exception.filter.ts`
- [X] T052 [US3] Enforce owner/admin and suspended/deactivated ensure rejection in `src/modules/contributor-profiles/application/use-cases/ensure-contributor-profile.use-case.ts`
- [X] T053 [US3] Enforce invalid profile source data 422 handling in `src/modules/identity/application/use-cases/identity-username.service.ts`
- [X] T054 [US3] Enforce malformed username route parameter validation for profile lookup in `src/modules/contributor-profiles/presentation/http/controllers/contributor-profiles.controller.ts`
- [X] T055 [US3] Verify response DTO sanitization excludes password hashes, token fields, OAuth credentials, session internals, and security metadata in `src/modules/contributor-profiles/application/use-cases/contributor-profile-presenter.ts`

**Checkpoint**: All user stories are independently functional and protected failure paths are covered.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and final quality checks across all user stories.

- [X] T056 [P] Update implemented endpoint examples and DTO notes in `docs/api-contracts.md`
- [X] T057 [P] Update contributor profile module ownership notes in `src/modules/contributor-profiles/README.md`
- [X] T058 [P] Update quickstart validation outcomes after implementation in `specs/001-contributor-profile-redirect/quickstart.md`
- [X] T059 Validate profile ensure and lookup remain single-resource flows compatible with the P95 <3s target and record findings in `specs/001-contributor-profile-redirect/quickstart.md`
- [X] T060 Run focused Jest tests for identity and contributor profiles and record results in `specs/001-contributor-profile-redirect/tasks.md` (Result: `npm test -- --runInBand identity contributor-profile` passed: 12 suites, 34 tests)
- [X] T061 Run full backend test suite and record results in `specs/001-contributor-profile-redirect/tasks.md` (Result: `npm test -- --runInBand` passed: 15 suites, 41 tests)
- [X] T062 Run backend build and Prisma validation for `prisma/schema.prisma` (Result: `npm run build` passed; `npx prisma validate --schema prisma/schema.prisma` passed)
- [X] T063 Review final implementation against no-secret/no-private-field requirements in `src/modules/contributor-profiles/application/use-cases/contributor-profile-presenter.ts` (Result: presenter builds explicit DTO only; tests assert no password/token material)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational. Delivers MVP redirect flow.
- **US2 (Phase 4)**: Depends on US1 lookup route and foundational reader ports; authenticated-viewer behavior remains independently testable.
- **US3 (Phase 5)**: Depends on Foundational and should run after US1/US2 paths exist so error behavior can be validated end to end.
- **Polish (Phase 6)**: Depends on all selected user stories.

### User Story Dependencies

- **US1 - Contributor Login Redirect Path**: MVP. Requires schema, username service, profile module, ensure endpoint, and owner-capable profile lookup route.
- **US2 - Authenticated Profile Viewing**: Starts after US1 lookup route exists and adds non-owner viewer response behavior.
- **US3 - Protected Error Handling**: Depends on the routes/use cases from US1 and US2 to validate all failure paths.

### Within Each User Story

- Tests first, then domain/application behavior, then controllers and integration wiring.
- DTO/presenter code before controller route completion.
- Repository implementations behind application ports.
- No controller may query Prisma directly or assemble business decisions.

---

## Parallel Opportunities

- Phase 1: T004, T005, and T006 can run in parallel.
- Phase 2: T010, T011, T014, T015, and T016 can run in parallel after T007/T008 are understood.
- US1: T026, T027, T028, and T029 can be written in parallel before implementation.
- US2: T041, T042, and T043 can be written in parallel; T044, T045, and T046 can be implemented in parallel because they touch different modules.
- US3: T048, T049, and T050 can be written in parallel.
- Polish: T056, T057, and T058 can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Independent test-writing tasks for US1:
Task: "T026 [P] [US1] Add identity service tests in src/modules/identity/application/use-cases/identity.service.spec.ts"
Task: "T027 [P] [US1] Add username service tests in src/modules/identity/application/use-cases/identity-username.service.spec.ts"
Task: "T028 [P] [US1] Add profile ensure use-case tests in src/modules/contributor-profiles/application/use-cases/ensure-contributor-profile.use-case.spec.ts"
Task: "T029 [P] [US1] Add redirect E2E test in test/contributor-profile-redirect.e2e-spec.ts"
```

## Parallel Example: User Story 2

```bash
# Independent viewer-response tasks for US2:
Task: "T044 [US2] Implement GitHub status reader in src/modules/github/application/use-cases/github-profile-status-reader.service.ts"
Task: "T045 [US2] Implement skill summary reader in src/modules/skill-profiles/application/use-cases/skill-profile-summary-reader.service.ts"
Task: "T046 [US2] Implement reputation summary reader in src/modules/reputation/application/use-cases/reputation-summary-reader.service.ts"
```

## Parallel Example: User Story 3

```bash
# Independent error test tasks for US3:
Task: "T048 [P] [US3] Add identity auth error tests in src/modules/identity/application/use-cases/identity.service.spec.ts"
Task: "T049 [P] [US3] Add profile error use-case tests in src/modules/contributor-profiles/application/use-cases/contributor-profile-errors.spec.ts"
Task: "T050 [P] [US3] Add HTTP error E2E tests in test/contributor-profile-errors.e2e-spec.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 for login/current-user username support and profile ensure.
3. Validate login -> ensure -> owner lookup redirect path.
4. Stop and demo `/profile/{profile.username}` support before adding wider viewer and error coverage.

### Incremental Delivery

1. US1 delivers the contributor redirect path.
2. US2 adds authenticated viewer response rules and cross-module summary readers.
3. US3 hardens all protected error outcomes.
4. Polish updates docs and runs final checks.

### Validation Commands

```bash
npm test
npm run build
npm run prisma:generate
```

When Docker is required:

```bash
docker compose exec api npm test
docker compose exec api npm run build
docker compose exec api npm run prisma:generate
```

## Notes

- Tasks reference feature requirements FR-001 through FR-026 and TS-001 through TS-004 from `specs/001-contributor-profile-redirect/spec.md`.
- `identity` owns writes to `users.username`; `contributor-profiles` owns writes to contributor profile rows.
- Cross-module GitHub, skill, and reputation reads must go through public reader/application services.
- No task may expose password hashes, tokens, token hashes, OAuth credentials, private auth session fields, or internal security metadata in response DTOs.
