# AI Coding Agent Rules

These rules keep AI-generated backend work consistent and reviewable.

## Required Context Pack

Every AI coding agent should receive:

- Task ID from the backlog.
- Requirement IDs from the PRD.
- Allowed module scope.
- Files it may edit.
- Files it must not edit.
- Required tests.
- Definition of done.
- Target module README.
- `docs/module-development-tracker.md` checklist.

## Agent Workflow

1. Read relevant docs, including `developer-architecture-guide.md`, and task
   context.
2. Identify the owning module.
3. Inspect existing files before editing.
4. Make the smallest coherent change.
5. Add or update tests.
6. Run `npm run check:architecture` and relevant tests/checks.
7. Update module README and docs when behavior, API, schema, or module shape
   changed.
8. Append a short change record to `docs/module-development-tracker.md`.
9. Summarize changed files, tests, docs, tracker updates, and risks.

## Scope Rules

Agents must stay in their assigned module unless the task explicitly requires a
shared change.

If a task needs another module:

- Use a public reader port.
- Use a public exported application service.
- Emit or consume an event.
- Ask for a boundary decision if the dependency is unclear.

Do not import another module's private infrastructure or write another module's
tables directly.

## AI Service Rules

For AI-backed workflows:

- Call the separate FastAPI AI service through backend ports/adapters.
- Use structured inputs and outputs.
- Include confidence, reasoning summary, evidence IDs, provider, model, and
  schema/service version where relevant.
- Validate AI service output before using it.
- Save audit snapshots for business decisions.
- Fall back to retry or manual review on timeout, malformed output, or low
  confidence.

## Contract Rules

- Keep FastAPI request and response schemas strict and versioned.
- Do not embed secrets in prompts, payloads, logs, or docs.
- Add tests for malformed or incomplete AI service output.
- Make AI service integration changes through adapters, not use cases.
- Provider-specific prompts and model calls belong in the FastAPI AI repository,
  not this NestJS backend.

## Review Checklist For AI Output

Before accepting AI-generated code, verify:

- It is in the correct module.
- Controllers are thin.
- Business rules are in use cases or domain.
- Database writes belong to the owning module.
- AI output cannot directly change final business state.
- Tests cover important behavior.
- No secrets or debug-only code were added.
- Module README and `docs/module-development-tracker.md` are current.
