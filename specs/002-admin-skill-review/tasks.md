# Tasks: Admin Skill Review Backend

**Input**: Design documents from `/specs/002-admin-skill-review/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required for status transitions, audit history, admin authorization, and approved-only eligibility reads.

**Organization**: Tasks are grouped by user story so the admin review workflow, activation/notification side effects, real-time notification delivery, and audit/eligibility safety can be implemented independently.

## Phase 1: Setup (Shared Feature Preparation)

**Purpose**: Establish module docs, API contract notes, and database-plan notes before coding.

- [X] T001 [P] Update `src/modules/skill-profiles/README.md` with the review workflow, exported review service, and audit ownership notes.
- [X] T002 [P] Update `src/modules/admin/README.md` with the admin skill review route surface and service-boundary notes.
- [X] T003 [P] Add the admin skill review API summary to `docs/api-contracts.md`.
- [X] T004 [P] Add the review-history table note to `docs/database-plan.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add schema, DTOs, and module wiring needed before the review workflow can be implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Update `prisma/schema.prisma` with a `SkillProfileReviewDecision` model and any supporting enum/index changes.
- [X] T006 Create a Prisma migration for the review decision audit table in `prisma/migrations/`.
- [X] T007 Regenerate and validate the Prisma client after the schema change.
- [X] T008 [P] Define admin review request/response DTOs in `src/modules/skill-profiles/dto/` for pending list, approve, reject, and proficiency adjustment.
- [X] T009 [P] Define admin route DTOs in `src/modules/admin/dto/` for list filters and review actions.
- [X] T010 [P] Add the `SkillProfilesReviewService` export and module wiring in `src/modules/skill-profiles/skill-profiles.module.ts`.
- [X] T011 [P] Add admin module wiring for the review controller and auth guards in `src/modules/admin/admin.module.ts`.

**Checkpoint**: Schema, DTOs, and module boundaries are ready.

---

## Phase 3: User Story 1 - Admin Reviews Pending Skills (Priority: P1)

**Goal**: An admin can list pending AI-generated skills and approve, reject, or adjust proficiency through admin-only endpoints.

**Independent Test**: Seed pending skill candidates, call the pending queue endpoint, approve/reject/adjust one item, and verify the updated skill state and response payload.

### Tests for User Story 1

- [X] T012 [P] [US1] Add service tests for queue listing, approval, rejection, and proficiency adjustment in `src/modules/skill-profiles/services/skill-profiles-review.service.spec.ts`.
- [X] T013 [P] [US1] Add HTTP/E2E tests for `GET /admin/skill-reviews/pending`, `POST /admin/skill-reviews/:skillProfileId/approve`, `POST /admin/skill-reviews/:skillProfileId/reject`, and `PATCH /admin/skill-reviews/:skillProfileId/proficiency` in `test/admin-skill-reviews.e2e-spec.ts`.

### Implementation for User Story 1

- [X] T014 [US1] Implement pending queue listing in `src/modules/skill-profiles/services/skill-profiles-review.service.ts`.
- [X] T015 [US1] Implement approve/reject/proficiency transition handling and status validation in `src/modules/skill-profiles/services/skill-profiles-review.service.ts`.
- [X] T016 [US1] Implement review decision persistence in `src/modules/skill-profiles/services/skill-profiles-review.service.ts`.
- [X] T017 [US1] Implement `AdminSkillReviewsController` route handlers in `src/modules/admin/controllers/admin-skill-reviews.controller.ts`.
- [X] T018 [US1] Wire admin-only route guards and controller dependencies in `src/modules/admin/controllers/admin-skill-reviews.controller.ts`.

**Checkpoint**: Admin review actions work end to end.

---

## Phase 4: User Story 2 - Audit And Eligibility Safety (Priority: P2)

**Goal**: Every review action is auditable, and approved-only skill reads remain the eligibility source of truth.

**Independent Test**: Perform multiple review actions for one contributor, query the audit history, and verify approved-only skill reads exclude pending and rejected rows.

### Tests for User Story 2

- [X] T019 [P] [US2] Add audit-history and approved-only reader tests in `src/modules/skill-profiles/services/skill-profiles-review.service.spec.ts` and `src/modules/skill-profiles/services/skill-profile-summary.service.spec.ts`.

### Implementation for User Story 2

- [X] T020 [US2] Finalize immutable decision-history writes in `src/modules/skill-profiles/services/skill-profiles-review.service.ts`.
- [X] T021 [US2] Add an approved-only skill reader for downstream eligibility consumers in `src/modules/skill-profiles/services/skill-profile-summary.service.ts`.
- [X] T022 [US2] Update `specs/002-admin-skill-review/contracts/admin-skill-review.openapi.yaml` and `docs/api-contracts.md` if response shapes change after implementation.

**Checkpoint**: Audit storage and eligibility safety are both explicit and testable.

---

## Phase 5: User Story 3 - Contributor Activation And Review Notification (Priority: P1)

