---

description: "Task list template for Share-k backend feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Every backend feature requires unit, integration, authorization/security, API contract, and relevant E2E coverage. Include important state transitions, visibility/redaction, Admin bypasses, AI uncertainty, and external dependency failure paths when applicable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions
- Include requirement/task IDs in task descriptions when they come from the PRD or backlog

## Path Conventions

- **Modules**: `src/modules/<module-name>/`
- **Small-module controller/service**: `src/modules/<module-name>/<module-name>.controller.ts`, `src/modules/<module-name>/<module-name>.service.ts`
- **Grouped controllers/services**: `src/modules/<module-name>/controllers/`, `src/modules/<module-name>/services/` only when multiple files need grouping
- **DTOs**: `src/modules/<module-name>/dto/`
- **Optional technical folders**: `integrations/`, `repositories/`, `jobs/`, `events/`, `security/`, `mappers/`, `validators/`, or `utils/` only when real files require them
- **Shared technical code**: `src/shared/`
- **Prisma schema/migrations**: `prisma/schema.prisma`, `prisma/migrations/`
- **Tests**: colocated `*.spec.ts` files or `test/` E2E/integration files, matching existing repo practice

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit-tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/
  - Constitution checks from plan.md

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Feature Preparation)

**Purpose**: Establish the owning module scope, contracts, and supporting configuration.

