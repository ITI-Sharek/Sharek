# Backend Modules

Business code is organized by feature, not by global technical layer.

Each module owns its own business capability and database tables. Use
`domain/`, `application/`, `infrastructure/`, and `presentation/` when they add
real value. Do not fill these folders with empty classes just to satisfy the
architecture.

The module tree is progressive. Start with the module file and README, then add
folders only when a real task needs real files inside them.

## Current Modules

| Module | Current State | Owns |
| --- | --- | --- |
| `identity` | Implemented auth endpoints and session handling | Users, roles, sessions, authentication state |
| `github` | Implemented OAuth, account, repository listing, and import snapshot support | GitHub connection metadata and normalized repository data |
| `projects` | Implemented GitHub project import | Project drafts, publication state, owner-controlled metadata |
| `skill-profiles` | Placeholder for upcoming sprint work | Skill candidates, approved skills, evidence, review state |
| `contribution-tasks` | Placeholder for upcoming sprint work | Project contribution tasks and task requirements |
| `applications` | Placeholder for upcoming sprint work | Contributor applications and eligibility state |
| `delivery-reviews` | Placeholder for upcoming sprint work | PR delivery, owner review, ratings, feedback |
| `reputation` | Placeholder for upcoming sprint work | Reputation profile, score history, verified completion signals |
| `admin` | Placeholder for upcoming sprint work | Admin queues, disputes, reports, moderation views |
| `ai` | Prepared ports for FastAPI AI integration | NestJS-side AI contracts, ports, validation, client adapters |
| `health` | Implemented operational health endpoint | Backend health checks |

## How To Add A Feature

1. Choose the owning module by asking which module owns the final business
   state.
2. Add `presentation/` only for HTTP controllers and request/response DTOs.
3. Add `application/` for use cases, ports, mappers, and workflow DTOs.
4. Add `domain/` for important business rules such as status transitions,
   limits, approval rules, and reputation policies.
5. Add `infrastructure/` for Prisma repositories, external clients, queues,
   encryption, and provider-specific technical code.
6. Update the module README when the module gains a new workflow or public API.

For the full teammate guide, read `docs/developer-architecture-guide.md`.
For the module status dashboard and task checklist, read
`docs/module-development-tracker.md`.
For a copyable example, see `docs/examples/module-skeleton.md`.