**Goal**: A final admin review outcome activates pending contributors when a skill is approved and stores contributor-facing notifications.

**Independent Test**: Approve a pending contributor's skill and verify account activation plus notification creation. Reject a pending skill and verify notification creation without activation. Adjust proficiency and verify no final side effect.

### Tests for User Story 3

- [X] T023 [P] [US3] Add identity account activation tests in `src/modules/identity/services/identity-account-status.service.spec.ts`.
- [X] T024 [P] [US3] Add notification creation tests in `src/modules/notifications/notifications.service.spec.ts`.
- [X] T025 [US3] Extend `SkillProfilesReviewService` tests for approval activation, approval notification, rejection notification, and no side effects on proficiency-only adjustment.

### Implementation for User Story 3

- [X] T026 [US3] Implement exported `IdentityAccountStatusService` in `src/modules/identity/services/identity-account-status.service.ts`.
- [X] T027 [US3] Implement exported `NotificationsService` and `NotificationsModule` in `src/modules/notifications/`.
- [X] T028 [US3] Wire `SkillProfilesReviewService` to call exported identity and notification services after approve/reject review transitions.
- [X] T029 [US3] Extend admin review response DTOs with activation and notification metadata.

**Checkpoint**: Final review outcomes activate contributors and notify contributors without direct cross-module table writes.

---

## Phase 6: User Story 4 - Real-Time Contributor Notifications (Priority: P2)

**Goal**: Persisted skill-review notifications are delivered to connected user sockets in real time.

**Independent Test**: Connect a socket with a valid access token, create a notification, and verify `notification.created` is emitted to that user's room. Invalid sessions must be rejected.

### Tests for User Story 4

- [X] T030 [P] [US4] Add gateway tests for access-token authentication, room joining, invalid-token rejection, disconnect cleanup, and user-room emission in `src/modules/notifications/notifications.gateway.spec.ts`.
- [X] T031 [US4] Extend notification service tests to verify persisted notifications are emitted through the gateway in `src/modules/notifications/notifications.service.spec.ts`.

### Implementation for User Story 4

- [X] T032 [US4] Add Nest Socket.IO dependencies in `package.json` and `package-lock.json`.
- [X] T033 [US4] Implement `NotificationsGateway` for the `notifications` namespace with `auth.token` access-token validation in `src/modules/notifications/notifications.gateway.ts`.
- [X] T034 [US4] Update `NotificationsService` to emit `notification.created` after the notification row is stored.
- [X] T035 [US4] Include `deliveredRealtime` side-effect metadata in skill review notification responses.

**Checkpoint**: Notifications are persisted first and delivered live to connected recipient sockets when possible.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, tracker updates, and final quality checks across the feature.

- [X] T036 [P] Update `src/modules/skill-profiles/README.md`, `src/modules/admin/README.md`, `src/modules/identity/README.md`, and `src/modules/notifications/README.md` with the final review workflow and ownership notes.
- [X] T037 [P] Update `docs/module-development-tracker.md` with short admin skill review, activation/notification, and real-time notification change records.
- [X] T038 [P] Update `specs/002-admin-skill-review/quickstart.md` with the final validation notes.
- [X] T039 Run `npm run check:architecture`, `npm run lint`, `npx tsc --noEmit`, `npm test -- --runInBand`, and `npm run build`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational.
- **US2 (Phase 4)**: Depends on US1 and the audit/history schema.
- **US3 (Phase 5)**: Depends on US1 review transitions.
- **US4 (Phase 6)**: Depends on US3 notification persistence.
- **Polish (Phase 7)**: Depends on all user stories.

### User Story Dependencies

- **US1 - Admin Reviews Pending Skills**: Core MVP. Delivers the review queue and action endpoints.
- **US2 - Audit And Eligibility Safety**: Depends on the review workflow and schema so the audit trail and approved-only reads are anchored to the same state.
- **US3 - Contributor Activation And Review Notification**: Depends on US1 review transitions and uses exported services from `identity` and `notifications`.
- **US4 - Real-Time Contributor Notifications**: Depends on notification persistence and delivers stored notifications to connected recipient sockets.

### Within Each User Story

- Tests first for the risky status transitions and audit rules.
- Service workflow before controller routes.
- Prisma writes inside the owning `skill-profiles` service.
- Admin routes stay thin and do not write skill tables directly.

## Parallel Opportunities

- Phase 1: T001 through T004 can run in parallel.
- Phase 2: T008 through T011 can run in parallel after the schema direction is fixed.
- US1: T012 and T013 can run in parallel.
- US2: T019 can run in parallel with documentation review work.
- Polish: T036 through T038 can run in parallel.

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Setup and Foundational work.
2. Implement the pending queue and review actions.
3. Validate the admin review endpoints independently.

### Incremental Delivery

1. Ship the admin queue and actions first.
2. Add immutable decision history and approved-only eligibility reads next.
3. Add contributor activation and notifications after final review outcomes.
4. Add real-time delivery for persisted notifications.
5. Finish by updating docs and running the quality gates.
