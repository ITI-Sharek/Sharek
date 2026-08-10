# Implementation Plan: Durable Realtime Notification Foundation

**Branch**: `006-realtime-notification-foundation` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/006-realtime-notification-foundation/spec.md`

## Summary

Evolve the existing `notifications` module rather than replacing it. Add semantic persistence, current-language rendering, durable inbox/read/preference APIs, cleanup, and persisted Notification events. Replace the process-local `/notifications` gateway with a technical shared `/realtime` gateway and Socket.IO Redis adapter. Existing cross-module notification methods remain available while their internal writes move to versioned templates.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js with NestJS 11

**Primary Dependencies**: NestJS, Prisma/PostgreSQL, existing Socket.IO; add `@socket.io/redis-adapter` and `redis` for cross-instance fan-out; use existing BullMQ/Redis conventions for a repeatable retention/publication recovery worker only where a durable job is required

**Storage**: PostgreSQL owns Notifications, preferences, category preferences, and append-only Notification events. Redis owns socket adapter fan-out only.

**Testing**: Jest unit/service/gateway tests, Supertest HTTP contracts, PostgreSQL migration/concurrency fixtures, two-server Redis adapter integration, and repository quality gates

**Target Platform**: Docker Compose NestJS API with PostgreSQL and Redis

**Project Type**: Backend feature-first modular monolith

**Performance Goals**: p95 committed Notification presentation within 2 seconds; ordinary list/read commands under the existing 3-second API gate; first 100 reconnect items within 5 seconds

**Constraints**: Unprefixed routes; HTTP owns durable commands; `/realtime` is one authenticated Socket.IO namespace; PostgreSQL stays authoritative; Redis outage cannot invalidate committed commands; Arabic/English backend catalogs; no Web Push in Slice 1

**Scale/Scope**: 500 connected sockets in test, current workflow volume, pages of at most 100 items, four retention choices, and semantic categories approved through DEC-068

## Constitution Check

- **Authority and Traceability — PASS**: The shared Sprint 9 contract, decisions, ADRs, backlog task, current code, and target behavior are separated in the spec.
- **Roles and Context — PASS**: Notification ownership derives from `user_id` and the authenticated session; account role is not item authorization.
- **Module Ownership — PASS**: `notifications` alone writes its records. Other modules continue calling the exported service, including with caller-owned Prisma transactions.
- **HTTP Flow — PASS**: A thin Notifications controller delegates validated DTOs to focused services using Prisma and the technical realtime publisher.
- **GitHub and Evidence — N/A**: No repository evidence is read or changed.
- **AI Boundary — N/A**: No AI workflow is introduced.
- **State and Persistence — PASS**: The migration is forward-only, preserves legacy rows, adds explicit version/read/preference/event state, and uses deterministic backfill/fallback.
- **API Contract — PASS**: DTO allowlists, opaque cursors, stable errors, localization, migration compatibility, and envelope versions are specified.
- **Testing and Reliability — PASS**: Authorization, migration, concurrency, Redis failure, duplicate delivery, reconnect, localization, retention, and performance are covered.
- **Brownfield Safety — PASS**: Existing transaction-aware creation, deduplication, tests, socket client, schema, and unrelated Material changes were inspected and will be preserved.

## Project Structure

### Documentation

```text
specs/006-realtime-notification-foundation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http-and-realtime.md
└── tasks.md
```

### Source Code

```text
prisma/
├── schema.prisma
└── migrations/<timestamp>_durable_realtime_notifications/

src/modules/notifications/
├── notifications.module.ts
├── notifications.controller.ts
├── notifications.service.ts
├── notification-presenter.service.ts
├── notification-preferences.service.ts
├── notification-retention.service.ts
├── notification-events.service.ts
├── dto/
├── jobs/                         # only the concrete cleanup/recovery jobs
├── templates/                    # typed Arabic/English catalog definitions
└── README.md

src/modules/identity/
├── controllers/session.controller.ts        # add current-user preferences command
├── dto/update-user-preferences.request.ts
└── services/session.service.ts             # identity remains User writer

src/shared/realtime/
├── realtime.module.ts
├── realtime.gateway.ts
├── realtime-publisher.service.ts
├── redis-io.adapter.ts
├── realtime-event-envelope.ts
└── README.md

