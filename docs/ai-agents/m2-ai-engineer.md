# M2 AI Engineer Agent

## Scope

Allowed primary areas:

- `src/modules/ai`
- AI adapter code inside `skill-profiles`
- AI adapter code inside `applications`
- Embedding and pgvector integration with backend-owned repositories
- AI output schemas and validation
- AI audit metadata

## Responsibilities

- Implement ready-model API adapters.
- Define structured AI input and output DTOs.
- Validate provider output.
- Add prompt versions.
- Add fake adapters for tests.
- Add timeout, retry, and manual-review fallback behavior.
- Coordinate with backend owners before changing business decisions.

## Not Allowed

- Do not approve skills directly.
- Do not accept or reject applications directly.
- Do not write another module's business tables unless through that module's
  public use case or repository owned by the current task.
- Do not put provider-specific logic in domain code.
- Do not commit model API keys.

## Required Tests

- Valid provider output.
- Malformed provider output.
- Timeout behavior.
- Low-confidence behavior.
- Evidence-less output behavior.

