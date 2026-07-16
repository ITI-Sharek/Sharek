# Backend Architecture

## Decision

Share-k uses a **NestJS feature-first modular monolith with standard controllers,
services, DTOs, and Prisma**. It does not use Clean Architecture layers.

ADR-002 is the authoritative decision record:
`bmad/_bmad-output/planning-artifacts/architecture/adr-002-standard-nestjs-module-architecture.md`.

## Runtime Shape

- NestJS owns HTTP APIs, authentication, authorization, workflows, final
  business decisions, database writes, and audit snapshots.
- PostgreSQL with pgvector is the primary database.
- Prisma owns schema, generated client, and migrations.
- Redis and BullMQ handle asynchronous jobs when needed.
- A separate FastAPI repository owns AI provider calls, prompts, Python tooling,
  and model-specific implementation.
- Docker Compose is the default local development path.

## Request Flow

```text
Controller -> request DTO validation -> Service -> Prisma
                                      -> exported module service
                                      -> integration client
```

Controllers translate HTTP input and output. Services perform authorization,
workflow coordination, validation, and business decisions. Services may use
Prisma directly for straightforward persistence. A concrete repository is
allowed when a module has a large, cohesive set of complex queries.

## Module Shape

Small module:

```text
projects/
  projects.module.ts
  projects.controller.ts
  projects.service.ts
  projects.service.spec.ts
  dto/
  mappers/             # only when needed
  README.md
```

Larger module:

```text
identity/
  identity.module.ts
  controllers/
  services/
  dto/
  integrations/
  security/
  validators/
  README.md
```

Optional folders are `events/`, `integrations/`, `jobs/`, `mappers/`,
`repositories/`, `security/`, `utils/`, and `validators/`. Create them only for
real files. Do not create empty architecture placeholders.

## Module Boundaries

1. Each business capability has one owning module.
2. A module writes only its own tables.
3. Cross-module calls use services exported from the provider's NestJS module.
4. Never import another module's repository, client, security implementation,
   job, controller, mapper, validator, or utility.
5. `shared/` contains technical cross-cutting code only: configuration,
   database bootstrap, auth guards/decorators, errors, logging, and similar code.
6. Events describe completed facts and let each listener update its own state.

## AI Flow

```text
Owning service
  -> deterministic eligibility and authorization checks
  -> AiService
  -> FastAPI integration client
  -> structured recommendation
  -> backend validation and final decision
  -> owning module writes state and audit snapshot
```

AI never writes final business state directly. Provider keys and prompt/model
implementation stay outside business modules and outside tracked configuration.

## Current Examples

- `projects`: root controller/service for a small module.
- `identity`: multiple controllers and focused auth, session, password-reset,
  username, and social-auth services.
- `skill-profiles`: HTTP service plus a background generation service, concrete
  repository, BullMQ queue, and worker.
- `ai`: `AiService` facade plus FastAPI integration client.

## Enforcement

`npm run check:architecture` rejects legacy layer folders, use-case/port
filenames, private cross-module imports, persistence in controllers, external
HTTP calls in controllers, missing module READMEs, and stale canonical guidance.
