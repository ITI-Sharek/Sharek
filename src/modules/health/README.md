# Health Module

Owns operational backend health checks.

Health answers these questions:

- Is the backend process reachable?
- Can deployment or local development tooling verify the API is alive?
- What minimal operational status can be checked without touching business
  workflows?

Implemented endpoint:

- `GET /health`

## Current Structure

```text
health/
  health.module.ts
  health.controller.ts
  health.response.ts
  health.controller.spec.ts
```

This module stays flat because it is operational and simple. It does not need
`domain/`, `application/`, `infrastructure/`, or `presentation/` unless health
checks become more complex.

## Where To Put New Files

- Keep simple health response DTOs beside the controller.
- Add tests beside the controller.
- Add a deeper structure only if health checks start coordinating database,
  Redis, external service, or readiness checks with real behavior.

## Boundaries

Do not put business logic in this module. Health checks should not create users,
connect GitHub, modify projects, run AI decisions, or update reputation.