- [ ] T001 Confirm owning module and requirement/task IDs in specs/[###-feature-name]/plan.md
- [ ] T002 Record current behavior, approved target behavior, assumptions, unresolved decisions, and existing uncommitted changes in specs/[###-feature-name]/plan.md
- [ ] T003 Create or update module README in src/modules/[module]/README.md
- [ ] T004 [P] Add or update API contract documentation in docs/api-contracts.md if the frontend-facing API changes
- [ ] T005 [P] Add or update environment documentation in .env.example if configuration changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core boundaries that MUST be complete before ANY user story implementation begins.

**CRITICAL**: No user story work can begin until this phase is complete.

Examples of foundational tasks (adjust based on your project):

- [ ] T006 Define validated request and explicit response DTOs in src/modules/[module]/dto/
- [ ] T007 Define account-mode journey rules, contextual authorization matrix,
  Admin bypass, and state-transition rules in the owning service plan/tests; do
  not treat OWNER and CONTRIBUTOR as exclusive project/contribution capability
  silos
- [ ] T008 Define exported service dependencies and module-local integration contracts without importing another module's private files
- [ ] T009 Define evidence visibility, provenance, freshness, redaction, and revocation behavior where applicable
- [ ] T010 Update Prisma schema and create a forward-only, data-preserving migration in prisma/ if persistence changes
- [ ] T011 Add concrete module-local repository or integration client only when the existing service would otherwise be hard to understand or test
- [ ] T012 Add stable error mapping and explicit public DTO allowlists
- [ ] T013 Add audit snapshot model/fields for important Admin or AI-assisted decisions where applicable

**Checkpoint**: Module boundaries, contracts, and persistence plan are ready.

---

## Phase 3: User Story 1 - [Title] (Priority: P1) MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1

- [ ] T014 [P] [US1] Add service/validator unit tests for [authorization/policy/status transition] in src/modules/[module]/[confirmed path].spec.ts
- [ ] T015 [P] [US1] Add integration tests for [Prisma/exported service/provider contract] in [test path]
- [ ] T016 [P] [US1] Add authorization/security and API contract tests for [endpoint/user flow] in [test path]
- [ ] T017 [P] [US1] Add relevant E2E coverage for [user-visible flow] in [test path]

### Implementation for User Story 1

- [ ] T018 [P] [US1] Implement request DTO validation in src/modules/[module]/dto/
- [ ] T019 [P] [US1] Implement explicit response DTO mapping in src/modules/[module]/dto/ or mappers/ when needed
- [ ] T020 [US1] Implement authorization, workflow, state transitions, and final decisions in a focused owning service
- [ ] T021 [US1] Implement module-owned Prisma persistence or a justified concrete repository
- [ ] T022 [US1] Implement module-local provider client behavior behind the owning service when applicable
- [ ] T023 [US1] Implement a thin controller route that delegates to the owning service
- [ ] T024 [US1] Add audit/status history/completed-fact event emission where required by the plan

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2

- [ ] T025 [P] [US2] Add service/state-transition tests for [business behavior] in src/modules/[module]/
- [ ] T026 [P] [US2] Add integration/provider contract tests for [repository/external service] in [test path]
- [ ] T027 [P] [US2] Add authorization/security, API contract, and relevant E2E coverage in [test path]

### Implementation for User Story 2

- [ ] T028 [US2] Implement [service workflow/final decision] in src/modules/[module]/
- [ ] T029 [US2] Implement [controller/API DTO behavior] in src/modules/[module]/
- [ ] T030 [US2] Integrate through an exported provider-module service or completed-fact event if another module is involved

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3

- [ ] T031 [P] [US3] Add unit tests for [rule/state transition] in [test path]
- [ ] T032 [P] [US3] Add integration tests for [persistence/exported service/provider] in [test path]
- [ ] T033 [P] [US3] Add authorization/security and API contract tests for [endpoint] in [test path]
- [ ] T034 [P] [US3] Add relevant E2E coverage for [user-visible flow] in [test path]

### Implementation for User Story 3

- [ ] T035 [US3] Implement [feature behavior] in the focused controller/service/DTO files under src/modules/[module]/
- [ ] T036 [US3] Update docs/contracts for user-facing behavior changes

**Checkpoint**: All selected user stories are independently functional.

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Code cleanup without changing module boundaries
- [ ] TXXX [P] Additional tests for uncovered service, state-transition, and failure branches
- [ ] TXXX Security review for account-mode journeys, cross-journey
  project/contribution capability, persisted relationships, Admin bypasses,
  secrets, evidence privacy, and safe logging
- [ ] TXXX Verify pagination, explicit DTO allowlists, compatibility, and stable error responses for list/API endpoints
- [ ] TXXX Verify timeout, rate-limit, revocation, retry, idempotency, concurrency, and partial-failure behavior for external dependencies
- [ ] TXXX Verify GitHub-connected and repository-free workflows remain compatible
- [ ] TXXX Run Docker/local quickstart validation when runtime wiring changes
- [ ] TXXX Run relevant lint, test, build, and migration checks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel if they touch different files
  - Or sequentially in priority order (P1 -> P2 -> P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - no dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - may integrate with US1 but remains independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - may integrate with US1/US2 but remains independently testable

### Within Each User Story

- Tests for required risk areas before or alongside implementation, with failures verified when practical
- Authorization and state rules before workflow orchestration
- Owning service workflow before controller routes
- Concrete repositories/integration clients remain module-local and are added only when justified
- Controller routes delegate to one focused owning service and return explicit response DTOs
- Story complete before moving to the next priority when working sequentially

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- DTO, service, repository, integration-client, and contract tests marked [P] can run in parallel when they touch different files
- Independent user stories can run in parallel after Foundational completion
- Documentation and contract updates can run in parallel with implementation when file ownership does not conflict

---

## Parallel Example: User Story 1

```bash
# Launch independent tests for User Story 1 together:
Task: "Add service/validator tests for [authorization/policy/status transition] in src/modules/[module]/[confirmed path].spec.ts"
Task: "Add integration/provider contract tests for [dependency] in [test path]"
Task: "Add authorization/security and API contract tests for [endpoint] in [test path]"
Task: "Add relevant E2E test for [user-visible flow] in [test path]"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks all stories)
3. Complete Phase 3: User Story 1
4. Stop and validate User Story 1 independently
5. Demo or deploy if ready

### Incremental Delivery

1. Complete Setup and Foundational work
2. Add User Story 1, test independently, then demo
3. Add User Story 2, test independently, then demo
4. Add User Story 3, test independently, then demo
5. Keep each story valuable without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup and Foundational work together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Integrate only through exported NestJS services or events describing completed facts

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to a specific user story for traceability
- Each user story remains independently completable and testable
- Avoid vague tasks, same-file conflicts, legacy layer/use-case/port architecture, direct cross-module private imports, raw Prisma/provider objects in responses, and AI output directly changing final business state
