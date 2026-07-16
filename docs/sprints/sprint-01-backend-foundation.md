# Sprint 1 - Backend Foundation

## Goal

Create a backend foundation that runs locally through Docker and is ready for
feature development.

## Scope

Included:

- NestJS app scaffold.
- Docker Compose local stack.
- PostgreSQL with pgvector.
- Redis for future BullMQ jobs.
- Prisma setup.
- Health endpoint.
- Environment validation.
- Global error handling.
- Test and lint commands.

Excluded:

- Full authentication flow.
- GitHub OAuth.
- Real AI model calls.
- Production deployment.

## Source Requirements

PRD IDs:

- FR-001
- FR-011
- FR-027
- NFR-008

Backlog tasks:

- TASK-1-03
- TASK-1-04
- TASK-1-06
- TASK-1-07

This sprint only creates the foundation needed for those tasks. It does not
complete every product behavior listed by those IDs.

## Owners

| Area | Human Owner | AI Agent Scope |
| --- | --- | --- |
| Backend foundation | M4 | `docs/ai-agents/m4-backend-core.md` |
| Docker and CI | M6 | `docs/ai-agents/m6-devops-qa.md` |
| AI contract placeholder | M2 | `docs/ai-agents/m2-ai-engineer.md` |

## Backend Deliverables

- `src/main.ts`
- `src/app.module.ts`
- `src/shared/database`
- `src/shared/errors`
- `src/shared/auth` placeholder
- `src/shared/observability` placeholder
- `src/modules/identity` placeholder
- `src/modules/ai` placeholder
- `GET /health`

## API Changes

- Add `GET /health`.
- Response should be safe and simple:

```json
{
  "status": "ok"
}
```

## Database Changes

- Add Prisma.
- Add PostgreSQL connection.
- Enable pgvector extension in the first migration if supported by the chosen
  migration approach.
- Do not create all business tables yet unless implementing the corresponding
  task.

## Docker/Infra Changes

Required local services:

- api
- postgres using `pgvector/pgvector:pg16`
- redis

Required files:

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.example`

## Tests

Required:

- Health endpoint test.
- Environment validation test.
- Basic app boot test.

Optional:

- Database connectivity integration test.

## Demo Scenario

1. Clone repo.
2. Run `docker compose up --build` with `.env.example` defaults.
3. Copy `.env.example` to `.env` only if local overrides are needed.
4. Run migrations.
5. Open `GET /health`.
6. Run test command successfully.

## Risks

- Overbuilding folders before features exist.
- Skipping environment validation.
- Starting real AI work before contracts are defined.

## Definition Of Done

Use `docs/definition-of-done.md`.
