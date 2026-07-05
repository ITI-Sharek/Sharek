# Folder Structure

This is the intended backend repo layout.

## Root

```text
Backend/
  src/                  NestJS source code
  prisma/               Prisma schema and migrations
  docs/                 Backend operating docs
  bmad/                 Product planning and BMAD artifacts
  test/                 Test setup and future E2E support
  Dockerfile            Backend container definition
  docker-compose.yml    Local backend/Postgres/Redis stack
  package.json          Node scripts and dependencies
  AGENTS.md             AI coding agent instructions
  README.md             Backend entry point
```

## Source Code

```text
src/
  main.ts
  app.module.ts
  modules/
  shared/
```

`main.ts` boots the NestJS app.

`app.module.ts` wires shared infrastructure and business modules.

`modules/` contains business capabilities.

`shared/` contains technical infrastructure used across modules.

## Business Modules

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

Use these module responsibilities:

- `identity`: users, roles, sessions, auth state.
- `github`: OAuth metadata, repository ingestion, normalized GitHub evidence.
- `skill-profiles`: generated skills, approved skills, review state.
- `projects`: project drafts, publication, discovery metadata.
- `contribution-tasks`: contribution opportunities and required skills.
- `applications`: contributor applications and eligibility state.
- `delivery-reviews`: PR delivery and owner review.
- `reputation`: trusted contributor reputation and history.
- `admin`: admin queues, disputes, reports, moderation workflows.
- `ai`: FastAPI AI service gateway, request/response contracts, validation,
  and shared AI ports.
- `health`: operational health endpoint.

## Module Layers

Important modules may contain:

```text
domain/
application/
infrastructure/
presentation/
```

Use them like this:

- `domain`: entities, value objects, policies, domain errors, domain events.
- `application`: use cases, input/output DTOs, ports, orchestration.
- `infrastructure`: Prisma repositories, FastAPI AI clients, GitHub clients,
  jobs.
- `presentation`: controllers, request DTOs, response DTOs, guards, presenters.

Do not add empty services, repositories, factories, or entities only to fill the
folders. The folders are ready for real sprint tasks.

Most business modules now include this deeper skeleton:

```text
domain/
  entities/
  value-objects/
  events/
  exceptions/
  policies/
  contracts/
application/
  use-cases/
  dto/
  ports/
  mappers/
infrastructure/
  persistence/
  integrations/
  jobs/
presentation/
  http/
    controllers/
    requests/
    responses/
    guards/
    presenters/
```

Use `docs/examples/module-skeleton.md` as the sample for adding the first real
feature files.

## Shared

```text
src/shared/
  auth/
  config/
  database/
  errors/
  events/
  observability/
```

Allowed shared code:

- request-level auth helpers
- environment validation
- database connection
- global error handling
- event transport
- logging/tracing/metrics plumbing

Not allowed in shared:

- module-specific business rules
- module-specific repositories
- module-specific DTOs
- module-specific AI prompts
- convenience helpers used by only one module

## Prisma

```text
prisma/
  schema.prisma
  migrations/
```

Prisma owns schema and migrations.

Every business table must have one owning module.

## Docs

Start with:

```text
README.md
AGENTS.md
docs/README.md
docs/current-state-and-next-steps.md
docs/architecture.md
docs/backend-conventions.md
docs/definition-of-done.md
```
