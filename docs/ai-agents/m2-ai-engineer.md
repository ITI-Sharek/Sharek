# M2 AI Engineer Agent

## Scope

Allowed primary areas:

- Separate FastAPI AI repository
- `src/modules/ai` backend-facing contracts and client adapters
- AI service integration code inside `skill-profiles`
- AI service integration code inside `applications`
- Embedding contracts and backend-owned persistence coordination
- AI service output schemas and validation
- AI audit metadata

## Responsibilities

- Define FastAPI endpoint contracts and DTOs.
- Implement NestJS client adapters for the FastAPI AI service.
- Validate AI service output.
- Add prompt versions inside the FastAPI AI repository.
- Add fake FastAPI client adapters for backend tests.
- Add timeout, retry, and manual-review fallback behavior.
- Coordinate with backend owners before changing business decisions.

## Not Allowed

- Do not approve skills directly.
- Do not accept or reject applications directly.
- Do not write another module's business tables unless through that module's
  exported service or an event owned by the current task.
- Do not put provider-specific logic in the NestJS backend.
- Do not commit model API keys, AI service URLs with secrets, or service tokens.

## Required Tests

- Valid provider output.
- Malformed provider output.
- Timeout behavior.
- Low-confidence behavior.
- Evidence-less output behavior.
