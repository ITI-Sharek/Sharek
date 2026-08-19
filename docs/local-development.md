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
POSTGRES_PORT=5433
REDIS_URL=redis://redis:6379
REDIS_PORT=6379
# Enable only when testing the coordinated client /realtime cutover.
REALTIME_NOTIFICATIONS_ENABLED=false
NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED=true
NOTIFICATION_EVENT_RECOVERY_INTERVAL_MS=60000
NOTIFICATION_EVENT_RECOVERY_BATCH_SIZE=100
NOTIFICATION_EVENT_MAX_PUBLISH_ATTEMPTS=5
NOTIFICATION_RETENTION_QUEUE_ENABLED=true
NOTIFICATION_RETENTION_INTERVAL_MS=60000
NOTIFICATION_RETENTION_BATCH_SIZE=100
SKILL_PROFILE_QUEUE_ENABLED=true
SKILL_PROFILE_QUEUE_CONCURRENCY=2
APPLICATION_REVIEW_QUEUE_ENABLED=true
APPLICATION_REVIEW_SWEEP_INTERVAL_MS=60000
APPLICATION_REVIEW_SWEEP_BATCH_SIZE=100
DELIVERY_REPUTATION_QUEUE_ENABLED=true
DELIVERY_REPUTATION_SWEEP_INTERVAL_MS=60000
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_API_URL=https://api.github.com
GITHUB_API_OVERALL_TIMEOUT_MS=8000
GITHUB_API_REQUEST_TIMEOUT_MS=8000
GITHUB_OAUTH_CALLBACK_URL=http://localhost:4000/auth/github/callback/repository
GITHUB_AUTH_CALLBACK_URL=http://localhost:4000/auth/github/callback
GITHUB_TOKEN_ENCRYPTION_KEY=change-this-github-token-encryption-key-32-chars-min
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY_BASE64=
GITHUB_APP_WEBHOOK_SECRET=
GITHUB_APP_WEBHOOK_PROXY_URL=
GITHUB_APP_SLUG=
GITHUB_APP_INSTALLATION_URL=https://github.com/apps/your-app-slug/installations/new
GITHUB_APP_CALLBACK_URL=http://localhost:4000/auth/github/app/callback
GITHUB_APP_FRONTEND_RETURN_URL=http://localhost:3001/profile/github
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

### GitHub App repository evidence

The repository-evidence GitHub App is separate from the GitHub OAuth App used
for social identity. Configure it for selected repositories, request user
authorization during installation, grant only Metadata read and Contents read,
and leave the setup URL unset. Its callback URL is
`GITHUB_APP_CALLBACK_URL`; the browser is redirected afterward only to
`GITHUB_APP_FRONTEND_RETURN_URL` with an opaque Share-k attempt identifier.

Download the App private key outside the repository, restrict its filesystem
permissions, and encode the complete PEM (including header/footer and line
breaks) as Base64 for `GITHUB_APP_PRIVATE_KEY_BASE64`. Never paste the decoded
key into source, logs, HTTP files, or committed environment examples.

For local webhooks, put the private Smee channel in
`GITHUB_APP_WEBHOOK_PROXY_URL` and run
`npx smee-client --url <channel-url> --target http://localhost:4000/webhooks/github/app`,
and configure the GitHub App webhook URL with that channel. Use the same strong
secret in GitHub and `GITHUB_APP_WEBHOOK_SECRET`. Smee is a development relay;
production must use the public HTTPS backend webhook endpoint directly.

Webhook delivery IDs are idempotency keys. A processed duplicate is accepted
without applying state twice; an operationally failed delivery may be redelivered
with the same ID and increments its retry count. Expiring member authorization
is refreshed and rotated transactionally during live checks. Refresh expiry or
failure moves only that user link to `reauthorization_required`; provider user
revocation moves matching member links to `revoked`. The user must complete a
new state-bound authorization flow before later private reads.

Local disconnect immediately clears the selected link's member credentials and
blocks reads without uninstalling the app or affecting another verified member
of the same organization installation. GitHub's installation settings page is
returned separately for an authorized organization owner to manage/uninstall.

When `NODE_ENV=development`, the API accepts requests from any browser origin
and reflects that origin in `Access-Control-Allow-Origin`. This supports local,
mobile, emulator, and LAN clients while keeping credentialed requests valid;
using the literal `*` header with credentials is not browser-compatible. In
`test` and `production`, `CORS_ORIGINS` remains the comma-separated allowlist.

Skill profiling requires Redis. BullMQ stores jobs durably, retries transient
GitHub/AI failures three times, and recovers incomplete generation records when
the backend restarts. Disable `SKILL_PROFILE_QUEUE_ENABLED` only in isolated
tests that provide a fake queue.

The Application review-window worker also requires Redis. It registers a
repeatable sweep, retries failures three times, and enqueues a startup catch-up.
PostgreSQL stores all deadlines and delivery markers, so temporary Redis or API
downtime does not lose a reminder or expiry. Disable
`APPLICATION_REVIEW_QUEUE_ENABLED` for isolated tests. The interval is bounded
to 10 seconds through 24 hours and the per-phase batch size to 1 through 1000.
Docker Compose forwards all three scheduler controls to the API container.

The Delivery reputation worker also requires Redis. Each run first consumes
durable approval events and acknowledges them only after the contributor's
projection is stored, then reconciles assigned contributors so rejection and
assignment changes are reflected even without a new approval event. Disable
`DELIVERY_REPUTATION_QUEUE_ENABLED` for isolated tests; when it is unset the
worker defaults off in `test` and on in development and production. The sweep
interval is bounded to 10 seconds through 24 hours. Docker Compose forwards
both controls to the API container.

For the supported host-run workflow, keep PostgreSQL and Redis running through
Compose and run `npm run start:dev`. `DATABASE_URL` and `REDIS_URL` must come
from the process environment or `.env`; host-run helpers do not invent fallback
service URLs. The local command reads `POSTGRES_PORT` and `REDIS_PORT` from
`.env` and translates the Compose-only `postgres` and `redis` hostnames to
`localhost`. The same URL resolver is used by `npm run
prisma:migrate` and `npm run prisma:studio`; do not manually replace Docker
service names in the shared `.env` file.

When dependencies change, the API's anonymous `node_modules` volume can retain
the previous image's dependency tree. Rebuild the image and renew only that
anonymous volume with:

```bash
docker compose up --build --renew-anon-volumes -d api
```

This preserves the named PostgreSQL and Redis data volumes.

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

The seed enables the frontend's development-only quick sign-in buttons. The
following contributor fixtures are also available for dashboard and matching
verification:

| Button | Account | Plan |
|---|---|---|
| Contributor | `contributor@sharek.local` | Free contributor |
| Gold contributor | `gold-contributor@sharek.local` | Gold contributor |
| Gold no matches | `gold-no-matches@sharek.local` | Gold contributor with approved Elixir only |
| Gold no skills | `gold-no-skills@sharek.local` | Gold contributor awaiting skill approval |
| Project owner | `owner@sharek.local` | Free owner |
| Gold owner | `gold-owner@sharek.local` | Gold owner |
| Admin | `admin@sharek.local` | No member subscription |

The local development password is defined by `DEV_PASSWORD` in
`prisma/seed.ts`. Re-running the seed is safe and repairs the demo Gold
subscriptions without creating duplicate accounts or Subscription rows. The
`gold-matching-skill-normalization` project adds a request requiring `Node.js`
while the Gold contributor fixture holds the approved skill as `NodeJS`.

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