test/
└── notifications-realtime.e2e-spec.ts
```

**Structure Decision**: `notifications` retains all Notification policy, persistence, templates, HTTP routes, and jobs. `identity` remains the only owner of the current user's language mutation. `shared/realtime` is a technical authenticated user-room transport with no Notification category/template knowledge; later communication modules may publish allowlisted envelopes through its exported publisher. The shared layer does not write business tables.

## Selected Design

### 1. Semantic migration

Add the approved enum values plus `template_key`, `template_version`, `parameters`, `deep_link`, `priority`, `aggregate_version`, and `updated_at`. Backfill existing rows from `type` plus known `metadata.action`; incomplete rows use `system.legacy` version 1 with audience-safe legacy title/body parameters. During one coordinated cutover, old `title/message/metadata` columns remain nullable compatibility data but no new write populates them. A later reviewed migration drops them after both clients consume semantic DTOs.

### 2. Durable event publication

Each create/read-state transaction appends a `NotificationEvent` with a UUID event ID, event type, aggregate version, recipient, and occurrence time. The service attempts publication only after commit. `published_at` records a successful adapter handoff; a bounded recovery worker republishes pending events. Delivery is at-least-once, so clients deduplicate by `eventId` and reconcile aggregate gaps through HTTP. A Redis failure never changes the already committed command response.

### 3. Realtime boundary

Bootstrap installs `RedisIoAdapter` before listening. `RealtimeGateway` authenticates the existing opaque access token, joins only `user:<id>`, emits `realtime.error` on rejection, and contains no process-local delivery-authority map. `RealtimePublisher` emits approved envelopes to user rooms. Health/logging distinguishes PostgreSQL authority from degraded Redis immediacy.

### 4. Presentation and deep links

Typed template definitions declare required parameter schema, Arabic/English render functions, priority, category, and a trusted deep-link builder. Creation rejects missing/unsafe parameters before persistence. Reads render from the current `preferred_language`; unknown version/category falls back to generic safe copy. The public DTO never returns `parameters` or internal `userId`.

### 5. Preferences and retention

One `NotificationPreference` per user holds retention and quiet hours. Sparse `NotificationCategoryPreference` rows override optional category defaults; required in-app categories are validated centrally and cannot be disabled. The cleanup worker deletes expired Notification/Event rows in bounded batches based on current recipient retention. Originating Application/Proposal/Assignment/audit tables are untouched.

Language is deliberately not duplicated in `NotificationPreference`. Identity adds `PATCH /auth/me/preferences` over the existing `preferred_language` column and returns the normal public auth-user DTO. Notification presentation resolves that current value on every HTTP read and at event presentation time.

### 6. Coordinated compatibility

The backend first ships the new HTTP surface and `/realtime` behind `REALTIME_NOTIFICATIONS_ENABLED` while retaining the old namespace for a time-boxed coordinated test deployment. Once the new frontend is verified, the old namespace and rendered-field writes are removed in the same Slice 1 release. No permanent dual stack is accepted.

## Delivery Phases

### Phase A - Migration and semantic creation

1. Add/backfill schema and constraints without losing current rows.
2. Add typed templates/presenter and convert existing skill/Application/Proposal creation methods.
3. Add Notification events transactionally to every creation path.
4. Prove existing caller transaction semantics and deduplication still hold.

### Phase B - Durable HTTP authority

1. Add list, unread-count, read-state, mark-all, and preference routes.
2. Add the identity-owned current-user language preference route.
3. Add cursor, filters, localization, non-leaking authorization, and idempotency.
4. Add bounded retention cleanup and current-retention behavior.

### Phase C - Shared realtime transport

1. Install the Socket.IO Redis adapter and shared `/realtime` gateway.
2. Publish persisted events after commit and recover unpublished events.
3. Add duplicate, gap, multi-instance, disconnect, suspension, and Redis-outage tests.
4. Remove process-local delivery authority and coordinate old namespace retirement.

### Phase D - Verification and handoff

1. Run migration fixtures on representative legacy notification rows.
2. Run focused/full gates and 500-socket/reconnect checks.
3. Update API/database/module/local-development docs, REST examples, tracker, and client handoff.

## Migration and Rollout

- Additive schema first; deterministic backfill; constraints after backfill.
- Existing deduplication keys remain unchanged.
- No originating module changes its public call order; only Notification inputs become typed semantic template inputs internally.
- Release flag defaults off outside test until the new client contract passes.
- Rollback disables new routes/realtime while additive columns and legacy compatibility fields preserve old reads; never reverse an applied migration destructively.

## Verification Plan

- Unit: template parameter validation/rendering/deep links, cursors, required-category rules, retention cutoffs, event envelopes.
- Service: transaction-aware creation, deduplication races, localized list, read/unread/all snapshot, preference concurrency, unpublished event recovery.
- HTTP: authentication, ownership concealment, validation, pagination, response allowlist, Arabic/English, stable errors.
- Migration: known Application/Proposal/skill rows, incomplete metadata fallback, enum/backfill constraints, rollback-safe additive deployment.
- Realtime: token/session states, per-user rooms, duplicate events, aggregate gaps, two instances through Redis, Redis outage/recovery.
- Performance: p95 two-second publication, first 100 recovery within five seconds, 500 connected sockets.
- Gates: Prisma format/validate/generate, migration harness, architecture, lint, exact TypeScript, focused/full Jest, build, API-client inventory, and diff check.

## Complexity Tracking

No constitutional violation. The persisted Notification-event outbox is justified by the approved post-commit zero-loss and at-least-once delivery contract; a direct best-effort emit cannot recover a process crash between commit and publication.
