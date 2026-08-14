# Shared Backend Infrastructure

`shared/` contains technical capabilities used by multiple modules.

Shared answers this question:

- Is this technical code genuinely reused across modules without belonging to a
  specific business capability?

Allowed examples:

- database setup
- auth request plumbing
- shared error handling
- event transport
- observability
- configuration validation

Do not place module-specific business rules, repositories, DTOs, prompts, or
helper functions here for convenience.

## Current Folders

```text
shared/
  auth/
  config/
  database/
  errors/
  events/
  observability/
  realtime/
  skills/
```

Use them like this:

- `skills`: skill-name normalization. It is here, not in a module, because
  `contribution-tasks` stores the normalized form under a unique index and
  `matching` compares against the same form — if the two ever diverged, a
  contributor could be shortlisted for a Request they are then blocked from
  applying to. It is string handling, not a business rule.
- `auth`: request-level auth plumbing, guards, decorators, token hash helpers,
  and authenticated request types.
- `config`: environment validation and shared configuration setup.
- `database`: Prisma connection service and database module.
- `errors`: cross-cutting application error type and HTTP exception mapping.
- `events`: shared event transport infrastructure.
- `observability`: logging, tracing, metrics, and monitoring plumbing.
- `realtime`: the generic authenticated `/realtime` Socket.IO transport,
  versioned event envelopes, per-user rooms, and Redis fan-out adapter.

## What Does Not Belong Here

Do not put these in `shared/`:

- application eligibility rules
- project publication rules
- skill approval rules
- reputation score formulas
- module-specific repositories
- module-specific DTOs
- GitHub-specific workflow logic
- AI prompts or provider-specific code
- helpers used by only one module

If code belongs to one business module today, keep it in that module. Move it to
`shared/` only when at least two modules need the same technical capability and
it has no business ownership.
