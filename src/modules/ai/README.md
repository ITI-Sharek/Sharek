# AI Module

Owns the NestJS-side gateway to the separate FastAPI AI service.

Use this module for:

- FastAPI AI service client adapters.
- Request and response contracts shared with the AI repository.
- Structured output schemas.
- Embedding request/response integration.
- Shared AI ports such as `EligibilityAnalyzer`.
- Service timeout, retry, and malformed-output handling.

Provider-specific model clients, prompt execution, and Python AI tooling belong
in the FastAPI AI repository.

AI returns recommendations only. Backend business modules own final state
changes and database writes.
