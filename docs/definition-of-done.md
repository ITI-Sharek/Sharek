# Definition Of Done

A backend task is done only when all relevant checks below pass.

## Product Alignment

- The task maps to a backlog task ID.
- The task maps to PRD requirement IDs when applicable.
- Acceptance criteria are implemented or explicitly deferred.

## Architecture

- Code is in the owning module.
- Controllers are thin.
- Business rules live in use cases or domain code.
- Domain code does not depend on NestJS, Prisma, HTTP clients, or provider SDKs.
- External systems are accessed through ports/adapters.
- No module imports another module's infrastructure.
- `shared/` is not used as a dumping ground.

## Database

- Prisma schema is updated when needed.
- Migration is added when schema changes.
- Table ownership is respected.
- Important state changes have status history or audit data when required.
- AI decisions store provider/model/version/confidence/evidence metadata when
  they affect business workflows.

## API

- Request DTO validation exists.
- Response DTO shape is stable.
- Authorization and ownership checks exist in use cases.
- Errors map to appropriate HTTP responses.
- List endpoints include pagination where needed.

## AI

- AI output is validated before use.
- Low-confidence or malformed output routes to retry or manual review.
- AI does not directly approve skills, accept applications, or update
  reputation.
- Provider-specific logic is hidden behind adapters.

## Tests

- Domain rules have unit tests.
- Use cases have tests with fake ports where useful.
- Repository or adapter behavior has integration tests when risky.
- Important status transitions are tested.
- E2E coverage exists for core user flows when the feature is user-visible.

## Operations

- Docker/local development still works.
- Environment variables are documented in `.env.example` when added.
- No secrets are committed.
- Logs include useful context without leaking sensitive data.
- CI checks pass.

## Review Output

Every PR or task summary should include:

- Files changed.
- Requirement/task IDs covered.
- Tests run.
- Migrations added.
- Known risks.

