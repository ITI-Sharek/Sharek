# Implementation Plan: Admin Skill Review Backend

**Branch**: `002-admin-skill-review` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-admin-skill-review/spec.md`

## Summary

Implement admin APIs for pending AI-generated skill review. The `skill-profiles` module owns review state, status transitions, and audit storage. The `admin` module exposes the HTTP review routes and guards, but it does not write skill tables directly. Review decisions must be durably stored, eligibility readers must only consume approved skills, and final approval/rejection outcomes must coordinate contributor activation and notifications through exported owner-module services. Notifications should also deliver real-time events to authenticated user sockets after persistence.

## Technical Context

**Language/Version**: TypeScript on Node.js with NestJS 11

**Primary Dependencies**: NestJS, Nest WebSockets, Socket.IO, Prisma, PostgreSQL

**Storage**: PostgreSQL via Prisma; no new queue, AI call, or new database table required for activation/notification because `User` and `Notification` already exist

**Testing**: Jest unit tests and HTTP/E2E tests for queue listing, decision transitions, protected error paths, socket authentication, and notification emission

**Target Platform**: Docker Compose local backend stack

**Project Type**: Backend web API in a feature-first modular monolith

**Performance Goals**: Pending queue and review actions should remain single-request backend operations with pagination for list retrieval

**Constraints**: Controllers stay thin; review state and audit writes live in `skill-profiles`; `admin` only handles route binding and auth; Prisma migrations are required for schema changes; no Clean Architecture layers

**Scale/Scope**: Small back-office queue for AI-generated skills with one decision trail per review action and admin-only access

## Constitution Check

*GATE: Must pass before design completion.*

- **Module Ownership**: `skill-profiles` owns skill candidates, approval state, and audit records; `identity` owns contributor account status; `notifications` owns notification rows; `admin` owns HTTP review routes and authorization.
- **HTTP Flow**: Route -> DTO validation -> controller -> service -> Prisma transaction -> exported owner-module services for post-review effects -> persisted notification emitted through WebSocket gateway when connected.
- **Domain Boundary**: Review transitions and audit rules remain in services, not controllers.
- **AI Boundary**: No AI call is required in this feature.
- **Persistence**: Prisma schema and migration are needed for the review history table and any supporting indexes.
- **API Contract**: Pending list and decision endpoints require explicit request/response shapes and admin-only behavior.
- **Testing**: Queue listing, transitions, audit writes, and auth failures need focused coverage.
- **Operations/Security**: Admin authorization must be explicit in route guards and service checks.

## Project Structure

### Documentation (this feature)

```text
specs/002-admin-skill-review/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
src/modules/skill-profiles/
  services/skill-profiles-review.service.ts
  services/skill-profile-summary.service.ts
  dto/
  skill-profiles.module.ts
  README.md

src/modules/admin/
  controllers/admin-skill-reviews.controller.ts
  dto/
  admin.module.ts
  README.md

src/modules/identity/
  services/identity-account-status.service.ts
  identity.module.ts
  README.md

src/modules/notifications/
  notifications.module.ts
  notifications.service.ts
  notifications.gateway.ts
  dto/
  README.md

prisma/
  schema.prisma
  migrations/

docs/
  api-contracts.md
  database-plan.md
  module-development-tracker.md
```

**Structure Decision**: Keep review state ownership in `skill-profiles` and expose a focused exported review service. Keep `admin` as the HTTP boundary for authenticated review routes. Use exported `identity` and `notifications` services for account activation and notification writes instead of letting `skill-profiles` write foreign-owned tables. Add a dedicated review-decision table if the latest `SkillProfile` row is not enough to preserve all decisions.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Cross-module admin route handling | `admin` needs the HTTP surface, while `skill-profiles` owns the data and audit writes | Putting the routes in `skill-profiles` would blur module ownership and admin boundaries |
| Review decision history table | Requirement says every review decision must be stored | Relying only on the current `SkillProfile` row would lose earlier decisions |
| Cross-module approval side effects | Approval must activate the contributor and notify them, but those tables are owned by other modules | Direct writes from `skill-profiles` would violate table ownership |
