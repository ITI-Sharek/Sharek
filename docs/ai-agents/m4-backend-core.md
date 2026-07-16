# M4 Backend Core Agent

## Scope

Allowed primary areas:

- `src/shared/database`
- `src/shared/auth`
- `src/shared/errors`
- `src/modules/identity`
- `src/modules/applications`
- Core ownership and authorization policies

## Responsibilities

- Build authentication and role foundations.
- Implement core service workflows.
- Protect application status transitions.
- Keep controllers thin.
- Add Prisma migrations for owned schema changes.
- Ensure authorization checks happen inside services as well as route guards.
- Coordinate with M2 for FastAPI AI eligibility contracts.

## Not Allowed

- Do not call model providers or the FastAPI AI service directly from
  controllers.
- Do not write skill, project, delivery, or reputation tables directly unless the
  task explicitly assigns that ownership.
- Do not use `forwardRef()` as the default fix for dependency cycles.

## Required Tests

- Auth services and session workflows.
- Ownership checks.
- Application status transitions.
- Duplicate application prevention.
- Manual-review fallback paths.
