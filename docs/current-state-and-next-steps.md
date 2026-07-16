# Current State And Next Steps

This document explains what has already been created in the backend repo, what
is only prepared, what is not implemented yet, and what each team role should do
next.

## Current Backend Decision

The selected backend setup is:

```text
Frontend repo: Next.js
Backend repo: NestJS feature-first modular monolith
AI repo: separate FastAPI service called through `AiService` and integration clients
Database: PostgreSQL + pgvector
ORM: Prisma
Async jobs: BullMQ + Redis when needed
Local development: Docker Compose
```

The backend does not own provider/model logic. The separate FastAPI AI
repository owns model calls, prompt execution, Python AI tooling, embedding
generation, and AI-service tests. This backend owns authorization, business
state, database writes, audit snapshots, and final workflow decisions.

The backend Docker Compose file does not start the FastAPI AI repository yet.
For local development, run the AI service separately and point the backend at it
with `AI_SERVICE_URL`. Decide the shared compose/deployment shape with M6 after
the service repo contract is stable.

## What Is Done

### Documentation

Done:

- Root backend overview: `README.md`
- AI agent instructions: `AGENTS.md`
- Architecture docs: `docs/architecture.md`
- Developer architecture guide: `docs/developer-architecture-guide.md`
- Module development tracker: `docs/module-development-tracker.md`
- Coding conventions: `docs/backend-conventions.md`
- AI coding rules: `docs/ai-agent-rules.md`
- Team ownership: `docs/member-ownership.md`
- Definition of done: `docs/definition-of-done.md`
- Local development guide: `docs/local-development.md`
- Implementation roadmap: `docs/implementation-roadmap.md`
- Database plan: `docs/database-plan.md`
- API and AI contract rules: `docs/api-contracts.md`
- Postman endpoint guide: `docs/postman-api-guide.md`
- Sprint template: `docs/sprint-template.md`
- Sprint 1 foundation plan: `docs/sprints/sprint-01-backend-foundation.md`
- Architecture ADR: `bmad/_bmad-output/planning-artifacts/architecture/adr-002-standard-nestjs-module-architecture.md`

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
- Identity registration, login, refresh, logout, current-user, and admin role
  assignment endpoints, plus email verification and password reset.
- GitHub OAuth start/callback/account/disconnect endpoints.
- GitHub OAuth token encryption before database storage.
- GitHub repository listing, project import snapshot, README/language fetch,
  contribution activity normalization, and recent commit signal normalization.
- Contributor profile ensure/read endpoints.
- Selected-repository skill profile generation and status polling endpoints.
- GitHub Actions backend CI for architecture check, lint, unit tests, and build.
- Automated HTTP smoke test for owner registration, GitHub OAuth callback with
  mocked GitHub responses, repository listing, and GitHub project import.
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
  contributor-profiles/
