# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with concrete Share-k
  backend details. Keep choices aligned with the constitution and docs.
-->

**Language/Version**: TypeScript on Node.js with NestJS [or NEEDS CLARIFICATION]

**Primary Dependencies**: NestJS, Prisma, PostgreSQL with pgvector, BullMQ/Redis when async jobs are needed [or NEEDS CLARIFICATION]

**Storage**: PostgreSQL via Prisma; pgvector for backend-owned vectors where applicable [or N/A]

**Testing**: Jest unit/service tests, integration tests, authorization/security tests, API contract tests, and relevant E2E tests [or NEEDS CLARIFICATION]

**Target Platform**: Docker Compose local backend stack; deployable NestJS API service [or NEEDS CLARIFICATION]

**Project Type**: Backend web API in a feature-first modular monolith

**Performance Goals**: Align with PRD NFRs such as P95 API response under 3 seconds for non-streaming core interactions [or N/A]

**Constraints**: Standard NestJS controllers/services/DTOs; services own authorization and final decisions; Prisma owns schema/migrations; external providers use typed module contracts; AI is advisory and evidence-bound; no secrets in code/logs

**Scale/Scope**: [module scope, user roles, expected data volume, API surface, or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Authority and Traceability**: Current behavior, approved target behavior, assumptions, and unresolved decisions are separated; Jira/PRD/decision/ADR IDs are recorded where available.
- **Roles and Context**: Account modes shape primary journeys without becoming
  exclusive capability silos; OWNER and CONTRIBUTOR may own projects and
  contribute without a role change; persisted relationships authorize later
  actions; request IDs, roles, or Admin flags are not authorization evidence;
  Admin bypasses are explicit and auditable.
- **Module Ownership**: Owning module and tables are identified; no writes cross ownership; cross-module behavior uses exported NestJS services or completed-fact events.
- **HTTP Flow**: Route follows controller -> validated DTO -> focused service -> Prisma, exported service, or module-local integration client -> explicit response DTO.
- **GitHub and Evidence**: OAuth is identity-only; private access requires GitHub App installation plus explicit selection; visibility, provenance, freshness, redaction, and revocation are planned where relevant.
- **AI Boundary**: AI remains advisory and evidence-linked; it cannot automatically accept, reject, hide, rank out, or eliminate applications; NestJS owns final decisions and audit snapshots.
- **State and Persistence**: State transitions are explicit; public visibility is backend-enforced; Prisma migrations are forward-only and preserve data; GitHub-connected and repository-free workflows remain compatible.
- **API Contract**: Request/response DTO allowlists, error mapping, pagination, compatibility, and frontend-facing documentation are planned; raw ORM/provider objects are never public contracts.
- **Testing and Reliability**: Unit, integration, authorization/security, contract, and relevant E2E coverage are planned, including timeout, rate-limit, revocation, retry, idempotency, concurrency, and partial failure when external systems are involved.
- **Brownfield Safety**: Existing code, tests, modules, migrations, and uncommitted changes were inspected; no duplicate module or completed-feature reimplementation is proposed.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace placeholders with the concrete module and files for
  this feature. Add folders only when the first real file needs that boundary.
-->

```text
src/
├── modules/
│   └── [owning-module]/
│       ├── [owning-module].module.ts
│       ├── [owning-module].controller.ts  # small module, when needed
│       ├── [owning-module].service.ts     # small module, when needed
│       ├── controllers/                  # only when multiple controllers exist
│       ├── services/                     # only when multiple focused services exist
│       ├── dto/
│       ├── integrations/                 # module-local provider clients, when needed
│       ├── repositories/                 # concrete complex persistence, when needed
│       ├── jobs/                         # concrete queues/workers, when needed
│       ├── events/                       # completed facts, when needed
│       ├── security/                     # private security implementation, when needed
│       ├── mappers/                      # non-trivial conversion, when needed
│       ├── validators/                   # reusable module validation, when needed
│       ├── utils/                        # pure module-local helpers, when needed
│       ├── README.md
├── shared/
│   ├── auth/
│   ├── database/
│   ├── errors/
│   ├── events/
│   └── observability/
└── app.module.ts

prisma/
├── schema.prisma
└── migrations/

test/ or src/**/*.spec.ts
```

**Structure Decision**: [Document the owning module, focused services, public exported dependencies, and why each optional technical folder/file is needed now]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., cross-module read path] | [current need] | [why public reader/service/event is insufficient] |
| [e.g., new shared capability] | [specific reusable technical need] | [why module-local code is insufficient] |
