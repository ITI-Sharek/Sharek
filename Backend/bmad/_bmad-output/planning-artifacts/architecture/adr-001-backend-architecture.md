# ADR-001: Backend Architecture

Status: accepted

Date: 2026-07-03

## Context

Share-k needs a backend that supports authentication, GitHub integration,
AI-assisted skill profiling, project publishing, contribution tasks,
AI-assisted application validation, delivery review, reputation, admin review,
and future premium features.

The team expects to use ready model APIs rather than train custom models.

The team also wants a setup that works well with AI coding agents and Docker
local development.

## Decision

Use a NestJS feature-first modular monolith for the backend.

Use AI inside NestJS through ports/adapters for the MVP.

Use PostgreSQL with pgvector as the main database.

Use Prisma for schema and migrations.

Use BullMQ with Redis for asynchronous jobs when needed.

Use Docker Compose for local development.

## Rationale

A modular monolith keeps deployment, debugging, and transactions simpler than
early microservices while still giving each business area a clear boundary.

Keeping AI inside NestJS is appropriate because the MVP uses ready model APIs.
This avoids a separate FastAPI service, duplicate DTO definitions, extra
network hops, and contract drift during early development.

PostgreSQL with pgvector reduces infrastructure count while supporting both
relational data and MVP semantic search or matching. A dedicated vector database
can be introduced later if measured workload requires it.

## Consequences

- Modules must protect their own table ownership.
- Controllers must stay thin.
- Business decisions remain in backend use cases and domain policies.
- AI output is a recommendation, not the final authority.
- Provider-specific AI code must stay behind adapters.
- Docker and tests are part of the foundation, not a final sprint activity.

## Revisit This Decision When

- Python-only AI tooling becomes required.
- AI workload needs independent scaling.
- The backend API is blocked by AI latency.
- The AI boundary is stable enough to extract.
- pgvector no longer meets retrieval or performance needs.

