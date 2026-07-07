# Local Development

Docker Compose is the default local development path.

## Expected Services

The backend development stack should include:

```text
api        NestJS app
postgres   PostgreSQL with pgvector
redis      Redis for BullMQ jobs
```

The FastAPI AI service lives in a separate repository. Until Docker wiring is
agreed, run it separately and point this backend at it with `AI_SERVICE_URL`.
When the backend runs inside Docker and FastAPI runs on the host machine, use
`http://host.docker.internal:8000`.

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
PORT=3000
PRISMA_STUDIO_PORT=5555
DATABASE_URL=postgresql://sharek:sharek@postgres:5432/sharek?schema=public
POSTGRES_USER=sharek
POSTGRES_PASSWORD=sharek
POSTGRES_DB=sharek
POSTGRES_PORT=5432
REDIS_URL=redis://redis:6379
REDIS_PORT=6379
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_OAUTH_CALLBACK_URL=http://localhost:3000/github/oauth/callback
GITHUB_TOKEN_ENCRYPTION_KEY=change-this-github-token-encryption-key-32-chars-min
AI_SERVICE_URL=http://host.docker.internal:8000
AI_SERVICE_TIMEOUT_MS=5000
AI_SERVICE_AUTH_TOKEN=
AI_LOW_CONFIDENCE_THRESHOLD=0.70
```

Secrets in `.env.example` must be placeholders only.

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

If AI service calls fail locally, check:

- The separate FastAPI AI repository is running.
- `AI_SERVICE_URL` points to the right local URL from the process/container.
- `AI_SERVICE_AUTH_TOKEN` matches the AI service if auth is enabled.
- Timeout settings.
- Response schema validation.
- Fallback to mock FastAPI client adapters for local tests.
