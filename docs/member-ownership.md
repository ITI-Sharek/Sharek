# Member Ownership

This file maps team roles to backend responsibilities and AI coding agent scope.

## M1 - UI/UX and Testing

Backend-facing scope:

- Accessibility acceptance criteria.
- API behavior expectations from user flows.
- E2E test scenarios.
- Bilingual and RTL expectations that affect API responses or validation.

M1 should not own backend modules but may define acceptance tests and demo
scenarios.

## M2 - AI Engineer

Primary backend scope:

- `modules/ai`
- AI ports and adapters used by `skill-profiles` and `applications`
- Skill profile generation contracts.
- Eligibility analyzer contracts.
- Skill gap guidance contracts.
- Embedding generation and pgvector usage.
- AI audit metadata.
- Model output validation.

M2 must not bypass backend business rules. AI produces recommendations only.

## M3 - Frontend and Integration

Backend-facing scope:

- API contract feedback.
- Request and response DTO expectations.
- Frontend integration test scenarios.

M3 does not own backend modules but should coordinate with backend owners before
requesting API shape changes.

## M4 - Backend Core

Primary backend scope:

- `shared/database`
- `shared/auth`
- `shared/errors`
- `identity`
- `applications`
- Core authorization and ownership checks.
- Application status transitions.

M4 should protect the core business workflow and keep controllers thin.

## M5 - Backend Integration and Cloud

Primary backend scope:

- `github`
- `projects`
- `contribution-tasks`
- `delivery-reviews`
- Deployment readiness.
- Docker and environment integration with M6.
- Production configuration support.

M5 should coordinate with M4 on cross-module workflows and with M2 on evidence
used by AI.

## M6 - DevOps and QA Automation

Primary backend scope:

- Docker Compose.
- CI checks.
- Test infrastructure.
- BullMQ and Redis setup support.
- Observability, logs, correlation IDs, Sentry, CloudWatch, and Langfuse
  integration support.
- E2E test execution.

M6 should not own business logic but should enforce repeatable local and CI
execution.

## Handoff Rules

- Schema changes must be communicated to all affected owners.
- API changes must be communicated to frontend integration.
- AI contract changes must be communicated to backend owners before merge.
- Shared changes require extra review because they affect multiple modules.

