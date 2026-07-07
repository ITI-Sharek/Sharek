# Backend Conventions

## Module Structure

Use feature-first modules. Start with the smallest useful shape:

```text
src/modules/<module-name>/
  <module-name>.module.ts
  README.md
```

Add deeper folders only when real code needs a boundary:

```text
src/modules/<module-name>/
  domain/
  application/
  infrastructure/
  presentation/
  <module-name>.module.ts
```

Use fewer folders for simple modules. Add structure when it protects a real
rule, dependency, or test boundary.

Use this decision rule:

- Add `presentation/` when the module exposes controllers, request DTOs,
  response DTOs, guards, or presenters.
- Add `application/` when a controller would otherwise coordinate workflow,
  authorization, multiple reads/writes, or cross-module calls.
- Add `domain/` when there are business invariants such as status transitions,
  limits, eligibility rules, reputation rules, or approval policies.
- Add `infrastructure/` when the module has Prisma repositories, external API
  clients, FastAPI AI adapters, queue jobs, or persistence mappers.

Do not keep `.gitkeep` placeholder trees for future work. Future sprint tasks
should create the needed folder and the first real file together.

## Controller Rules

Controllers should:

- Define routes.
- Validate request DTOs.
- Read authenticated user context.
- Call one use case.
- Return response DTOs.

Controllers should not:

- Query Prisma directly.
- Call the FastAPI AI service or model providers directly.
- Calculate eligibility.
- Change application status directly.
- Calculate reputation.

## Use Case Rules

Use cases should:

- Receive explicit input DTOs.
- Check authorization and ownership.
- Load data through ports or repositories.
- Apply domain rules.
- Save through repositories.
- Emit events when needed.
- Return output DTOs.

## Domain Rules

Domain code should contain important business behavior, such as:

- Application status transitions.
- Skill approval invariants.
- Delivery approval rules.
- Reputation score limits.
- Subscription limit policies.

Domain code must not import:

- NestJS decorators.
- Prisma client.
- HTTP clients.
- Model provider SDKs.
- AI service clients.
- Environment configuration.

## Infrastructure Rules

Infrastructure code may contain:

- Prisma repositories.
- GitHub API clients.
- FastAPI AI service clients.
- Queue workers.
- Email or notification adapters.
- Persistence mappers.

Infrastructure is private to its module unless explicitly exported as a narrow
public API.

## Shared Folder Rules

`shared/` is only for technical capabilities used across multiple modules:

```text
shared/database
shared/auth
shared/errors
shared/events
shared/observability
```

Do not place module-specific repositories, policies, DTOs, prompts, or helper
functions in `shared/` for convenience.

## Database Rules

- Prisma owns schema and migrations.
- Every table has one owning module.
- Only the owning module writes that table.
- Cross-module reads should go through reader ports or public services where
  practical.
- Foreign keys are allowed, but they do not grant permission to bypass module
  logic.
- Store audit snapshots for important AI decisions.
- Store provider/model/schema/service-version metadata for AI-generated
  results.

## API Rules

- Version public API routes when breaking changes become likely.
- Validate all input DTOs.
- Return stable response DTOs, not raw database rows.
- Keep frontend-facing API contracts documented.
- Use pagination for list endpoints.

## Error Rules

- Use domain or application errors for business failures.
- Use a global exception filter to map errors to HTTP responses.
- Do not throw NestJS `HttpException` from domain code.
- Include safe correlation IDs in logs.
- Do not log secrets, OAuth tokens, or raw provider credentials.

## Testing Rules

Add tests based on risk:

- Domain tests for business rules.
- Use-case tests with fake ports.
- Repository integration tests for Prisma behavior.
- Adapter tests for GitHub/FastAPI AI service edge cases.
- E2E tests for core product flows.

Important status transitions must always be tested.
