# ShareK Local Development and Onboarding

**Status:** Supporting operational guidance
**Architecture:** `../architecture.md`
**API exercises:** `postman-api-guide.md`

Docker Compose is the default local development path.

## Expected Services

The backend development stack should include:

```text
api        NestJS app
postgres   PostgreSQL with pgvector
redis      Redis for BullMQ jobs
```

The bounded FastAPI AI service lives in a separate repository. Until Docker wiring is
agreed, run it separately and point this backend at it with `AI_SERVICE_URL`.
When the backend runs inside Docker and FastAPI runs on the host machine, use
`http://host.docker.internal:8010`.

Use the pgvector image for PostgreSQL:

```text
pgvector/pgvector:pg16
```

## Required Repo Files

When the NestJS project is scaffolded, the backend repo should include:

```text
Dockerfile
docker-compose.yml
.dockerignore
.env.example
package.json
prisma/schema.prisma
src/main.ts
src/app.module.ts
```

## Environment Variables

At minimum, `.env.example` should document:

```text
NODE_ENV=development
PORT=4000
PRISMA_STUDIO_PORT=5555
DATABASE_URL=postgresql://sharek:sharek@postgres:5432/sharek?schema=public
POSTGRES_USER=sharek
POSTGRES_PASSWORD=sharek
POSTGRES_DB=sharek
POSTGRES_PORT=5432
REDIS_URL=redis://redis:6379
REDIS_PORT=6379
SKILL_PROFILE_QUEUE_ENABLED=true
SKILL_PROFILE_QUEUE_CONCURRENCY=2
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_OAUTH_CALLBACK_URL=http://localhost:4000/auth/github/callback/repository
GITHUB_AUTH_CALLBACK_URL=http://localhost:4000/auth/github/callback
GITHUB_TOKEN_ENCRYPTION_KEY=change-this-github-token-encryption-key-32-chars-min
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:4000/auth/google/callback
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
AI_SERVICE_URL=http://host.docker.internal:8010
AI_SERVICE_TIMEOUT_MS=60000
AI_SERVICE_AUTH_TOKEN=replace-with-the-same-long-random-token-used-by-fastapi
AI_LOW_CONFIDENCE_THRESHOLD=0.70
```

Secrets in `.env.example` must be placeholders only.

Skill profiling requires Redis. BullMQ stores jobs durably, retries transient
GitHub/AI failures three times, and recovers incomplete generation records when
the backend restarts. Disable `SKILL_PROFILE_QUEUE_ENABLED` only in isolated
tests that provide a fake queue.

The FastAPI service must use the same `AI_SERVICE_AUTH_TOKEN`. Its `/health`
route remains unauthenticated, while skill generation routes reject missing or
incorrect bearer tokens. For host-run FastAPI on port `8010`, Dockerized NestJS
uses `http://host.docker.internal:8010`.

For email verification, Gmail can be used through SMTP by setting
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`,
`SMTP_USER` to the Gmail address, `SMTP_PASS` to a Google App Password, and
`EMAIL_FROM` to the sender address. Do not use or commit a normal Gmail account
password.

## Standard Commands

Expected commands after the NestJS app is scaffolded:

```bash
docker compose up --build
docker compose down
docker compose logs -f api
docker compose exec api npm run lint
docker compose exec api npm run test
docker compose exec api npm run prisma:migrate
docker compose exec api npx prisma db seed
docker compose exec api npm run prisma:studio
```

Docker Compose uses `tsconfig.docker.json` and keeps the API container's watch
output under `.docker-build/dist` in the `api_build` volume. This prevents the
root-owned watch output inside the container from overwriting the host user's
`dist/` directory, so host commands such as `npm run build` do not fail with
`EACCES: permission denied, unlink`.

## First Run Flow

1. Start services with Docker Compose using `.env.example` defaults.
2. Copy `.env.example` to `.env` when you need personal overrides.
3. Fill local development values in `.env`.
4. Run Prisma migrations.
5. Run seed data with `docker compose exec api npx prisma db seed` if available.
6. Open the health endpoint.
7. Run tests.

## Health Checks

The backend should expose:

```text
GET /health
```

The health endpoint should verify process health and optionally database
connectivity. It should not expose secrets or internal configuration.

## Troubleshooting

If migrations fail, check:

- `DATABASE_URL`
- Postgres container health.
- Prisma schema validity.
- Whether pgvector extension is enabled.

If an older checkout already has a root-owned host `dist/`, stop the API,
restore that directory to the host user's ownership once, and recreate the API
container. New Docker watch output remains isolated in `api_build`.

If AI service calls fail locally, check:

- The separate FastAPI AI repository is running.
- `AI_SERVICE_URL` points to the right local URL from the process/container.
- `AI_SERVICE_AUTH_TOKEN` is non-empty and exactly matches the FastAPI service.
- Redis is reachable and the `skill-profile-generation` worker starts without
  connection errors.
- Timeout settings.
- Response schema validation.
- Fallback to mock FastAPI client adapters for local tests.

## New teammate path

Before running code, read:

1. `../README.md`
2. `../product-spec.md`
3. `../architecture.md`
4. `../api-contracts.md`
5. `../delivery-plan.md`

Then read `engineering-guide.md`, the relevant module README, and
`../audits/codebase-gap-report.md`. Consult `../decision-log.md` when a decision
is disputed and `../test-strategy.md` when defining completion evidence.

## First contribution checklist

1. Confirm the issue/vertical slice and owning module.
2. Create local environment files from tracked examples; never copy another
   developer's secrets.
3. Start PostgreSQL, Redis, NestJS, and the bounded FastAPI service when the
   selected feature requires them.
4. Run migrations and seed only against a local development database.
5. Exercise health, authentication, and the relevant API collection.
6. Run the checks in `engineering-guide.md` before handoff.
7. Update current implementation evidence only after the behavior exists and is
   verified.

## Shared environment rules

- Each developer uses their own OAuth credentials where possible.
- `AI_SERVICE_AUTH_TOKEN` must match between NestJS and FastAPI and must not be
  committed.
- Do not use production data in local AI or evidence tests.
- Use public/synthetic repositories and redacted fixtures.
- Destructive database reset commands are local-development-only.
