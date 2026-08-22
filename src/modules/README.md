# Backend Modules

Business code is organized by feature. Each module owns a capability, its
business decisions, and its database writes.

| Module | State | Ownership |
| --- | --- | --- |
| `identity` | implemented | users, auth, sessions, roles, social identity |
| `github` | implemented | GitHub OAuth, account connection, repository evidence |
| `github-identity` | implemented | leaf read model for the GitHub identity linked to a user (breaks the identity/github cycle) |
| `projects` | implemented | project import and project-owned state |
| `contributor-profiles` | implemented | contributor profile creation and views |
| `skill-profiles` | implemented | asynchronous skill generation and candidate state |
| `notifications` | implemented | in-app notification rows and notification writes |
| `reputation` | partial | reputation summaries and future history |
| `subscriptions` | implemented | plan entitlements and every plan limit in the backend |
| `payments` | implemented (isolated sandbox) | Paymob provider, idempotent checkout/status, verified callbacks, and payment attempts |
| `matching` | implemented | deterministic contributor-to-Request shortlist, pull-only |
| `health` | implemented | backend health endpoint |
| `contribution-tasks` | implemented | project task requirements and lifecycle |
| `applications` | implemented | contributor applications and owner review |
| `delivery-reviews` | implemented | deliveries, reviews, ratings, feedback |
| `admin` | planned | moderation, disputes, reports, queues |
| `ai` | implemented facade | FastAPI client contracts and AI facade |
| `skill-guidance` | implemented | explicit contributor guidance workflow and source-scoped AI recommendations |

Small modules use root controller/service files. Larger modules use
`controllers/` and `services/`. Optional folders are created only for real code.

Choose the module that owns the final state. Call another module only through an
exported service, and never write its tables or import its private technical files.

Read `docs/developer-architecture-guide.md`, the module README, and
`docs/module-development-tracker.md` before implementation.
