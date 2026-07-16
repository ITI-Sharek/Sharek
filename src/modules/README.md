# Backend Modules

Business code is organized by feature. Each module owns a capability, its
business decisions, and its database writes.

| Module | State | Ownership |
| --- | --- | --- |
| `identity` | implemented | users, auth, sessions, roles, social identity |
| `github` | implemented | GitHub OAuth, account connection, repository evidence |
| `projects` | implemented | project import and project-owned state |
| `contributor-profiles` | implemented | contributor profile creation and views |
| `skill-profiles` | implemented | asynchronous skill generation and candidate state |
| `reputation` | partial | reputation summaries and future history |
| `health` | implemented | backend health endpoint |
| `contribution-tasks` | planned | project task requirements and lifecycle |
| `applications` | planned | contributor applications and eligibility |
| `delivery-reviews` | planned | deliveries, reviews, ratings, feedback |
| `admin` | planned | moderation, disputes, reports, queues |
| `ai` | implemented facade | FastAPI client contracts and AI facade |

Small modules use root controller/service files. Larger modules use
`controllers/` and `services/`. Optional folders are created only for real code.

Choose the module that owns the final state. Call another module only through an
exported service, and never write its tables or import its private technical files.

Read `docs/developer-architecture-guide.md`, the module README, and
`docs/module-development-tracker.md` before implementation.
