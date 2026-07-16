<!--
Sync Impact Report
Version change: 0.0.0 -> 1.0.0
Modified principles:
- Template placeholder -> I. Feature-First Modular Ownership
- Template placeholder -> II. Thin Controllers and Use Case Workflow
- Template placeholder -> III. Domain Rules and Deterministic Decisions
- Template placeholder -> IV. AI Boundary and Auditability
- Template placeholder -> V. Database, API, and Test Discipline
Added sections:
- Backend Constraints
- Development Workflow
Removed sections:
- None
Templates requiring updates:
- updated: .specify/templates/plan-template.md
- updated: .specify/templates/spec-template.md
- updated: .specify/templates/tasks-template.md
- reviewed: .specify/templates/checklist-template.md
- not present: .specify/templates/commands/*.md
Follow-up TODOs:
- None
-->
# Share-k Backend Constitution

## Core Principles

### I. Feature-First Modular Ownership
Share-k backend is a NestJS feature-first modular monolith. Every business
capability MUST live in its owning module under `src/modules/<module-name>/`.
Modules start with the smallest useful shape and add `presentation/`,
`application/`, `domain/`, or `infrastructure/` only when real code needs that
boundary. Empty architecture folders and `.gitkeep` placeholder trees are
prohibited.

Each persistent business table MUST have one owning module, and only that module
may write the table. Cross-module collaboration MUST use public application
services, reader ports, or events. Importing another module's private
infrastructure is prohibited because it bypasses ownership and makes business
state harder to reason about.

### II. Thin Controllers and Use Case Workflow
HTTP features MUST follow this flow:
`controller -> request DTO validation -> use case -> domain/policy -> port or repository -> response DTO`.
Controllers define routes, validate request DTOs, read authenticated user
context, call one use case, and return stable response DTOs. Controllers MUST
NOT query Prisma directly, call the FastAPI AI service directly, calculate
eligibility, change application status by themselves, or calculate reputation.

Use cases MUST receive explicit input DTOs, check authorization and ownership,
load data through ports or repositories, apply domain rules, save through the
owning module, emit events after facts occur, and return output DTOs. This keeps
workflow coordination testable and prevents HTTP concerns from becoming business
logic.

### III. Domain Rules and Deterministic Decisions
Business invariants MUST live in use cases or domain code, never in controllers
or infrastructure adapters. This includes application status transitions, skill
approval invariants, delivery approval rules, reputation score limits, and
subscription limit policies. Important status transitions MUST have automated
tests.

Domain code MUST NOT import NestJS decorators, Prisma client, HTTP clients,
model provider SDKs, AI service clients, or environment configuration. Domain
decisions must be deterministic and reviewable so product rules remain stable
when infrastructure changes.

### IV. AI Boundary and Auditability
AI implementation lives in the separate FastAPI AI repository. The NestJS
backend MUST call AI capabilities through explicit ports/adapters, validate
structured responses, apply deterministic policy, and own all final business
decisions. AI output MUST NOT directly approve skills, accept applications,
reject contributors without policy checks, or update reputation.

Every AI-generated or AI-assisted result that affects business workflow MUST
store an audit snapshot with provider, model, prompt version where applicable,
schema version, AI service version, confidence, evidence IDs, recommendation,
backend final decision, failure reason where applicable, and timestamp. Timeout,
malformed output, low confidence, or missing evidence MUST route to retry,
manual review, or clear user-safe failure handling rather than silent approval.

### V. Database, API, and Test Discipline
Prisma owns schema and migrations. Any schema change MUST update
`prisma/schema.prisma` and add a Prisma migration. PostgreSQL with pgvector is
the MVP database; Redis and BullMQ are used for async jobs when the feature
requires them. Secrets, model keys, OAuth tokens, and provider credentials MUST
NOT be hardcoded or logged.

Public APIs MUST validate input DTOs, return stable response DTOs instead of raw
database rows, document frontend-facing contracts, use pagination for list
endpoints, and map domain or application errors through global error handling.
Tests MUST scale with risk: domain tests for business rules, use-case tests with
fake ports for workflow decisions, repository integration tests for Prisma
behavior, adapter tests for GitHub/FastAPI edge cases, and E2E tests for core
product flows.

## Backend Constraints

The backend stack is NestJS, TypeScript, Prisma, PostgreSQL with pgvector,
BullMQ, Redis, and Docker Compose. The frontend lives in a separate Next.js
repository and calls only the NestJS backend. The FastAPI AI repository owns
model/provider calls, prompt execution, Python AI tooling, embedding generation,
and AI-service-specific tests.

The allowed shared folder scope is technical infrastructure used by multiple
modules: `shared/database`, `shared/auth`, `shared/errors`, `shared/events`,
`shared/observability`, and shared configuration plumbing. Module-specific
repositories, DTOs, policies, prompts, mappers, and convenience helpers MUST NOT
be placed in `shared/`.

Runtime configuration MUST come from environment variables documented in
`.env.example`. Docker Compose is the default local development path, and local
setup must preserve the API, PostgreSQL with pgvector, and Redis services unless
a task explicitly scopes them out.

## Development Workflow

Every implementation task MUST start from the relevant backlog task, PRD
requirement IDs, owning module, allowed edit scope, required tests, and
definition of done. Before editing code, agents and contributors MUST read the
current sprint/task context, PRD requirements, architecture docs, backend
conventions, AI agent rules, and definition of done.

Implementation plans MUST identify the owning module, route/controller surface,
use case boundaries, domain rules, persistence ownership, external adapters,
API contracts, migrations, audit requirements, and tests. Complexity or
cross-module access that violates this constitution MUST be documented with the
simpler alternative rejected and the reason it cannot satisfy the feature.

A backend task is complete only when acceptance criteria are implemented or
explicitly deferred, relevant tests/checks have been run, migrations and
environment docs are updated when needed, no secrets are introduced, and the
summary reports files changed, requirement or task IDs covered, tests run,
migrations added, known risks, and follow-up work.

## Governance

This constitution supersedes conflicting informal notes and generic Spec Kit
template guidance for the Share-k backend. When documents conflict, apply this
order: current sprint/task brief, PRD requirement IDs, backend architecture ADR,
this constitution and backend docs, then older notes or chat history.

Amendments require a documented reason, semantic version update, sync impact
report, and review of dependent Spec Kit templates and runtime guidance docs.
Versioning follows SemVer: MAJOR for backward-incompatible governance or
principle redefinitions, MINOR for new principles or materially expanded
guidance, and PATCH for clarifications that do not change required behavior.

Compliance review is required during planning, implementation review, and final
task summary. Any violation MUST either be fixed before completion or listed in
the plan's complexity tracking with an explicit rationale and follow-up owner.

**Version**: 1.0.0 | **Ratified**: 2026-07-10 | **Last Amended**: 2026-07-10
