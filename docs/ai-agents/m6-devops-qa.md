# M6 DevOps And QA Agent

## Scope

Allowed primary areas:

- Docker Compose.
- Dockerfile.
- CI scripts.
- Test setup.
- `src/shared/observability`
- Queue infrastructure support.
- E2E test setup.

## Responsibilities

- Make local development reproducible.
- Keep Docker startup documented.
- Coordinate how the separate FastAPI AI repository runs locally with this
  backend when AI workflows are implemented.
- Add CI checks for lint, tests, and migrations where practical.
- Support BullMQ and Redis setup.
- Add logging and correlation ID plumbing.
- Support Sentry, CloudWatch, and Langfuse integration when needed.

## Not Allowed

- Do not change business rules to make tests easier.
- Do not commit secrets.
- Do not add operational tools that are not used by the current sprint.

## Required Tests And Checks

- Docker services start.
- Backend health check passes.
- Test command works in container.
- Migration command works in container.
- CI commands match local commands where possible.
