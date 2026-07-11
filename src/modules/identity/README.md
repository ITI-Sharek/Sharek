# Identity Module

Owns users, roles, sessions, authentication state, and account-level access.

For contributor profile redirect, identity also owns `User.username` because
the value is stored on the user record and returned in auth user DTOs.

Implemented endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `PATCH /auth/users/:id/role`

Contributor redirect notes:

- `POST /auth/login` and `GET /auth/me` include `username` in the public user
  DTO.
- Contributor usernames are generated from name/email source data, normalized
  to `^[a-z0-9][a-z0-9_-]{2,29}$`, and retried with deterministic suffixes.
- Active users can authenticate; pending contributors can authenticate for the
  redirect/profile flow; suspended and deactivated users remain blocked.
- Username writes stay in identity and are exposed through
  `IdentityUsernameService`.

Start here for Sprint 1 auth work:

- `domain/entities`: user and session entities when business behavior appears.
- `domain/policies`: role and account-state policies.
- `application/use-cases`: register, login, refresh session, assign role.
- `infrastructure/persistence`: Prisma user/session repositories.
- `presentation/http`: auth and current-user controllers.

Do not put project ownership, application eligibility, or GitHub token logic in
this module.