```

Some business modules remain placeholders for now. This is intentional. The
folder structure is ready, but business logic should be added only when a real
sprint task needs it. Implemented modules use the same standard shape:
controllers, services, DTOs, and only the technical folders they actually need
such as integrations, security, repositories, mappers, or jobs. Clean
Architecture layer folders are not part of this backend decision.

### Docker And Local Services

Prepared:

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `.dockerignore`

The compose file is prepared to run:

```text
api
postgres with pgvector
redis
```

Docker Compose has been verified locally. The API is published on port `4000`,
PostgreSQL on host port `5433`, and Redis on host port `6379` by default.

### Database Foundation

Prepared:

- Prisma schema: `prisma/schema.prisma`
- Initial domain migration:
  `prisma/migrations/20260704203533_init/migration.sql`
- Business tables for users, subscriptions, projects, contribution requests,
  applications, AI recommendation snapshots, deliveries, delivery reviews,
  disputes, GitHub accounts, notifications, reports, reputation records, skill
  gap guidance, skill profiles, and usage tracking.
- Additional session/OAuth migration:
  `prisma/migrations/20260705012000_auth_sessions_and_github_oauth_state/migration.sql`

Verified:

- Docker migration execution, including the password-reset and skill-generation
  migrations.
- Prisma schema validation and generated client.

Not done yet:

- Seed data.
- Service code for the remaining business workflows.
- Any additional migration needed for pgvector extension or future embedding
  tables after the AI service contract is finalized.

### AI Foundation

Prepared:

- `AiService` facade and FastAPI integration client for skill-profile
  generation.
- Extension points for eligibility, skill-gap, and embedding service clients.
- Runtime configuration placeholders for an external AI service:
  `AI_SERVICE_URL`, `AI_SERVICE_TIMEOUT_MS`, and the shared internal
  `AI_SERVICE_AUTH_TOKEN` (required in production).

Not done yet:

- Shared request/response schema tests between this backend and the FastAPI AI
  repository.
- AI service authentication policy.
- Prompt versions inside the FastAPI AI repository.
- AI audit write flow in owning backend services.
- Embedding persistence contract and ownership.
- Eligibility validation workflow.

## What Is Not Done Yet

Not implemented yet:

- Background GitHub repository ingestion after OAuth connect.
- Admin skill review.
- Project publishing.
- Contribution task creation.
- Application workflow.
- AI eligibility validation.
- Delivery review.
- Reputation.
- Subscription and premium limits.
- Production deployment.

## Is The Worker Installed?

Yes, for selected-repository skill-profile generation.

Redis runs in Docker Compose, and the skill-profiles module owns a concrete
BullMQ queue and worker. The worker delegates generation processing to
`SkillProfileGenerationService`, retries operational failures, and persists
terminal states. Other asynchronous workflows are still future work.

Current state:

```text
Redis service: running in Docker Compose
BullMQ package: installed
Skill-profile queue: implemented
Skill-profile worker: implemented
Other jobs: not implemented yet
```

Add additional queues only when a real async workflow needs them.

## Can Everyone Start Working?

Yes, but each person should start from the sprint scope and stay inside their
module boundaries.

The immediate priority is to keep the foundation verified while building the
next sprint features. Every module change should follow
`docs/module-development-tracker.md`.

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

- Own the FastAPI AI repository and the backend-facing AI contracts in
  `src/modules/ai`.
- Extend `AiService` service contracts for:
  - skill profile generation
  - eligibility analysis
  - skill gap guidance
  - embeddings
- Define FastAPI endpoint paths, DTOs, schema versions, and error responses.
- Decide initial model provider inside the FastAPI AI repository.
- Create mock FastAPI integration clients for backend tests before using the real
  service.
- Define prompt version names and output schemas in the AI repository.
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

- Extend the implemented identity/session services only when a backlog task needs
  a new auth workflow.
- Own the application workflow:
  - application status transitions
  - eligibility state
  - manual review fallback
- Coordinate admin review and AI decision boundaries with M2.

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
- Verify API container starts.
- Verify Postgres with pgvector starts.
- Verify Redis starts.
- Run Prisma migration.
- Run health endpoint test.
- Keep CI commands aligned with local verification.
- Add queues only when a sprint needs another background workflow.
- Decide with M2/M4 how the separate FastAPI AI repository should run locally:
  independent process, shared Docker network, or compose override.

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
8. Confirm `AI_SERVICE_URL` points to a local FastAPI service or documented
   mock target before AI workflows are implemented.
9. Add CI command plan.
10. Continue identity, admin review, and application workflows from the backlog.

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
docker compose exec api npm run prisma:migrate
docker compose exec api npm test
docker compose exec api npm run lint
```

Health endpoint:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## Important Reminder

The current repo is ready for foundation work. It is not a finished backend.

The architecture is set, the standard feature-first module structure is in
place, Docker has a verified local path, and the team can continue Sprint 1.
Remaining business features should be implemented task by task from the backlog
and PRD.
