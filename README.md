# Share-k Backend

NestJS backend for Share-k, organized as a feature-first modular monolith with
standard controllers, services, DTOs, and Prisma.

- Database: PostgreSQL with pgvector
- ORM/migrations: Prisma
- Async jobs: BullMQ and Redis when needed
- AI: separate FastAPI service called through `AiService`
- Local development: Docker Compose

NestJS owns authentication, authorization, business state, final decisions,
database writes, and audit snapshots. FastAPI returns structured AI
recommendations; the owning NestJS service validates and decides.

## Start Here

1. `docs/architecture.md`
2. `docs/developer-architecture-guide.md`
3. `docs/module-development-tracker.md`
4. The relevant `src/modules/<module>/README.md`
5. `docs/definition-of-done.md`

For endpoint testing, use [`docs/postman-api-guide.md`](docs/postman-api-guide.md)
or the runnable REST Client requests in [`sharek-api.http`](sharek-api.http).

Agents must also read `AGENTS.md`.

## Architecture Source

- Current ADR: `bmad/_bmad-output/planning-artifacts/architecture/adr-002-standard-nestjs-module-architecture.md`
- PRD: `bmad/_bmad-output/planning-artifacts/prds/prd-Grad_Project-2026-06-17/prd.md`
- Backlog: `bmad/_bmad-output/sharek-backlog.md`

```text
src/
  modules/
    <feature>/
      <feature>.module.ts
      controller or controllers/
      service or services/
      dto/
      optional technical folders only when needed
      README.md
  shared/
```

Run the standard gates before handoff:

```bash
npm run check:architecture
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

Every code task updates `docs/module-development-tracker.md`.
