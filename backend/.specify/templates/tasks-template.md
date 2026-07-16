---

description: "Task list template for Share-k backend feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Generate tests according to the constitution and feature risk. Important status transitions, domain rules, AI failure paths, and core user-visible workflows require tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions
- Include requirement/task IDs in task descriptions when they come from the PRD or backlog

## Path Conventions

- **Modules**: `src/modules/<module-name>/`
- **Presentation**: `src/modules/<module-name>/presentation/`
- **Application**: `src/modules/<module-name>/application/`
- **Domain**: `src/modules/<module-name>/domain/`
- **Infrastructure**: `src/modules/<module-name>/infrastructure/`
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
- [ ] T002 Create or update module README in src/modules/[module]/README.md
- [ ] T003 [P] Add or update API contract documentation in docs/api-contracts.md if the frontend-facing API changes
- [ ] T004 [P] Add or update environment documentation in .env.example if configuration changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core boundaries that MUST be complete before ANY user story implementation begins.

**CRITICAL**: No user story work can begin until this phase is complete.

Examples of foundational tasks (adjust based on your project):

- [ ] T005 Define request/response DTO shapes in src/modules/[module]/presentation/
- [ ] T006 Define use-case input/output DTOs and ports in src/modules/[module]/application/
- [ ] T007 Define domain policy/status transition rules in src/modules/[module]/domain/
- [ ] T008 Update Prisma schema and create migration in prisma/ if persistence changes
- [ ] T009 Implement Prisma repository or external adapter interfaces in src/modules/[module]/infrastructure/
- [ ] T010 Add global error mapping or application/domain errors where needed
- [ ] T011 Add audit snapshot model/fields for AI-assisted business decisions where applicable

**Checkpoint**: Module boundaries, contracts, and persistence plan are ready.

---

## Phase 3: User Story 1 - [Title] (Priority: P1) MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1

- [ ] T012 [P] [US1] Add domain tests for [policy/status transition] in src/modules/[module]/domain/[name].spec.ts
- [ ] T013 [P] [US1] Add use-case tests with fake ports in src/modules/[module]/application/[use-case].spec.ts
- [ ] T014 [P] [US1] Add controller or E2E test for [endpoint/user flow] in [test path]

### Implementation for User Story 1

- [ ] T015 [P] [US1] Implement request DTO validation in src/modules/[module]/presentation/
- [ ] T016 [P] [US1] Implement response DTO/presenter in src/modules/[module]/presentation/
- [ ] T017 [US1] Implement domain rule or policy in src/modules/[module]/domain/
- [ ] T018 [US1] Implement use case orchestration in src/modules/[module]/application/
- [ ] T019 [US1] Implement repository/adapter behavior in src/modules/[module]/infrastructure/
- [ ] T020 [US1] Implement controller route that calls one use case in src/modules/[module]/presentation/
- [ ] T021 [US1] Add audit/status history/event emission where required by the plan

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2

- [ ] T022 [P] [US2] Add domain/use-case tests for [business behavior] in src/modules/[module]/
- [ ] T023 [P] [US2] Add integration or adapter test for [repository/external service] in [test path]

### Implementation for User Story 2

- [ ] T024 [US2] Implement [domain/application behavior] in src/modules/[module]/
- [ ] T025 [US2] Implement [controller/API behavior] in src/modules/[module]/presentation/
- [ ] T026 [US2] Integrate with public reader port, application service, or event if another module is involved

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3

- [ ] T027 [P] [US3] Add focused tests for [rule/workflow] in [test path]

### Implementation for User Story 3

- [ ] T028 [US3] Implement [feature behavior] in src/modules/[module]/
- [ ] T029 [US3] Update docs/contracts for user-facing behavior changes

**Checkpoint**: All selected user stories are independently functional.

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Code cleanup without changing module boundaries
- [ ] TXXX [P] Additional tests for uncovered domain/use-case branches
- [ ] TXXX Security review for auth, ownership, secrets, and safe logging
- [ ] TXXX Verify pagination, DTO stability, and error responses for list/API endpoints
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
- Domain rules before use-case orchestration
- Use cases before controllers
- Repository/adapter implementations behind application ports
- Controller routes call one use case and return response DTOs
- Story complete before moving to the next priority when working sequentially

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- DTO, domain, and adapter tests marked [P] can run in parallel when they touch different files
- Independent user stories can run in parallel after Foundational completion
- Documentation and contract updates can run in parallel with implementation when file ownership does not conflict

---

## Parallel Example: User Story 1

```bash
# Launch independent tests for User Story 1 together:
Task: "Add domain tests for [policy/status transition] in src/modules/[module]/domain/[name].spec.ts"
Task: "Add use-case tests with fake ports in src/modules/[module]/application/[use-case].spec.ts"
Task: "Add controller or E2E test for [endpoint/user flow] in [test path]"
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
3. Integrate only through declared public module APIs, reader ports, or events

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to a specific user story for traceability
- Each user story remains independently completable and testable
- Avoid vague tasks, same-file conflicts, direct cross-module infrastructure imports, raw Prisma rows in responses, and AI output directly changing final business state
