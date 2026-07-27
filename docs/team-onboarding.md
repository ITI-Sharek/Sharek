# Team Onboarding

Use this checklist when a new teammate runs the backend for the first time.

## Message To Share

Send this to a teammate:

```text
Pull the backend repo, then open docs/team-onboarding.md.

For env setup, do not use my private .env file. Use the shared safe template:

cp .env.example .env

Then run:

npm install
docker compose up --build

After Docker starts:

docker compose exec api npm run prisma:migrate
docker compose exec api npx prisma db seed
curl http://localhost:4000/health

If you need GitHub OAuth or AI-service secrets, ask in the private team channel.
```

## Do Not Send Private `.env` Files

Do not commit or casually send your personal `.env` file. It can contain secrets,
tokens, local paths, or credentials that should not spread between machines.

Use this approach instead:

- Commit safe defaults and placeholders in `.env.example`.
- Each teammate copies `.env.example` to `.env` locally.
- Treat `.env.example` as the shared env file for local development.
- Share real development secrets only through a trusted private channel or team
  password manager.
- If a value is not secret and everyone needs it, add it to `.env.example`.

## First Run

From the backend repo root:

```bash
cp .env.example .env
npm install
docker compose up --build
```

In another terminal, after the containers are running:

```bash
docker compose exec api npm run prisma:migrate
docker compose exec api npx prisma db seed
curl http://localhost:4000/health
```

Expected health response:

```json
{
  "status": "ok"
}
```

Then verify the local setup:

```bash
docker compose exec api npm test
docker compose exec api npm run lint
```

## Required Local Tools

- Docker Desktop or Docker Engine with Compose.
- Node.js 22 if running commands outside Docker.
- npm.
- Git.

## Environment Values

Most local values can stay exactly as they are in `.env.example`.

These values usually need teammate-specific setup:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_OAUTH_CALLBACK_URL`
- `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, and `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY_BASE64` and `GITHUB_APP_WEBHOOK_SECRET`
- `GITHUB_APP_INSTALLATION_URL`, `GITHUB_APP_CALLBACK_URL`, and
  `GITHUB_APP_FRONTEND_RETURN_URL`
- `AI_SERVICE_URL`
- `AI_SERVICE_AUTH_TOKEN`

For GitHub OAuth, either create a shared development OAuth app and share its
client values privately, or ask each teammate to create their own local GitHub
OAuth app. The GitHub OAuth App authorization callback URL should usually be:

```text
http://localhost:4000/auth/github/callback
```

Use this repository-connect callback in `.env`:

```text
http://localhost:4000/auth/github/callback/repository
```

Repository evidence now uses a separate GitHub App. Ask for its development
configuration through the private team channel; never share the PEM file or a
real Base64 private key in the repository. Configure selected repositories,
Metadata read, Contents read, authorization during installation, no setup URL,
and forward local webhook deliveries as described in `docs/local-development.md`.

For AI features, run the separate FastAPI AI repository and point
`AI_SERVICE_URL` at it. When the backend runs in Docker and the AI service runs
on the host machine, use:

```text
http://host.docker.internal:8010
```

Set the same long random `AI_SERVICE_AUTH_TOKEN` in both repositories. Skill
profiling also requires the Redis service because generation runs through the
durable BullMQ worker.

## Common Problems

### Port Already In Use

Change the host port in `.env`:

```text
PORT=4001
POSTGRES_PORT=5433
REDIS_PORT=6380
PRISMA_STUDIO_PORT=5556
```

### Database Errors

Run migrations inside the API container:

```bash
docker compose exec api npm run prisma:migrate
```

If the database volume is broken during local development only, reset it:

```bash
docker compose down -v
docker compose up --build
docker compose exec api npm run prisma:migrate
docker compose exec api npx prisma db seed
```

### GitHub OAuth Not Working

Check:

- `GITHUB_CLIENT_ID` is set.
- `GITHUB_CLIENT_SECRET` is set.
- The OAuth app callback URL is the parent GitHub auth callback
  `http://localhost:4000/auth/github/callback`; the repository connect callback
  uses `GITHUB_OAUTH_CALLBACK_URL` as a subpath so both GitHub flows can share
  one local OAuth App.
- The backend is reachable at the same host and port used in the callback URL.

### AI Calls Not Working

Check:

- The FastAPI AI service is running.
- `AI_SERVICE_URL` is correct from inside Docker.
- `AI_SERVICE_AUTH_TOKEN` matches the AI service if auth is enabled.
