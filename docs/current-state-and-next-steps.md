# Current State And Next Steps

This document explains what has already been created in the backend repo, what
is only prepared, what is not implemented yet, and what each team role should do
next.

## Current Backend Decision

The selected backend setup is:

```text
Frontend repo: Next.js
Backend repo: NestJS feature-first modular monolith
AI: inside NestJS through ports/adapters
Database: PostgreSQL + pgvector
ORM: Prisma
Async jobs: BullMQ + Redis when needed
Local development: Docker Compose
```

FastAPI is not part of the MVP backend setup right now. It can be introduced
later only if the AI workload needs Python-specific tooling or independent
scaling.

## What Is Done

### Documentation

Done:

- Root backend overview: `README.md`
- AI agent instructions: `AGENTS.md`
- Architecture docs: `docs/architecture.md`
- Coding conventions: `docs/backend-conventions.md`
- AI coding rules: `docs/ai-agent-rules.md`
- Team ownership: `docs/member-ownership.md`
- Definition of done: `docs/definition-of-done.md`
- Local development guide: `docs/local-development.md`
- Implementation roadmap: `docs/implementation-roadmap.md`
- Database plan: `docs/database-plan.md`
- API and AI contract rules: `docs/api-contracts.md`
- Sprint template: `docs/sprint-template.md`
- Sprint 1 foundation plan: `docs/sprints/sprint-01-backend-foundation.md`
- Architecture ADR: `bmad/_bmad-output/planning-artifacts/architecture/adr-001-backend-architecture.md`

### NestJS Skeleton

Done:

- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `nest-cli.json`
- `eslint.config.mjs`
- `src/main.ts`
- `src/app.module.ts`
- Environment validation in `src/shared/config/env.validation.ts`
- Global error filter in `src/shared/errors/http-exception.filter.ts`
- Health endpoint in `src/modules/health`
- Basic health controller test.

### Feature-First Module Structure

Done:

```text
src/modules/
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
  health/
```

Most business modules are placeholders for now. This is intentional. The folder
structure is ready, but business logic should be added only when a real sprint
task needs it.

Each business module now has a deeper ready skeleton for domain, application,
infrastructure, and presentation code. These folders are tracked with
`.gitkeep` files until real implementation files replace them.

### Docker And Local Services

Prepared:

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `.dockerignore`

The compose file is prepared to run:

```text
backend
postgres with pgvector
redis
```

This still needs to be run and verified on a machine with Docker and npm
available.

### Database Foundation

Prepared:

- Prisma schema: `prisma/schema.prisma`
- Initial migration: `prisma/migrations/000001_init/migration.sql`
- Initial migration enables pgvector.

Not done yet:

- Business tables such as users, projects, applications, skills, deliveries, and
  reputation.

### AI Foundation

Prepared:

- `SkillProfileGenerator` port.
- `EligibilityAnalyzer` port.
- `SkillGapAdvisor` port.
- `EmbeddingGenerator` port.

Not done yet:

- OpenAI/Gemini/Claude provider adapter.
- Prompt versions.
- AI audit table.
- Embedding persistence.
- Skill profiling workflow.
- Eligibility validation workflow.

## What Is Not Done Yet

Not implemented yet:

- Authentication.
- User registration and login.
- GitHub OAuth.
- GitHub repository ingestion.
- Skill profile generation.
- Admin skill review.
- Project publishing.
- Contribution task creation.
- Application workflow.
- AI eligibility validation.
- Delivery review.
- Reputation.
- Subscription and premium limits.
- BullMQ worker.
- CI pipeline.
- Production deployment.

## Is The Worker Installed?

No.

Redis is prepared in Docker Compose, but BullMQ worker code is not implemented
yet.

Current state:

```text
Redis service: prepared
BullMQ package: not added yet
Worker module: not created yet
Jobs: not implemented yet
```

Add BullMQ when a real async need appears, such as GitHub ingestion, embedding
generation, skill profiling, or long AI validation.

## Can Everyone Start Working?

Yes, but each person should start from the sprint scope and stay inside their
module boundaries.

The immediate priority is Sprint 1 foundation verification before deep feature
work.

## What Each Member Should Do Next

### M1 - UI/UX And Testing

Next work:

- Read the PRD and backlog.
- Define testable user flows for Sprint 1 and Sprint 2.
- Prepare acceptance scenarios for auth, GitHub connection, project publishing,
  and AI skill review.
- Coordinate with backend owners on API response expectations.

M1 should not write backend business logic unless explicitly assigned.

### M2 - AI Engineer

Next work:

- Own `src/modules/ai`.
- Convert AI ports into real contracts for:
  - skill profile generation
  - eligibility analysis
  - skill gap guidance
  - embeddings
- Decide initial model provider.
- Create mock AI adapters for tests before using real provider calls.
- Define prompt version names and output schemas.
- Plan AI audit fields with M4.

Do not let AI directly approve skills or applications.

### M3 - Frontend And Integration

Next work:

- Read `docs/api-contracts.md`.
- Coordinate with backend on DTO shape.
- Prepare frontend API expectations for:
  - health check
  - auth
  - GitHub connection
  - project publish flow
  - skill review flow

M3 should not call AI providers directly from frontend.

### M4 - Backend Core

Next work:

- Verify NestJS app boots.
- Verify Docker local setup with M6.
- Implement identity foundation:
  - users table
  - roles
  - auth module
  - JWT/session foundation
- Own application workflow later:
  - application status transitions
  - eligibility state
  - manual review fallback

M4 should protect business rules and keep controllers thin.

### M5 - Backend Integration And Cloud

Next work:

- Prepare GitHub module foundation.
- Define GitHub OAuth metadata storage.
- Define normalized repository data shape.
- Prepare project publishing module.
- Prepare contribution tasks module.
- Coordinate with M2 on GitHub evidence used for AI skill profiling.

M5 should not expose GitHub tokens through project/task APIs.

### M6 - DevOps And QA Automation

Next work:

- Run Docker Compose locally.
- Verify backend container starts.
- Verify Postgres with pgvector starts.
- Verify Redis starts.
- Run Prisma migration.
- Run health endpoint test.
- Prepare CI commands for lint and tests.
- Add BullMQ only when a sprint needs background jobs.

M6 should make local and CI commands repeatable.

## Sprint 1 Practical Checklist

Do these before feature work gets heavy:

1. Run `docker compose up --build` with `.env.example` defaults.
2. Copy `.env.example` to `.env` if local overrides are needed.
3. Verify `GET /health`.
4. Run `npm install` locally or inside Docker.
5. Run `npm test`.
6. Run Prisma migration.
7. Confirm pgvector extension is enabled.
8. Add CI command plan.
9. Start identity database schema.
10. Start auth foundation.

## Commands To Verify Locally

```bash
cd Backend
docker compose up --build
```

Optional local overrides:

```bash
cp .env.example .env
```

Then in another terminal:

```bash
docker compose exec backend npm run prisma:migrate
docker compose exec backend npm test
docker compose exec backend npm run lint
```

Health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## Important Reminder

The current repo is ready for foundation work. It is not a finished backend.

The architecture is set, the skeleton is created, Docker is prepared, and the
team can start Sprint 1. Business features should be implemented task by task
from the backlog and PRD.
