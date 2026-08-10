# Tasks: Durable Realtime Notification Foundation

**Input**: `specs/006-realtime-notification-foundation/`

**Tests**: Tests are required before or with their corresponding implementation. All paths are backend-relative.

## Phase 1: Baseline and migration safety

- [x] T001 Record current `notifications` focused/full test baselines and preserve unrelated `src/modules/materials/**` changes.
- [x] T002 [P] Add representative legacy Notification migration fixtures for skill review, each Application action, each Proposal action, and malformed metadata.
- [x] T003 [P] Add failing semantic-template and presentation tests under `src/modules/notifications/templates/` and `notification-presenter.service.spec.ts`.
- [x] T004 Add Notification enums/models/preferences/events and compatibility fields to `prisma/schema.prisma` plus a forward-only migration.
- [x] T005 Prove add/backfill/constrain behavior on temporary PostgreSQL, including no row loss, known mappings, generic fallback, indexes, and read-state checks.

## Phase 2: Semantic Notification authority

- [x] T006 Define typed template keys, parameter contracts, category/priority policy, trusted deep-link builders, and Arabic/English catalogs in `src/modules/notifications/templates/`.
- [x] T007 Implement `NotificationPresenterService` with current-language rendering, generic unknown-version fallback, and explicit public DTO allowlist.
- [x] T008 Refactor `NotificationsService` inputs/writes for semantic fields while preserving existing exported skill/Application/Proposal methods, deduplication keys, and caller transactions.
- [x] T009 Add `NotificationEventsService` so create mutations append a stable event in the same transaction and publish only after commit.
- [x] T010 Update Application, Proposal, and skill-review tests to prove copy is not persisted as authority and transaction rollback creates neither Notification nor event.

## Phase 3: Durable HTTP inbox and preferences

- [x] T011 [P] Add failing cursor codec/list/count service tests for stable `(created_at,id)` pagination, filters, retention, and cross-user concealment.
- [x] T012 [P] Add failing read/unread/mark-all concurrency and idempotency tests, including per-item aggregate events.
- [x] T013 [P] Add failing preference tests for defaults, revision conflicts, retention allowlist, overnight quiet hours, IANA timezone validation, and required categories.
- [x] T014 Add request/response/query DTOs under `src/modules/notifications/dto/` with class-validator and explicit response types.
- [x] T015 Implement list/count/read/mark-all behavior in focused Notification services using module-owned Prisma tables.
- [x] T016 Implement `NotificationPreferencesService` and sparse category overrides with central required-category policy.
- [x] T017 Add thin authenticated `NotificationsController` routes exactly matching `contracts/http-and-realtime.md`.
- [x] T018 Add Supertest contracts for authentication, UUID/cursor validation, pagination, Arabic/English rendering, DTO redaction, non-leaking ownership, stable errors, and revision conflicts.
- [x] T035 Add failing identity tests, the exact `preferredLanguage` DTO, and `PATCH /auth/me/preferences` in the identity session controller/service; prove current-user scope, idempotency, invalid-language rejection, public DTO redaction, and subsequent Notification localization.

## Phase 4: Retention and event recovery

- [x] T019 Add failing controlled-clock retention tests for 30/90/180/365-day boundaries, changed preferences, bounded batches, cascade events, and untouched workflow audits.
- [x] T020 Implement concrete Notification retention queue/worker/service using existing Redis/BullMQ configuration conventions.
- [x] T021 Add failing unpublished-event recovery tests for stable IDs, bounded retries, duplicate adapter handoff, and safe final operational metadata.
- [x] T022 Implement bounded pending `NotificationEvent` publication recovery without making Redis command success part of the durable HTTP response.

## Phase 5: Shared `/realtime` transport

- [x] T023 [P] Add `redis` and `@socket.io/redis-adapter` dependencies and validated realtime feature/config controls.
- [x] T024 [P] Add failing `RedisIoAdapter` lifecycle tests for publisher/subscriber duplication, connect, error, reconnect, and close.
- [x] T025 Add `src/shared/realtime/` envelope, publisher, gateway, module, adapter, and README with no Notification business policy.
- [x] T026 Install the connected adapter in `src/main.ts` before listen and preserve HTTP startup when realtime is deliberately feature-disabled.
- [x] T027 Replace Notification gateway delivery with persisted `notification.created` and `notification.read_state_changed` envelopes to `user:<id>` on `/realtime`.
- [x] T028 Add gateway tests for active/pending-contributor sessions, expired/revoked/suspended rejection, bearer normalization, user-room isolation, and no process-local truth map.
- [x] T029 Add two-instance Redis integration tests, duplicate delivery, Redis outage/recovery, event-gap HTTP reconciliation evidence, and coordinated legacy namespace retirement.

## Phase 6: Documentation and release gates

- [x] T030 Update `.env.example`, Docker/local development, module/shared READMEs, `docs/api-contracts.md`, `docs/database-plan.md`, `sharek-api.http`, and Postman/API-client inventories.
- [x] T031 Append the required TASK-9-02 record to `docs/module-development-tracker.md` with migration, API, authorization, and risk evidence.
- [x] T032 Run Prisma format/validate/generate, migration harness, architecture, lint, exact TypeScript, focused/full Jest, build, API-client validation, and `git diff --check`.
- [x] T033 Run the quickstart, 500-socket profile, p95 publication measurement, first-100 reconnect measurement, and zero cross-user leakage suite.
- [x] T034 Review the complete diff against DEC-044/054/064/068/074 and hand off the exact client cutover contract without committing/pushing unless requested.

## Dependencies

```text
Migration baseline
  -> semantic authority
      -> HTTP inbox/preferences -> retention
      -> persisted events -> shared /realtime
          -> cross-instance/recovery verification
              -> coordinated frontend cutover
```

T002 and T003 can proceed independently. T011–T013 can proceed independently after the model contract. T035 must land before the frontend language task and can proceed beside T014–T018. T019 and T021 can proceed in parallel after HTTP/event services. T023/T024 can proceed while Notification HTTP work is underway.

## Format Validation

All 35 tasks have unique IDs, concrete paths/boundaries, and map to TASK-9-02 and Slice 1 acceptance. T035 is grouped with its Phase 3 dependency while preserving the original task IDs.
