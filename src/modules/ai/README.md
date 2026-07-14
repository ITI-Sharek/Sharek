# AI Module

Owns the NestJS-side gateway to the separate FastAPI AI service.

AI answers these questions:

- What contract does NestJS expect from the FastAPI AI service?
- How does NestJS call the AI service safely?
- Was the AI response valid, timed out, malformed, or low confidence?
- Which backend use case receives the recommendation?

Current state:

```text
ai/
  ai.module.ts
  application/
    ports/skill-profile-generator.port.ts
    ports/eligibility-analyzer.port.ts
    ports/embedding-generator.port.ts
    ports/skill-gap-advisor.port.ts
  infrastructure/
    integrations/fastapi-skill-profile-generator.client.ts
```

Implemented adapters:

- `FastApiSkillProfileGeneratorClient` calls
  `POST {AI_SERVICE_URL}/skill-profiles/generate`, validates the structured
  response, and exposes it through the `SkillProfileGenerator` port.
- The client sends `AI_SERVICE_AUTH_TOKEN` as an internal bearer credential.
- Every returned evidence ID must belong to a submitted repository capsule;
  unknown citations and malformed policy fields reject the whole response.

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

## Where To Put New Files

- `application/ports`: contracts used by business modules, such as
  `EligibilityAnalyzer` or `SkillProfileGenerator`.
- `application/dto`: AI request/response DTOs when they are shared inside the
  NestJS backend.
- `infrastructure/integrations`: FastAPI HTTP client adapters.
- `infrastructure/validation`: response schema validation helpers if the
  validation becomes reusable.
- `infrastructure/jobs`: background calls to the AI service when slow work moves
  to queues.
- `presentation/http`: usually avoid public AI endpoints. The frontend should
  call business endpoints such as skill profile generation or application
  validation, not raw AI endpoints.

## Expected AI Flow

```text
business use case
  -> AI port
  -> FastAPI AI client adapter
  -> validate structured response
  -> return recommendation to business use case
  -> owning module applies deterministic policy
  -> owning module stores final state and audit snapshot
```

## Boundaries

Do not put prompts, model-provider SDKs, or Python AI orchestration in this
NestJS module.

Do not let this module approve skills, accept applications, or update
reputation. It only provides a safe gateway and contracts.

The adapter validates confidence, exact evidence IDs, recommendation,
evidence quality, fraud-signal repository names, and bounded audit metadata.
The `skill-profiles` module still owns final storage, status, confidence policy,
retry outcome, and review workflow.
