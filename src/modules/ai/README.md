# AI Module

Provides the NestJS facade for the separate FastAPI AI service.

```text
ai.module.ts
ai.service.ts
dto/
integrations/fastapi-skill-profile.client.ts
integrations/advisory-fit.client.ts
README.md
```

`AiService` is exported to business modules. Integration clients validate
configuration, call FastAPI, and return structured DTOs. This module does not
make final business decisions or write skill, project, or application state.
Skill-profile requests carry an explicit `role`; the contributor generation
workflow always sends `role: "contributor"`.

Provider keys, prompt execution, model orchestration, and Python AI tooling live
in the FastAPI repository. Owning NestJS services apply deterministic policy and
store audit snapshots.

The Advisory Fit client sends fixed Application Requirement/Evidence Snapshots
to the FastAPI assessment contract and validates the bounded result vocabulary.
It returns provider metadata and findings to the Applications module; NestJS
owns citation validation, fit-band derivation, persistence, presentation, and
all workflow safety rules.

The Advisory Fit timeout defaults to `75000` ms. FastAPI allows up to 60 seconds
for the provider call, so the backend keeps a short network-overhead margin
before recording a technical `UNAVAILABLE` result. Override it with
`AI_ADVISORY_FIT_TIMEOUT_MS` when deploying a provider with a different budget.
