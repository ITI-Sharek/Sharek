# Share-k Backend AI Agent Instructions

These instructions apply to every AI coding agent working in this backend repo.

## Required Reading

Before editing code, read:

1. `docs/architecture.md`
2. `docs/backend-conventions.md`
3. `docs/ai-agent-rules.md`
4. `docs/definition-of-done.md`
5. The relevant sprint/task in `bmad/_bmad-output/sharek-backlog.md`
6. The relevant requirements in `bmad/_bmad-output/planning-artifacts/prds/prd-Grad_Project-2026-06-17/prd.md`

## Architecture Facts

- Backend is a NestJS feature-first modular monolith.
- AI runs inside NestJS through ports/adapters for the MVP.
- Ready model APIs are used; no custom model training is planned.
- PostgreSQL with pgvector is the main database.
- Prisma owns schema and migrations.
- BullMQ and Redis are used for async jobs when needed.
- Docker Compose is the default local development path.

## Hard Rules

- Do not put business logic in controllers.
- Do not let AI output directly change final business state.
- Do not import another module's infrastructure.
- Do not write another module's tables directly.
- Do not place module-specific code in `shared/`.
- Do not add empty architecture layers for decoration.
- Do not hardcode secrets, model keys, URLs, or tokens.
- Do not bypass Prisma migrations for schema changes.

## Normal Flow

Use this path for HTTP features:

```text
controller -> request DTO validation -> use case -> domain/policy -> port/repository -> response DTO
```

Use this path for AI-backed decisions:

```text
use case -> deterministic checks -> AI port -> provider adapter -> structured recommendation -> backend decision -> audit snapshot
```

Use events for reactions after facts have happened:

```text
DeliveryApproved -> Reputation updates its own records
```

## Output Expected From Agents

For every implementation task, provide:

- Files changed.
- Requirement or task IDs covered.
- Tests added or updated.
- Migrations added, if any.
- Known risks or follow-up work.

