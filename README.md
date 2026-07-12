# Share-k Backend

This repository is the backend workspace for Share-k.

Final backend setup decision:

- Runtime: NestJS.
- Architecture: feature-first modular monolith.
- AI: external FastAPI AI service/repository called through backend
  ports/adapters.
- Database: PostgreSQL with pgvector.
- ORM and migrations: Prisma.
- Background jobs: BullMQ with Redis when asynchronous work is needed.
- Local development: Docker Compose.

The frontend lives in a separate repository. This backend owns Share-k business
state: users, GitHub connections, projects, contribution tasks, applications,
approved skills, delivery reviews, reputation, admin decisions, and audit data.

AI is not the final authority. The FastAPI AI service produces structured
recommendations; backend use cases validate them, apply deterministic rules,
and store final business decisions.

## Start Here

For a quick developer path before changing code, read:

1. `docs/README.md`
2. `docs/developer-architecture-guide.md`
3. `docs/module-development-tracker.md`
4. The README for the module you will change, such as
   `src/modules/projects/README.md`
5. `docs/definition-of-done.md`

For full onboarding, also read:

- `docs/team-onboarding.md`
- `docs/current-state-and-next-steps.md`
- `docs/architecture.md`
- `docs/folder-structure.md`
- `docs/backend-conventions.md`
- `docs/ai-agent-rules.md`

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

Do not pre-create architecture folders for decoration. Start each module with
the files needed for the current feature, then add layers when they protect real
business rules, external integrations, or testable boundaries.

For day-to-day development, use `docs/developer-architecture-guide.md`. It
explains what each folder and file type means, when to create each layer, and
how current modules such as identity, GitHub, and projects are wired.

## Current Foundation Status

The backend foundation is partially implemented and should stay verified as
feature work continues:

- NestJS app scaffold exists.
- PostgreSQL with pgvector and Redis are prepared in Docker Compose.
- Prisma schema and migrations exist.
- Health endpoint works.
- Environment validation exists.
- Global error handling exists.
- Auth, GitHub OAuth/repository listing, and GitHub project import are started.

Every module change must update `docs/module-development-tracker.md` with a
short change record.
