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
- Implement core use cases.
- Protect application status transitions.
- Keep controllers thin.
- Add Prisma migrations for owned schema changes.
- Ensure authorization checks happen inside use cases.
- Coordinate with M2 for AI eligibility adapters.

## Not Allowed

- Do not call model providers directly from controllers.
- Do not write skill, project, delivery, or reputation tables directly unless the
  task explicitly assigns that ownership.
- Do not use `forwardRef()` as the default fix for dependency cycles.

## Required Tests

- Auth use cases.
- Ownership checks.
- Application status transitions.
- Duplicate application prevention.
- Manual-review fallback paths.

