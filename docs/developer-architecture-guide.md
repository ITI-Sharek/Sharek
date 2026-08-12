# Developer Architecture Guide

This guide explains how to add backend work without reintroducing unnecessary
layers. Read `docs/architecture.md` first for the binding rules.

## Choose The Owner

Choose the module that owns the final business state:

| Module | Owns |
| --- | --- |
| `identity` | users, roles, credentials, sessions, OAuth identity |
| `github` | GitHub OAuth, account access, repository listing, and normalized evidence |
| `projects` | project drafts, publication state, owner project data |
| `contributor-profiles` | contributor profile records and profile assembly |
| `skill-profiles` | skill generations, candidates, approval state, evidence snapshots |
| `notifications` | in-app notification records and notification write workflows |
| `assignment-conversations` | private Assignment conversations and durable Message history |
| `contribution-tasks` | project task definitions and requirements |
| `applications` | contributor Applications and owner-review lifecycle |
| `contribution-proposals` | contributor-authored proposals, immutable versions, owner revision requests, intake |
| `materials` | versioned Project and Request documents, visibility classes, private storage |
| `delivery-reviews` | delivery submissions, owner review, feedback, ratings |
| `reputation` | reputation summaries and history |
| `admin` | moderation, reports, disputes, admin queues |
| `ai` | NestJS AI facade and FastAPI client contracts |
| `skill-guidance` | explicit contributor guidance workflow and source-scoped recommendations |
| `subscriptions` | subscription plans, owner usage limits, and explicit MVP entitlements |
| `matching` | contributor matching, premium notifications, invites, reverse recommendations, and `AiMatchResult` persistence |
| `health` | operational health endpoint |

The owner performs its own writes. Other modules request behavior through an
exported service or react to an event.

## Start Small

For a new HTTP capability, begin with:

```text
feature/
  feature.module.ts
  feature.controller.ts
  feature.service.ts
  feature.service.spec.ts
  dto/
  README.md
```

Use plural `controllers/` and `services/` folders when the module has multiple
files in those categories. Move files only when the grouping improves navigation.

## Controller Responsibilities

Controllers may:

- define routes and guards;
- bind route, query, and body DTOs;
- read the authenticated user;
- delegate to a service;
- translate a service result into an HTTP response when necessary.

Controllers must not query Prisma, call external APIs, decide authorization,
or coordinate multi-step workflows.

## Service Responsibilities

Services own:

- authorization and ownership checks;
- workflow ordering and transactions;
- business validation and status transitions;
- calls to exported services from other modules;
- calls to module-local integration clients;
- persistence through Prisma or a concrete module-local repository;
- explicit response DTO assembly.

Split a service by responsibility when it becomes difficult to name, scan, or
test. `identity` uses separate auth, session, password-reset, username, and
social-auth services for this reason. `notifications` is a focused notification
write and WebSocket delivery module for contributor and system alerts.

## DTOs And Validation

- Put request and response DTOs under `dto/`.
- Validate public input explicitly with `class-validator`.
- Do not return secrets, password hashes, provider tokens, session hashes, or
  raw Prisma records that contain private fields.
- Keep public route and response changes explicit and documented.

## Persistence

Direct Prisma access in an owning service is the default for simple queries.
Use `repositories/` for a concrete repository only when query and transaction
logic is substantial enough to obscure the workflow. Do not add an abstract
repository unless two real implementations exist.

Schema changes require:

1. `prisma/schema.prisma` change;
2. Prisma migration;
3. generated client refresh;
4. validation and migration notes in the handoff.

## Cross-Module Calls

Allowed:

```text
ContributorProfilesService -> SkillProfileSummaryService
ProjectsService -> GitHubRepositoryService
SkillProfileGenerationService -> AiService
```

The provider module must export the called service. Do not import its concrete
repository, integration client, security implementation, worker, controller,
mapper, validator, or utility.

Use an event when the caller is announcing a completed fact and does not need a
synchronous result. Event listeners update only their own module's records.

## External Integrations

Place provider-specific code in the owning module's `integrations/` folder.
Services call clients; controllers do not. Configuration comes from validated
environment variables. Never log or persist raw provider secrets unnecessarily.

## AI-Backed Work

1. The owning service performs deterministic authorization and eligibility checks.
2. It builds a bounded, structured input.
3. It calls `AiService`.
4. `AiService` delegates to a FastAPI client.
5. The owning service validates the recommendation and makes the final decision.
6. The owning module stores business state and the audit snapshot.

AI failures must have explicit retry, fallback, or user-visible failure behavior.
AI output must never bypass backend policy.

## Asynchronous Jobs

Create `jobs/` only when a real queue exists. Keep the queue and worker concrete.
The worker delegates business processing to a service and handles operational
concerns such as retries, recovery, logging, and final failure marking.

## Add A Feature

1. Read the PRD/task and module README.
2. Confirm route, request, response, and error contracts.
3. Identify the owning module and any exported service dependencies.
4. Review authorization and table ownership.
5. Add or update DTOs.
6. Implement the service behavior.
7. Add the thin controller route if needed.
8. Add focused unit tests and relevant HTTP/E2E coverage.
9. Update the module README and `docs/module-development-tracker.md`.
10. Run the quality gates from `docs/definition-of-done.md`.

## Avoid These Patterns

- layer folders named `application`, `domain`, `infrastructure`, or `presentation`;
- `UseCase` classes that are ordinary services under another name;
- reader ports with one provider;
- abstract repositories with one Prisma implementation;
- module-specific logic in `shared/`;
- controllers that inject `DatabaseService`;
- direct writes to another module's tables;
- one service that mixes unrelated workflows only to reduce file count.
