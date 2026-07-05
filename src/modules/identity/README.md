# Identity Module

Owns users, roles, sessions, authentication state, and account-level access.

Implemented endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `PATCH /auth/users/:id/role`

Start here for Sprint 1 auth work:

- `domain/entities`: user and session entities when business behavior appears.
- `domain/policies`: role and account-state policies.
- `application/use-cases`: register, login, refresh session, assign role.
- `infrastructure/persistence`: Prisma user/session repositories.
- `presentation/http`: auth and current-user controllers.

Do not put project ownership, application eligibility, or GitHub token logic in
this module.
