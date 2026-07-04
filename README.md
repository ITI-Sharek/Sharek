# Share-k Backend

This repository is the backend workspace for Share-k.

Final backend setup decision:

- Runtime: NestJS.
- Architecture: feature-first modular monolith.
- AI: inside NestJS through ports/adapters, using ready model APIs.
- Database: PostgreSQL with pgvector.
- ORM and migrations: Prisma.
- Background jobs: BullMQ with Redis when asynchronous work is needed.
- Local development: Docker Compose.

The frontend lives in a separate repository. This backend owns Share-k business
state: users, GitHub connections, projects, contribution tasks, applications,
approved skills, delivery reviews, reputation, admin decisions, and audit data.

AI is not the final authority. AI adapters produce structured recommendations;
backend use cases validate them, apply deterministic rules, and store final
business decisions.

## Start Here

Read these files in order before implementing backend code:

1. `docs/README.md`
2. `docs/current-state-and-next-steps.md`
3. `docs/folder-structure.md`
4. `docs/architecture.md`
5. `docs/backend-conventions.md`
6. `docs/ai-agent-rules.md`
7. `docs/definition-of-done.md`

AI coding agents should also read `AGENTS.md` at the repo root.

## Authoritative Planning Sources

- Product PRD: `bmad/_bmad-output/planning-artifacts/prds/prd-Grad_Project-2026-06-17/prd.md`
- Product backlog: `bmad/_bmad-output/sharek-backlog.md`
- Backend architecture ADR: `bmad/_bmad-output/planning-artifacts/architecture/adr-001-backend-architecture.md`
- Full architecture guide: `sharek-feature-first-modular-monolith.md`

## Target Source Layout

```text
src/
  modules/
    identity/
    github/
    skill-profiles/
    projects/
    contribution-tasks/
    applications/
    delivery-reviews/
    reputation/
    admin/
    ai/
  shared/
    database/
    auth/
    errors/
    events/
    observability/
  app.module.ts
  main.ts
```

Do not create all folders blindly. Add layers when they protect real business
rules, external integrations, or testable boundaries.

## First Implementation Target

Sprint 1 should produce a runnable backend foundation:

- NestJS app starts in Docker.
- PostgreSQL with pgvector starts in Docker.
- Redis starts in Docker.
- Prisma is configured.
- Health endpoint works.
- Environment validation exists.
- Global error handling exists.
- Test runner and linting are wired.
