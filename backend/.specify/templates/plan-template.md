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

**Testing**: Jest unit/use-case tests, Prisma integration tests where needed, E2E tests for core flows [or NEEDS CLARIFICATION]

**Target Platform**: Docker Compose local backend stack; deployable NestJS API service [or NEEDS CLARIFICATION]

**Project Type**: Backend web API in a feature-first modular monolith

**Performance Goals**: Align with PRD NFRs such as P95 API response under 3 seconds for non-streaming core interactions [or N/A]

**Constraints**: Controllers stay thin; business rules live in use cases/domain; Prisma owns schema/migrations; AI decisions use FastAPI ports/adapters and backend final policy; no secrets in code/logs

**Scale/Scope**: [module scope, user roles, expected data volume, API surface, or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Module Ownership**: Owning module identified; no writes to another module's tables; cross-module reads use reader ports, public services, or events.
- **HTTP Flow**: Route follows controller -> request DTO validation -> use case -> domain/policy -> port/repository -> response DTO.
- **Domain Boundary**: Business invariants and status transitions live outside controllers and are testable without NestJS/Prisma/HTTP clients.
- **AI Boundary**: FastAPI AI service is accessed only through ports/adapters; backend validates structured output, owns final decisions, and stores audit metadata.
- **Persistence**: Prisma schema and migrations are planned for schema changes; table ownership and indexes/pagination are accounted for.
- **API Contract**: Request DTOs, response DTOs, auth/ownership, error mapping, and frontend-facing documentation are planned.
- **Testing**: Risk-based tests are planned, with mandatory coverage for important status transitions and AI failure paths.
- **Operations/Security**: Environment variables are documented when added; secrets are not hardcoded or logged; Docker/local flow remains valid.

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
│       ├── README.md
│       ├── presentation/      # controllers, request/response DTOs, guards, presenters when exposed over HTTP
│       ├── application/       # use cases, input/output DTOs, ports, orchestration when workflow is needed
│       ├── domain/            # entities, policies, value objects, domain errors/events when invariants exist
│       └── infrastructure/    # Prisma repositories, external clients, jobs, mappers when adapters are needed
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

**Structure Decision**: [Document the selected owning module, added boundaries, and why each new folder/file is needed now]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., cross-module read path] | [current need] | [why public reader/service/event is insufficient] |
| [e.g., new shared capability] | [specific reusable technical need] | [why module-local code is insufficient] |
