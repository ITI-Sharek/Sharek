# AI Module

Provides the NestJS facade for the separate FastAPI AI service.

```text
ai.module.ts
ai.service.ts
dto/
integrations/fastapi-skill-profile.client.ts
integrations/advisory-fit.client.ts
integrations/requirement-inference.client.ts
integrations/skill-gap-guidance.client.ts
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

The Advisory Fit client sends fixed Requirement Snapshots and bounded evidence
capsules (`evidenceId`, type, label, optional summary) to FastAPI. The allowlist
exactly matches those capsule IDs. The client validates the response vocabulary,
complete unique Requirement coverage, classification, and citation scope before
returning provider metadata and findings. The Applications module independently
revalidates and owns fit-band derivation, persistence, presentation, and all
workflow safety rules.

The Advisory Fit timeout defaults to `75000` ms. FastAPI allows up to 60 seconds
for the provider call, so the backend keeps a short network-overhead margin
before recording a technical `UNAVAILABLE` result. Override it with
`AI_ADVISORY_FIT_TIMEOUT_MS` when deploying a provider with a different budget.

The Skill Gap Guidance client sends a contributor-authenticated, explicit
request containing a fixed published Contribution Request requirement snapshot,
approved skill snapshot, and bounded source allowlist. It validates the
source-attributed structured result and rejects citations outside that allowlist.
The `skill-guidance` module owns contributor authorization and context assembly;
this module remains only the NestJS AI facade and FastAPI adapter. Guidance is
not connected to Application rejection, Advisory Fit decisions, subscription
tiers, or the retired Application-linked Prisma model.

The Requirement Inference client sends bounded Contribution Request content to
FastAPI and validates every returned skill level, kind, confidence, cap, and
normalized-name uniqueness before the contribution-tasks worker persists it.
Inference is asynchronous and advisory to the owner authoring flow: provider
failure records a retriable draft status and never writes a partial skill bar.
