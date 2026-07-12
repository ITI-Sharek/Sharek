---
name: sharek-backend-architect
description: Share-k backend architecture workflow for NestJS feature-first modular monolith tasks. Use when Codex works in the Share-k backend repo on modules, APIs/endpoints, controllers, DTOs, use cases, domain rules, Prisma/database changes, FastAPI AI integration, tests, docs, tracker updates, PR handoff, or architecture review. Triggers include requests like "build an endpoint", "add a module feature", "review backend architecture", "update module README", "check module boundaries", "make the agent follow the backend rules", or any Share-k backend implementation task.
---

# Share-k Backend Architect

Use this skill to keep Share-k backend work aligned with the repo's modular
monolith architecture, module boundaries, documentation workflow, and automated
checks.

This skill does not replace the repo docs. Treat the repo docs and scripts as
the source of truth.

## Find The Backend Root

Work from the backend root: the directory containing `package.json`,
`AGENTS.md`, `src/modules`, and `docs/module-development-tracker.md`.

In this checkout it is usually:

```text
/opt/Sharek_Backend/Backend
```

If the current directory is `/opt/Sharek_Backend`, use `Backend/` for repo
commands.

## Required Reading

Before editing implementation code, read:

1. `AGENTS.md`
2. `docs/developer-architecture-guide.md`
3. `docs/module-development-tracker.md`
4. `docs/backend-conventions.md`
5. `docs/definition-of-done.md`
6. The target module README under `src/modules/<module>/README.md`

Also read when relevant:

- `docs/api-contracts.md` and `sharek-api.http` for frontend-facing API work.
- `docs/database-plan.md` and `prisma/schema.prisma` for persistence changes.
- `docs/architecture.md` for architecture review or boundary questions.
- The relevant sprint/backlog/PRD files when the task mentions requirements.

Do not start coding from memory alone. Inspect existing files first.

## Core Rule

Cross-module dependency is allowed only through explicit boundaries:

- public exported application service
- reader port/interface
- event

Do not:

- import another module's private `infrastructure/`
- write another module's owned tables directly
- put module-specific business logic in `shared/`
- put business logic in controllers
- put NestJS, Prisma, HTTP clients, config, or model SDKs in domain code
- create empty architecture folders for decoration

## Decide The Owning Module

Choose the module that owns the final business state:

- users, roles, sessions -> `identity`
- GitHub OAuth/account/repository evidence -> `github`
- project drafts/publication -> `projects`
- contribution task lifecycle -> `contribution-tasks`
- contributor application status -> `applications`
- skill candidates/approved skills -> `skill-profiles`
- delivery review/ratings -> `delivery-reviews`
- reputation score/history -> `reputation`
- admin queues/moderation -> `admin`
- FastAPI AI contracts/adapters -> `ai`
- health checks -> `health`

If multiple modules are involved, the owning module contains the main use case.
Other modules expose data or reactions through public services, reader ports, or
events.

## Create Folders Only When Needed

For a requested API/endpoint:

- Add/use `presentation/http/controllers` for the controller.
- Add/use `presentation/http/requests` when request validation is needed.
- Add/use `presentation/http/responses` when a stable response shape is needed.
- Add/use `application/use-cases` when there is workflow, authorization,
  multiple reads/writes, or cross-module dependency.
- Add/use `domain/entities` or `domain/policies` when there are real business
  invariants, status transitions, limits, eligibility rules, approval rules, or
  reputation rules.
- Add/use `infrastructure/persistence`, `infrastructure/integrations`,
  `infrastructure/jobs`, or `infrastructure/security` for Prisma repositories,
  external clients, queue workers, token/encryption helpers, or provider
  adapters.

Keep simple work simple. Do not add `domain`, `application`, `infrastructure`,
or `presentation` just because the architecture supports them.

## Implementation Flow

For normal HTTP work:

```text
controller -> request DTO -> use case -> domain/policy -> repository/port/public service -> response DTO
```

For AI-backed work:

```text
use case -> deterministic checks -> AI port -> FastAPI adapter -> validated recommendation -> backend decision -> audit snapshot
```

For reactions after facts happen:

```text
module A emits event -> module B reacts -> module B writes only its own tables
```

## Documentation And Tracker

After code changes, update the docs that changed meaning:

- Module README for new workflows, endpoints, folders, public services, or
  boundaries.
- `docs/api-contracts.md` and `sharek-api.http` for frontend-facing API changes.
- `docs/database-plan.md` for schema/migration ownership changes.
- `src/modules/ai/README.md` and API contracts for AI contract changes.
- `docs/module-development-tracker.md` with a short module change record.

If docs do not need updates, say why in the handoff.

## Required Checks

Run:

```bash
npm run check:architecture
```

Also run:

- `npm run lint` when TypeScript code changed.
- `npm test -- --runInBand` or focused tests when behavior changed.
- `git diff --check` or `git diff --check --cached` before handoff.

If a command cannot run, report why.

## Handoff

Finish with:

- files changed
- owning module
- architecture/boundary notes
- API changes
- database changes
- tests/checks run
- docs/tracker updates
- known risks and next improvements
