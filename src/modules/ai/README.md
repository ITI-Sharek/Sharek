# AI Module

Provides the NestJS facade for the separate FastAPI AI service.

```text
ai.module.ts
ai.service.ts
dto/
integrations/fastapi-skill-profile.client.ts
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
