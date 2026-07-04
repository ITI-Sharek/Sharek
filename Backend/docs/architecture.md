# Backend Architecture

## Decision

Share-k backend uses:

```text
NestJS feature-first modular monolith
AI inside NestJS through ports/adapters
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

AI stays inside NestJS for the MVP because Share-k will use ready model APIs,
not custom model training. A separate FastAPI service can be introduced later if
Python-specific AI tooling, independent scaling, or failure isolation becomes
worth the added integration cost.

PostgreSQL with pgvector is enough for MVP semantic search and matching while
avoiding an extra vector database service. If vector workload becomes large or
specialized, the vector adapter can later move to Pinecone, Qdrant, or another
service.

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

`ai` owns shared AI provider adapters, prompt/schema infrastructure, structured
model calls, embedding adapters, and reusable AI error handling.

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

## Dependency Rules

- Controllers call use cases.
- Use cases coordinate business rules and ports.
- Domain code does not import NestJS, Prisma, HTTP clients, or model SDKs.
- Infrastructure implements repositories, model providers, GitHub clients, and
  queue workers.
- Other modules consume public APIs, reader ports, or events.
- Other modules do not import private repositories or infrastructure classes.

## AI Rule

AI adapters return recommendations. Backend use cases make final decisions.

For example:

```text
AI recommendation: manual_review, confidence 0.68
Backend decision: store manual_review, create audit snapshot, route to admin
```

Never allow AI output to directly approve skills, accept applications, reject
contributors without policy checks, or update reputation.

## When To Extract FastAPI Later

Consider a separate AI service only when at least one is true:

- Python-only libraries are required.
- AI jobs need independent scaling.
- The AI workload harms API latency.
- A dedicated AI team needs independent deployment.
- The AI boundary has stayed stable inside the monolith.

