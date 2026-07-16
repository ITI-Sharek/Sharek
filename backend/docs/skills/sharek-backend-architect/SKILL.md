---
name: sharek-backend-architect
description: Share-k backend architecture workflow for standard NestJS feature-first modular monolith tasks. Use for modules, endpoints, controllers, services, DTOs, Prisma changes, FastAPI AI integration, jobs, tests, docs, tracker updates, handoff, or architecture review in the Share-k backend.
---

# Share-k Backend Architect

Use this skill to keep Share-k backend changes aligned with ADR-002, module
ownership, public service boundaries, documentation, and verification.

## Backend Root

Work from the directory containing `package.json`, `AGENTS.md`,
`src/modules`, and `docs/module-development-tracker.md`. In the normal
checkout this is `/opt/Sharek_Backend/Backend`.

## Required Reading

Before implementation:

1. `AGENTS.md`
2. `docs/architecture.md`
3. `docs/developer-architecture-guide.md`
4. `docs/module-development-tracker.md`
5. `docs/backend-conventions.md`
6. `docs/definition-of-done.md`
7. The target module README

Read API contracts, Prisma/database docs, active spec, backlog, and PRD when
relevant. Inspect current code and `git status`; do not work from memory alone.

## Architecture Choice

Share-k is a NestJS feature-first modular monolith using standard controllers,
services, DTOs, and Prisma. Do not introduce Clean Architecture layer folders,
use-case classes, reader ports, or one-implementation abstract repositories.

Small module:

```text
feature.module.ts
feature.controller.ts
feature.service.ts
feature.service.spec.ts
dto/
README.md
```

Larger modules may use `controllers/` and `services/`. Add `integrations/`,
`repositories/`, `jobs/`, `events/`, `security/`, `mappers/`,
`validators/`, or `utils/` only when real implementation needs them.

## Boundaries

- The module that owns final business state owns the workflow and writes.
- Controllers bind HTTP input/output and delegate.
- Services own authorization, workflow, validation, and final decisions.
- A module writes only its own tables.
- Cross-module calls use services exported by the provider NestJS module.
- Never import another module's repository, integration client, security class,
  job, controller, mapper, validator, or utility.
- Keep `shared/` technical.
- Export services as public APIs; keep technical internals private.
- Use events for completed facts when a synchronous response is unnecessary.

## Module Ownership

- users, roles, sessions, social identity -> `identity`
- GitHub OAuth/account/repository evidence -> `github`
- projects and publication -> `projects`
- contributor profile records/views -> `contributor-profiles`
- contribution task lifecycle -> `contribution-tasks`
- applications and eligibility state -> `applications`
- skill generations/candidates/approval -> `skill-profiles`
- delivery/reviews/ratings -> `delivery-reviews`
- reputation score/history -> `reputation`
- moderation/disputes/reports -> `admin`
- NestJS AI facade/FastAPI clients -> `ai`
- health checks -> `health`

## Implementation Flow

```text
controller -> DTO validation -> service -> Prisma
                                  -> exported module service
                                  -> integration client
```

AI-backed work:

```text
owning service -> deterministic checks -> AiService -> FastAPI client
  -> structured recommendation -> backend validation/final decision -> audit snapshot
```

AI output never directly mutates final business state.

## Workflow

1. Confirm requirement/task IDs and API contract.
2. Identify owning module and table ownership.
3. Review authorization and migration impact.
4. Implement the smallest complete service workflow.
5. Add thin controller/DTO changes when needed.
6. Add focused tests and relevant HTTP/E2E coverage.
7. Update module README and `docs/module-development-tracker.md`.
8. Run checks and review the final diff.

## Required Checks

```bash
npm run check:architecture
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

Run Prisma validation/generation for relevant persistence work. Report blocked or
pre-existing failures precisely.

## Handoff

Report changed files, owning modules, requirement IDs, API and database changes,
authorization review, tests/checks, documentation/tracker updates, migrations,
known risks, and follow-up work.
