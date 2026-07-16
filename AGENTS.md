# Share-k Backend AI Agent Instructions

These instructions apply to every AI coding agent working in this backend repo.

If the environment supports Codex skills, use `$sharek-backend-architect` before
backend implementation, architecture review, or module-boundary work.

## Required Reading

Before editing code, read:

1. `docs/architecture.md`
2. `docs/developer-architecture-guide.md`
3. `docs/module-development-tracker.md`
4. `docs/backend-conventions.md`
5. `docs/ai-agent-rules.md`
6. `docs/definition-of-done.md`
7. The relevant module README under `src/modules/<module>/README.md`
8. The relevant sprint/task in `bmad/_bmad-output/sharek-backlog.md`
9. The relevant requirements in `bmad/_bmad-output/planning-artifacts/prds/prd-Grad_Project-2026-06-17/prd.md`

## Architecture Facts

- Backend is a NestJS feature-first modular monolith.
- AI implementation lives in a separate FastAPI AI repository.
- The backend calls the FastAPI AI service through ports/adapters and owns final
  business decisions.
- PostgreSQL with pgvector is the main database.
- Prisma owns schema and migrations.
- BullMQ and Redis are used for async jobs when needed.
- Docker Compose is the default local development path.

## Hard Rules

- Do not put business logic in controllers.
- Do not let AI output directly change final business state.
- Cross-module dependency is allowed only through public exported application
  services, reader ports, or events.
- Do not import another module's private infrastructure.
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
use case -> deterministic checks -> AI port -> FastAPI AI client -> structured recommendation -> backend decision -> audit snapshot
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
- `npm run check:architecture` result.
- Migrations added, if any.
- Module README and tracker updates.
- Known risks or follow-up work.

## Required workflow

1. Read the active specification.
2. Inspect the existing implementation.
3. Confirm the API contract.
4. Identify database and migration requirements.
5. Implement the smallest complete backend change.
6. Add or update tests.
7. Run lint, type-check, tests, and build.
8. Review the final diff.

## Architecture rules

- Follow the existing modular architecture.
- Keep controllers thin.
- Put business logic in application or service layers.
- Keep persistence logic isolated.
- Use explicit DTO validation.
- Do not expose database entities directly unless the project already follows that pattern.
- Do not bypass authorization or ownership checks.
- Do not silently change public API contracts.

## Git rules

- Work only on the current feature branch.
- Do not change branches.
- Do not commit unless explicitly requested.
- Do not push or merge.
- Do not discard existing human changes.
- Do not reformat unrelated files.

## Quality gates

Before completion:

- lint passes
- type-check passes
- relevant tests pass
- build passes
- API contract is verified
- authorization is reviewed
- database changes are documented

<!-- SPECKIT START -->
Current Spec Kit plan: `specs/001-contributor-profile-redirect/plan.md`

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan before
implementing feature work.
<!-- SPECKIT END -->

## Agent skills

### Issue tracker

GitHub (`ITI-Sharek/Backend`) is the source of truth for issues; `.scratch/<feature-slug>/` holds draft/working notes before publishing. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

Before finishing, append a short change record to
`docs/module-development-tracker.md` unless the task was read-only.
