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

## Agent Workflow

1. Read relevant docs and task context.
2. Identify the owning module.
3. Inspect existing files before editing.
4. Make the smallest coherent change.
5. Add or update tests.
6. Run relevant checks.
7. Summarize changed files, tests, and risks.

## Scope Rules

Agents must stay in their assigned module unless the task explicitly requires a
shared change.

If a task needs another module:

- Use a public reader port.
- Use a public application service.
- Emit or consume an event.
- Ask for a boundary decision if the dependency is unclear.

Do not import another module's infrastructure.

## AI Feature Rules

For model calls:

- Hide provider details behind ports.
- Use structured inputs and outputs.
- Include confidence, reasoning summary, evidence IDs, provider, model, and
  version where relevant.
- Validate model output before using it.
- Save audit snapshots for business decisions.
- Fall back to retry or manual review on timeout, malformed output, or low
  confidence.

## Prompt and Model Rules

- Keep prompts versioned in code.
- Do not embed secrets in prompts.
- Keep prompt output schemas strict.
- Add tests for malformed or incomplete provider output.
- Make model provider changes through adapters, not use cases.

## Review Checklist For AI Output

Before accepting AI-generated code, verify:

- It is in the correct module.
- Controllers are thin.
- Business rules are in use cases or domain.
- Database writes belong to the owning module.
- AI output cannot directly change final business state.
- Tests cover important behavior.
- No secrets or debug-only code were added.

