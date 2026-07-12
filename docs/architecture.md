# Backend Architecture

## Decision

Share-k backend uses:

```text
NestJS feature-first modular monolith
External FastAPI AI service through backend ports/adapters
PostgreSQL + pgvector
Prisma
BullMQ + Redis for async jobs
Docker Compose for local development
```

The frontend is a separate Next.js repository. The backend remains one deployable
NestJS application for the MVP.

## Why This Choice

This setup is the best fit because Share-k needs strong business consistency
across users, skills, tasks, applications, delivery, reputation, and admin
review. A modular monolith keeps deployment and debugging simple while still
protecting module boundaries.

AI runs in a separate FastAPI repository. That service owns model/provider
calls, prompt execution, Python AI tooling, embedding generation, and AI
service-specific tests. The NestJS backend calls it through explicit contracts
and remains the owner of authorization, business state, database writes, audit
snapshots, and final workflow decisions.

PostgreSQL with pgvector is enough for MVP semantic search and matching while
avoiding an extra vector database service for backend-owned persisted vectors.
If vector workload becomes large or specialized, the vector adapter can later
move to Pinecone, Qdrant, or another service.

## Target Modules

```text
identity
github
skill-profiles
projects
contribution-tasks
applications
delivery-reviews
reputation
admin
ai
```

## Module Responsibilities

`identity` owns users, roles, authentication, sessions, and account state.

`github` owns OAuth connection metadata, token references, GitHub ingestion, and
normalized repository evidence.

`skill-profiles` owns AI-generated skill candidates, approved skills, evidence,
confidence, and review state.

`projects` owns project drafts, published projects, discovery metadata, and
owner-controlled project state.

`contribution-tasks` owns project tasks, required skills, difficulty, task
status, deadlines, and owner limits.

`applications` owns contributor applications, validation state, AI
recommendation snapshots, manual review, owner acceptance, and status history.

`delivery-reviews` owns PR link submission, delivery state, owner review,
ratings, and feedback.

`reputation` owns reputation profiles, score history, verified completion
counts, and reputation calculations.

`admin` owns admin queues, review workflows, disputes, reports, moderation
actions, and audit views. It does not own the underlying business entities from
other modules.

`ai` owns the NestJS-side AI service gateway: request/response contracts,
FastAPI client adapters, response validation, timeout/retry behavior, and
reusable AI integration errors. Provider-specific prompts and model clients
belong in the FastAPI AI repository.

## Layering Rule

Important modules may use:

```text
domain/
application/
infrastructure/
presentation/
```

Simple modules may start smaller. Do not create empty directories only to look
architectural.

For practical file-placement rules and examples from the current codebase, use
`docs/developer-architecture-guide.md`.

## Dependency Rules

- Controllers call use cases.
- Use cases coordinate business rules and ports.
- Domain code does not import NestJS, Prisma, HTTP clients, model SDKs, or AI
  service clients.
- Infrastructure implements repositories, FastAPI AI clients, GitHub clients,
  and queue workers.
- Other modules consume public APIs, reader ports, or events.
- Other modules do not import private repositories or infrastructure classes.
- Cross-module dependency is allowed when it is explicit, narrow, and owned by
  the provider module.

## AI Service Rule

The FastAPI AI service returns recommendations. Backend use cases make final
decisions.

For example:

```text
FastAPI recommendation: manual_review, confidence 0.68
Backend decision: store manual_review, create audit snapshot, route to admin
```

Never allow AI output to directly approve skills, accept applications, reject
contributors without policy checks, or update reputation.

## FastAPI Boundary

The FastAPI AI repository should expose stable HTTP contracts for:

- skill profile generation
- eligibility analysis
- skill gap guidance
- embeddings or retrieval assistance

The backend should call the AI service through ports, validate all responses,
store audit metadata, and use deterministic policy before changing business
state.
