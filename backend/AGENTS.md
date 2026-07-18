# Share-k Backend AI Agent Instructions

These instructions apply to every coding agent working in this repository.
Use `$sharek-backend-architect` before backend implementation, architecture
review, or module-boundary work when Codex skills are available.

## Required Reading

Before editing code, read:

1. `docs/README.md`
2. `docs/product-spec.md`
3. `docs/architecture.md`
4. `docs/api-contracts.md`
5. `docs/delivery-plan.md`
6. `docs/operations/engineering-guide.md`
7. `docs/audits/codebase-gap-report.md`
8. `docs/tooling/ai-agent-rules.md`
9. The relevant `src/modules/<module>/README.md`

## Architecture Facts

- The backend is a NestJS feature-first modular monolith.
- Modules use standard NestJS controllers, services, DTOs, and Prisma.
- Clean Architecture layer folders are not used.
- FastAPI AI implementation is a separately deployed service under the monorepo
  `ai/` workspace.
- PostgreSQL with pgvector is the main database; Prisma owns schema and migrations.
- BullMQ and Redis are used for asynchronous jobs when needed.
- NestJS WebSocket gateways deliver durable discussions, project-scoped direct
  messages, and persisted notifications.
- Docker Compose is the default local development path.

## Standard Module Shape

Small module:

```text
src/modules/projects/
  projects.module.ts
  projects.controller.ts
  projects.service.ts
  projects.service.spec.ts
  dto/
  integrations/       # only when needed
  README.md
```

Larger modules may use `controllers/` and `services/`. Add `jobs/`, `events/`,
`mappers/`, `repositories/`, `security/`, `integrations/`, `validators/`, or
`utils/` only when real files need them.

## Hard Rules

- Controllers handle HTTP input/output and delegate to services.
- Services own authorization, workflows, and business decisions.
- A module writes only its own database tables.
- Cross-module calls use services exported by the provider NestJS module.
- Never import another module's repositories, integrations, security, jobs,
  controllers, mappers, validators, or utilities.
- Keep `shared/` technical and reusable; do not put module business logic there.
- Do not add `application/`, `domain/`, `infrastructure/`, or `presentation/` layers.
- Do not add use-case classes, ports, or abstract repositories as architecture ceremony.
- Split a service when its responsibilities are difficult to understand or test.
- AI output is a recommendation. A NestJS service validates it, makes the final
  decision, and stores the audit snapshot.
- Private GitHub evidence requires explicit selected-repository read-only consent
  and cannot enter public output by default.
- WebSocket connections/rooms never grant business authority; owning services
  persist records and recheck scoped authorization.
- RAG retrieval is permission-filtered and attributable; agent tools cannot call
  final business transitions.
- Do not hardcode secrets, model keys, URLs, or tokens.
- Do not bypass Prisma migrations for schema changes.

## Normal Flows

```text
Controller -> DTO validation -> Service -> Prisma
                                    -> exported service from another module
                                    -> integration client
```

```text
SkillProfilesController -> SkillProfilesService -> AiService
  -> FastAPI client -> validated recommendation -> backend decision -> Prisma
```

Use events for reactions after facts have happened, such as
`DeliveryApproved -> ReputationService` updating reputation-owned records.

## Required Workflow

1. Read the active specification and relevant module README.
2. Inspect the existing implementation and public API contract.
3. Identify authorization, ownership, database, and migration impact.
4. Implement the smallest complete change in the owning module.
5. Add or update focused tests.
6. Run architecture check, lint, type-check, tests, and build.
7. Review the final diff and update module documentation.

## Expected Handoff

Report files changed, requirement/task IDs, tests, architecture-check result,
migrations, README/evidence updates, and known risks.

## Git Rules

- Work only on the current feature branch; do not switch branches.
- Do not commit, push, merge, discard human changes, or reformat unrelated files
  unless explicitly requested.

## Quality Gates

- `npm run check:architecture`
- `npm run lint`
- `npx tsc --noEmit`
- relevant tests and full tests when feasible
- `npm run build`
- API contract, authorization, and database impact reviewed

<!-- SPECKIT START -->
Current Spec Kit plan: `specs/001-contributor-profile-redirect/plan.md`
<!-- SPECKIT END -->

Before finishing a code change, update verified current evidence in
`docs/audits/codebase-gap-report.md` when implementation state changed. Planned
work remains in `docs/delivery-plan.md`.
