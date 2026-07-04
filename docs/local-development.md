# Local Development

Docker Compose is the default local development path.

## Expected Services

The backend development stack should include:

```text
backend    NestJS app
postgres   PostgreSQL with pgvector
redis      Redis for BullMQ jobs
```

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
DATABASE_URL=postgresql://sharek:sharek@postgres:5432/sharek
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OPENAI_API_KEY=
AI_PROVIDER=openai
AI_LOW_CONFIDENCE_THRESHOLD=0.70
```

Secrets in `.env.example` must be placeholders only.

## Standard Commands

Expected commands after the NestJS app is scaffolded:

```bash
docker compose up --build
docker compose down
docker compose logs -f backend
docker compose exec backend npm run lint
docker compose exec backend npm run test
docker compose exec backend npm run prisma:migrate
docker compose exec backend npm run prisma:studio
```

## First Run Flow

1. Start services with Docker Compose using `.env.example` defaults.
2. Copy `.env.example` to `.env` when you need personal overrides.
3. Fill local development values in `.env`.
4. Run Prisma migrations.
5. Run seed data if available.
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

If AI calls fail locally, check:

- Provider API key.
- Provider timeout settings.
- Adapter output validation.
- Fallback to mock adapter for local tests.
