# ADR-001: Backend Architecture

Status: accepted

Date: 2026-07-03

## Context

Share-k needs a backend that supports authentication, GitHub integration,
AI-assisted skill profiling, project publishing, contribution tasks,
AI-assisted application validation, delivery review, reputation, admin review,
and future premium features.

The team now plans to keep AI implementation work in a separate AI repository
implemented with FastAPI. That repository owns model/provider calls,
Python-specific AI tooling, prompt execution, embedding generation, and AI
service-specific tests.

The team also wants a setup that works well with AI coding agents and Docker
local development.

## Decision

Use a NestJS feature-first modular monolith for the backend.

Integrate AI through a separate FastAPI AI service/repository. The NestJS
backend calls that service through narrow ports/adapters and remains the owner
of business state, database writes, authorization, audit snapshots, and final
workflow decisions.

Use PostgreSQL with pgvector as the main database.

Use Prisma for schema and migrations.

Use BullMQ with Redis for asynchronous jobs when needed.

Use Docker Compose for local development.

## Rationale

A modular monolith keeps deployment, debugging, and transactions simpler than
early microservices while still giving each business area a clear boundary.

Separating AI into a FastAPI repository lets the AI team use Python-native
libraries and iterate on model orchestration without coupling provider logic to
the NestJS business backend. The tradeoff is that the service contract must be
kept explicit and tested to avoid DTO drift between repositories.

PostgreSQL with pgvector reduces infrastructure count while supporting both
relational data and MVP semantic search or matching. A dedicated vector database
can be introduced later if measured workload requires it.

## Consequences

- Modules must protect their own table ownership.
- Controllers must stay thin.
- Business decisions remain in backend use cases and domain policies.
- AI output is a recommendation, not the final authority.
- Provider-specific AI code belongs in the FastAPI AI repository.
- NestJS AI adapters must call the FastAPI service, validate responses, apply
  backend policy, and persist audit snapshots through owning modules.
- Docker and tests are part of the foundation, not a final sprint activity.
- Docker integration for the separate AI repository must be decided explicitly;
  it is not added to this backend compose file by default in this ADR.

## Revisit This Decision When

- AI workload needs independent scaling.
- The backend API is blocked by AI latency.
- The service contract between NestJS and FastAPI drifts or becomes hard to
  test.
- pgvector no longer meets retrieval or performance needs.
