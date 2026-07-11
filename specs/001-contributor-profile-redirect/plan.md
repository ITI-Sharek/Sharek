# Implementation Plan: Contributor Profile Redirect

**Branch**: `001-contributor-profile-redirect` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-contributor-profile-redirect/spec.md`

## Summary

Add backend support for the contributor post-login profile redirect flow. The
backend will return a public auth user DTO with a stable contributor username,
allow active or pending contributors to idempotently ensure a contributor
profile, and expose authenticated profile lookup by canonical username while
preserving private data boundaries and viewer-specific response rules.

The implementation will extend `identity` for username ownership and auth user
DTO shape, add a new `contributor-profiles` business module for profile ensure
and lookup, and use public reader/application services from identity, GitHub,
skill-profiles, and reputation instead of direct cross-module infrastructure
access.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js with NestJS 11

**Primary Dependencies**: NestJS, Prisma, PostgreSQL with pgvector, class-validator, Jest; BullMQ/Redis not required for this synchronous feature

**Storage**: PostgreSQL via Prisma. Add `User.username` owned by `identity` and a contributor-profile table owned by `contributor-profiles`.

**Testing**: Jest unit/use-case tests, Prisma-backed repository/service tests for username/profile uniqueness and idempotency, and HTTP/E2E coverage for login -> ensure -> lookup redirect flow

**Target Platform**: Docker Compose local backend stack; deployable NestJS API service

**Project Type**: Backend web API in a feature-first modular monolith

**Performance Goals**: Profile ensure and lookup remain single-resource actions and target the PRD baseline of P95 API response under 3 seconds for non-streaming core interactions

**Constraints**: Controllers stay thin; identity owns `users`; contributor-profiles owns contributor profile records; Prisma owns schema/migrations; no AI service call is required; no secrets or token material in responses/logs

**Scale/Scope**: Single authenticated contributor profile redirect flow covering `POST /auth/login`, `GET /auth/me`, `POST /contributors/profiles/me/ensure`, and `GET /contributors/profiles/:username`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Module Ownership**: PASS. `identity` writes `users.username`; `contributor-profiles` writes contributor profile rows. GitHub, skill-profiles, and reputation data are read through public reader services.
- **HTTP Flow**: PASS. New profile routes use controller -> request/route validation -> use case -> domain/policy -> repository/reader services -> response DTO.
- **Domain Boundary**: PASS. Username generation, account-status eligibility, viewer relationship, skill visibility, and idempotency are use-case/domain policies, not controller logic.
- **AI Boundary**: PASS. This feature does not call the FastAPI AI service. It only reads existing skill-profile records and preserves the approved-vs-generated visibility rule.
- **Persistence**: PASS. Prisma schema and migration are required for `User.username` and the contributor profile table, with unique constraints for username and one profile per contributor.
- **API Contract**: PASS. Contracts are generated in `contracts/contributor-profile-redirect.openapi.yaml`, with stable auth and contributor profile DTOs.
- **Testing**: PASS. Required tests cover login DTO shape, username generation/collision limit, ensure idempotency/concurrency, role/status rejection, skill visibility, hidden inactive profiles, and 400/401/403/404/409/422 errors.
- **Operations/Security**: PASS. No new environment variables are required; no response may expose password hashes, token hashes, OAuth credentials, auth sessions, or internal security metadata.

## Project Structure

### Documentation (this feature)

```text
specs/001-contributor-profile-redirect/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── contributor-profile-redirect.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── modules/
│   ├── identity/
│   │   ├── application/
│   │   │   ├── dto/
│   │   │   ├── mappers/
│   │   │   └── use-cases/
│   │   ├── domain/
│   │   │   └── username/
│   │   ├── infrastructure/
│   │   └── presentation/
│   ├── contributor-profiles/
│   │   ├── contributor-profiles.module.ts
│   │   ├── README.md
│   │   ├── application/
│   │   │   ├── dto/
│   │   │   ├── ports/
│   │   │   └── use-cases/
│   │   ├── domain/
│   │   │   └── policies/
│   │   ├── infrastructure/
│   │   │   └── persistence/
│   │   └── presentation/
│   │       └── http/
│   │           ├── controllers/
│   │           └── responses/
│   ├── github/
│   ├── reputation/
│   └── skill-profiles/
├── shared/
│   ├── auth/
│   ├── database/
│   └── errors/
└── app.module.ts

prisma/
├── schema.prisma
└── migrations/

test/ or src/**/*.spec.ts
```

**Structure Decision**: Add `contributor-profiles` because the public profile is a distinct contributor-facing capability with its own table, route surface, viewer policies, and aggregation rules. Extend `identity` because username persistence belongs to the `users` table owner. Add public reader/application services in GitHub, skill-profiles, and reputation only where needed to avoid importing another module's infrastructure.

## Complexity Tracking

No constitution violations are planned.

## Phase 0: Research

See [research.md](./research.md). All planning unknowns are resolved.

## Phase 1: Design

- Data model: [data-model.md](./data-model.md)
- API contract: [contracts/contributor-profile-redirect.openapi.yaml](./contracts/contributor-profile-redirect.openapi.yaml)
- Validation quickstart: [quickstart.md](./quickstart.md)

## Post-Design Constitution Check

- **Module Ownership**: PASS. The design keeps username writes inside identity and profile writes inside contributor-profiles.
- **HTTP Flow**: PASS. Contracts map to one use case per controller route.
- **Domain Boundary**: PASS. Domain policies are identified for username normalization, account-status eligibility, viewer relationship, skill visibility, and idempotent profile creation.
- **AI Boundary**: PASS. No AI calls or AI decisions are introduced.
- **Persistence**: PASS. Schema changes require a Prisma migration and unique constraints.
- **API Contract**: PASS. OpenAPI contract documents request auth, route params, response DTOs, and error outcomes.
- **Testing**: PASS. Quickstart and future tasks will validate happy paths, error paths, and security exclusions.
- **Operations/Security**: PASS. No new environment variables; Docker/local flow unchanged.
