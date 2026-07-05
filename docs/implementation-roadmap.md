# Implementation Roadmap

Build the backend gradually. Do not build every module at full depth on day one.

## Phase 1 - Foundation

Goal: make the backend runnable, testable, and repeatable.

Deliverables:

- NestJS app scaffold.
- Docker Compose with backend, PostgreSQL pgvector, and Redis.
- Prisma setup and first migration.
- Environment validation.
- Health endpoint.
- Global error filter.
- Logging and correlation ID basics.
- Test setup.

Primary owners: M4, M6.

## Phase 2 - Identity and GitHub Foundation

Goal: users can authenticate and connect GitHub.

Deliverables:

- Identity module.
- JWT/session flow.
- Role support for contributor, owner, admin.
- GitHub OAuth connection metadata.
- Secure token storage or token reference strategy.
- GitHub repository metadata normalization.

Primary owners: M4, M5.

## Phase 3 - First Trust Loop

Goal: prove the core Share-k trust workflow.

Deliverables:

- Skill profile candidate generation.
- FastAPI AI service contract and NestJS client adapter.
- Pending skills.
- Admin approval/rejection.
- Project draft and publish flow.
- Contribution task creation.
- Application submission.
- Eligibility recommendation and manual review fallback.

Primary owners: M2, M4, M5.

## Phase 4 - Verified Outcomes

Goal: make completed work feed reputation.

Deliverables:

- Delivery PR link submission.
- Owner delivery review.
- Ratings and feedback.
- DeliveryApproved event.
- Reputation profile and score history.

Primary owners: M4, M5.

## Phase 5 - Operational Hardening

Goal: make the backend reliable for demo and deployment.

Deliverables:

- BullMQ jobs for slow work.
- Retry and timeout policies.
- Durable outbox when losing events would corrupt state.
- API contract tests.
- E2E tests for critical flows.
- CI pipeline.
- Observability and error monitoring.
- Performance indexes.

Primary owners: M6 with backend owners.

## Later Enhancements

Add these only after the core MVP is reliable:

- Premium plan enforcement.
- Advanced matching.
- Notifications.
- More sophisticated vector retrieval.
- Independent AI service scaling and deployment hardening.
