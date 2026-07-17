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

1. `docs/README.md`
2. `docs/product-spec.md`
3. `docs/architecture.md`
4. `docs/api-contracts.md`
5. `docs/delivery-plan.md`
6. `docs/operations/engineering-guide.md`
7. The relevant `src/modules/<module>/README.md`

For endpoint testing, use [`docs/operations/postman-api-guide.md`](../docs/operations/postman-api-guide.md)
or the runnable REST Client requests in [`sharek-api.http`](sharek-api.http).

Agents must also read `AGENTS.md`.

## Architecture Source

- Canonical architecture and domain model: `docs/architecture.md`
- Product requirements: `docs/product-spec.md`
- Vertical slices: `docs/delivery-plan.md`
- Current repository gaps: `docs/audits/codebase-gap-report.md`

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

Update `docs/audits/codebase-gap-report.md` only when verified implementation
state changes. Planned work belongs in `docs/delivery-plan.md`.
