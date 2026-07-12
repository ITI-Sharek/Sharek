# Developer Architecture Guide

This guide explains how to work inside the Share-k backend architecture without
guessing where files should go.

Use this when you are about to add or change backend code. It translates the
architecture decision into daily development rules for teammates.

For the required per-task checklist, module status dashboard, and change record
process, also use `docs/module-development-tracker.md`.

## Final Backend Shape

Share-k backend is a:

```text
NestJS feature-first modular monolith
with lightweight Clean Architecture inside important modules
```

That means:

- One NestJS backend application is deployed for the MVP.
- Code is grouped first by business feature, not by technical folder.
- Each business module owns its behavior and database tables.
- Larger modules may use `presentation`, `application`, `domain`, and
  `infrastructure` folders.
- Small modules stay small until they need more structure.
- The separate FastAPI AI service gives recommendations. NestJS owns the final
  business decision and database writes.

## Root Folder Map

```text
Backend/
  src/                  NestJS application code
  prisma/               Prisma schema, migrations, and seed file
  docs/                 Backend operating and architecture docs
  bmad/                 Product, planning, backlog, and BMAD artifacts
  test/                 Shared test setup and future E2E setup
  sharek-api.http       REST Client guide for manually trying backend APIs
  Dockerfile            Backend container image definition
  docker-compose.yml    Local backend, PostgreSQL, and Redis stack
  package.json          Scripts and backend dependencies
  AGENTS.md             Required rules for AI coding agents
```

### `src/`

Use `src/` for executable backend source code only.

```text
src/
  main.ts
  app.module.ts
  modules/
  shared/
```

- `main.ts` starts the NestJS HTTP server and global framework setup.
- `app.module.ts` wires the shared infrastructure and business modules.
- `modules/` contains business modules such as identity, GitHub, projects, and
  applications.
- `shared/` contains technical infrastructure used by multiple modules.

### `prisma/`

Use `prisma/` for database schema and migrations.

```text
prisma/
  schema.prisma
  migrations/
  seed.ts
```

Rules:

- Every table must have one owning module.
- Only the owning module should write that table.
- Other modules should read through a public service, reader port, or event
  flow when practical.
- Schema changes must go through Prisma migrations.

### `docs/`

Use `docs/` for team handoff, architecture, conventions, API contracts, local
setup, and sprint process.

When documents conflict, follow `docs/README.md`.

### `bmad/`

Use `bmad/` as planning input, not as executable backend code. It contains
product requirements, backlog, generated planning artifacts, PDFs, and ERD
notes.

### `test/`

Use `test/` for global test setup and future E2E helpers. Unit tests normally
live beside the code they test, such as:

```text
src/modules/github/application/use-cases/github-repository.service.spec.ts
```

## Business Module Map

Business modules live under `src/modules/`.

```text
src/modules/
  identity/
  github/
  skill-profiles/
  projects/
  contributor-profiles/
  contribution-tasks/
  applications/
  delivery-reviews/
  reputation/
  admin/
  ai/
  health/
```

| Module | Owns | Use It When | Do Not Put Here |
| --- | --- | --- | --- |
| `identity` | Users, roles, sessions, auth state | Register, login, refresh, logout, current user, role assignment | GitHub tokens, project ownership rules, application eligibility |
| `github` | GitHub OAuth, linked account, GitHub API normalization | Connecting GitHub, listing repositories, fetching repo snapshots | Share-k project publishing decisions, skill approval decisions |
| `skill-profiles` | Skill candidates, approved skills, evidence, review state | Storing AI-proposed skills, approving/rejecting skills, reading approved skills | Direct model prompts, raw provider clients, application acceptance |
| `projects` | Project drafts, published projects, owner-controlled metadata | Importing from GitHub, editing project details, publishing/archive flow | GitHub OAuth tokens, contribution applications |
| `contributor-profiles` | Contributor profile records and public profile presentation | Ensuring the signed-in contributor profile, loading profile by username, combining approved/public profile summaries | User auth/session ownership, GitHub token storage, skill approval, reputation scoring |
| `contribution-tasks` | Tasks under projects | Creating tasks, required skills, difficulty, deadlines, capacity, task status | Contributor application status, reputation scoring |
| `applications` | Contributor applications and eligibility state | Applying to tasks, duplicate checks, AI recommendation snapshots, manual review, owner decision | Task creation, skill approval, reputation updates |
| `delivery-reviews` | Work delivery and owner review | PR link submission, delivery status, approval/rejection, ratings, feedback | Reputation score calculation |
| `reputation` | Reputation profile and score history | Recording verified completions, recalculating score, public reputation summaries | Delivery review ownership, raw AI claims |
| `admin` | Admin-facing queues and moderation workflow | Manual review queues, reports, disputes, moderation actions, audit views | Owning another module's business table |
| `ai` | NestJS-side AI gateway contracts and ports | FastAPI AI client adapters, response validation, AI port definitions, timeout/retry handling | Provider-specific prompts, model SDK code, direct final business decisions |
| `health` | Operational health endpoint | Liveness/readiness style checks | Business workflow logic |

## Module Folder Layers

A module starts small:

```text
src/modules/<module-name>/
  <module-name>.module.ts
  README.md
```

Add deeper folders only when real code needs them:

```text
src/modules/<module-name>/
  domain/
  application/
  infrastructure/
  presentation/
  <module-name>.module.ts
  README.md
```

Do not create empty folders to make the tree look complete. Create the folder
and the first real file in the same task.

### `presentation/`

Use `presentation/` for the HTTP edge of a module.

Common files:

```text
presentation/
  http/
    controllers/
    requests/
    responses/
    guards/
    presenters/
```

Put these here:

- NestJS controllers.
- Request DTOs used for validation.
- Response DTOs returned to the frontend.
- Route-specific guards.
- Presenters that shape application output for HTTP.

Do not put these here:

- Prisma queries.
- Business decisions.
- AI service calls.
- Status transition rules.

Controller rule:

```text
controller -> request DTO -> use case -> response DTO
```

If a controller starts coordinating multiple steps, move that coordination into
`application/`.

### `application/`

Use `application/` for use cases and workflow orchestration.

Common files:

```text
application/
  use-cases/
  dto/
  ports/
  mappers/
```

Put these here:

- Use cases such as `apply-to-task.use-case.ts`.
- Application services such as the current `identity.service.ts`.
- Input/output DTOs that are not raw HTTP request classes.
- Ports/interfaces for things the use case needs from another module or an
  external system.
- Mappers that convert domain or database records into application DTOs.

Use cases should:

- Check authorization and ownership.
- Load data through repositories, ports, or approved public services.
- Coordinate domain rules.
- Save through the owning module.
- Emit events when another module should react.
- Return stable DTOs.

Do not put provider SDK calls, raw prompt logic, or HTTP controller logic here.

### `domain/`

Use `domain/` for business rules that must stay true no matter how the feature
is triggered.

Common files:

```text
domain/
  entities/
  value-objects/
  enums/
  events/
  exceptions/
  policies/
  contracts/
```

Put these here:

- Entities with lifecycle and identity.
- Value objects with validation.
- Policies such as owner limit, eligibility, approval, or reputation rules.
- Domain events such as `delivery-approved.event.ts`.
- Domain errors for invalid business operations.

Create `domain/` when the module has real business invariants, for example:

- Application status transitions.
- Skill approval and rejection rules.
- Task capacity limits.
- Delivery approval rules.
- Reputation score limits.

Domain code must not import:

- NestJS decorators.
- Prisma client.
- HTTP clients.
- Config service.
- FastAPI clients.
- Model provider SDKs.

### `infrastructure/`

Use `infrastructure/` for technical implementations behind the business use
case.

Common files:

```text
infrastructure/
  persistence/
  integrations/
  jobs/
  security/
```

Put these here:

- Prisma repositories and persistence mappers.
- GitHub API clients.
- FastAPI AI HTTP clients.
- Queue workers and job processors.
- Token encryption, hashing, or provider-specific technical services.

Do not import another module's private infrastructure from here. If another
module needs data, expose a narrow public application service, reader port, or
event.

## Common File Types

| File Type | Example | Folder | Purpose |
| --- | --- | --- | --- |
| NestJS module | `projects.module.ts` | module root | Registers controllers, providers, imports, and exports |
| Controller | `projects.controller.ts` | `presentation/http/controllers` | Defines HTTP routes and calls one use case/service |
| Request DTO | `import-github-project.request.ts` | `presentation/http/requests` | Validates incoming HTTP body/query/params |
| Response DTO | `project.response.ts` | `presentation/http/responses` | Stabilizes frontend response shape |
| Use case/service | `project-import.service.ts` | `application/use-cases` | Coordinates the business workflow |
| Application DTO | `imported-project.dto.ts` | `application/dto` | Represents use case output/input inside the app |
| Mapper | `project.mapper.ts` | `application/mappers` | Converts database/domain records into DTOs |
| Port | `eligibility-analyzer.port.ts` | `application/ports` | Defines a dependency contract |
| Repository | `project.repository.prisma.ts` | `infrastructure/persistence` | Implements persistence for the owning module |
| External client | `fastapi-ai.client.ts` | `infrastructure/integrations` | Calls another service or provider |
| Entity | `application.entity.ts` | `domain/entities` | Protects lifecycle and status changes |
| Policy | `task-capacity.policy.ts` | `domain/policies` | Encapsulates business rule decisions |
| Domain event | `delivery-approved.event.ts` | `domain/events` | Records a business fact that happened |
| Unit test | `*.spec.ts` | Beside tested file | Tests the behavior closest to the code |

## How To Build A Feature

Use this flow before writing code.

### 1. Find The Owning Module

Ask: which business capability owns the final state?

Examples:

- Register/login: `identity`.
- Connect GitHub: `github`.
- Import a repo as a Share-k project: `projects`.
- Apply to a task: `applications`.
- Approve delivered work: `delivery-reviews`.
- Recalculate reputation: `reputation`.

If the feature touches multiple modules, the module that owns the final state
should own the main use case. Other modules should expose data through a public
service, reader port, or event.

### 2. Decide Which Folders Are Needed

Use this decision:

- New HTTP endpoint? Add or update `presentation/`.
- Workflow with authorization, reads, writes, or cross-module calls? Add or
  update `application/`.
- Important status transition, limit, or rule? Add or update `domain/`.
- Database repository, external API call, AI client, queue, encryption? Add or
  update `infrastructure/`.

Small CRUD-like work may not need every layer immediately. Important workflows
should become more explicit.

### 3. Keep The Direction Of Calls Clean

Normal HTTP feature:

```text
controller
  -> request DTO validation
  -> application use case
  -> domain entity/policy when needed
  -> repository/port/public service
  -> mapper
  -> response DTO
```

AI-backed feature:

```text
application use case
  -> deterministic backend checks
  -> AI port
  -> FastAPI AI adapter
  -> validate structured recommendation
  -> backend policy decision
  -> audit snapshot
  -> owning module state update
```

Event-backed reaction:

```text
module A completes a fact
  -> emits event
  -> module B reacts
  -> module B writes only its own tables
```

Example:

```text
delivery-reviews approves a delivery
  -> DeliveryApproved event
  -> reputation updates reputation records
```

### 4. Register New Providers

After adding a controller or service, register it in the module file.

Example:

```typescript
@Module({
  imports: [GithubModule],
  controllers: [ProjectsController],
  providers: [ProjectImportService],
})
export class ProjectsModule {}
```

Export a provider only when another module truly needs it. Keep exports narrow.

### 5. Add Tests Based On Risk

Use this rule:

- Domain rule added? Add a domain unit test.
- Use case coordinates important workflow? Add a use-case test with fakes or
  mocks.
- External adapter added? Test timeout, malformed response, missing config, and
  failure cases.
- Core user flow changed? Add or update E2E/API tests when available.

Status transitions and AI decision workflows must be tested.

## Current Implemented Examples

### Identity Auth Flow

Current files:

```text
identity/
  identity.module.ts
  application/
    dto/auth-session.dto.ts
    mappers/auth-user.mapper.ts
    use-cases/identity.service.ts
  infrastructure/
    security/password-hasher.service.ts
    security/session-token.service.ts
  presentation/
    http/controllers/identity.controller.ts
    http/requests/register.request.ts
    http/requests/login.request.ts
    http/requests/refresh-session.request.ts
    http/requests/assign-role.request.ts
```

Current flow:

```text
IdentityController
  -> RegisterRequest/LoginRequest
  -> IdentityService
  -> DatabaseService + PasswordHasher + SessionTokenService
  -> auth-user mapper
  -> AuthSessionDto/AuthUserDto
```

Why there is no `domain/` yet:

The current auth code has business checks, but no separate entity or policy has
been extracted yet. Add `domain/` later if account-state rules, role policies,
or session lifecycle rules become harder to keep inside the use case.

### GitHub Connection Flow

Current files:

```text
github/
  github.module.ts
  application/
    dto/github-account.dto.ts
    dto/github-repository.dto.ts
    mappers/github-account.mapper.ts
    use-cases/github-oauth.service.ts
    use-cases/github-repository.service.ts
  infrastructure/
    integrations/github-api.client.ts
    security/github-token-encryption.service.ts
  presentation/
    http/controllers/github-oauth.controller.ts
    http/requests/github-oauth-callback.request.ts
```

Current flow:

```text
GitHubOAuthController
  -> GitHubOAuthService or GitHubRepositoryService
  -> GitHubApiClient
  -> encrypted token storage through GitHubTokenEncryptionService
  -> GitHubAccountDto/GitHubRepositoryDto/GitHubRepositoryImportSnapshot
```

Important boundary:

GitHub owns the connection and normalized repository data. It does not own the
Share-k project publication decision.

`GitHubRepositoryService` is the public application service for normalized
repository evidence. It may fetch README content, languages, contribution
activity, recent commit signals, descriptions, and repository statistics. Other
modules should consume the normalized DTO/snapshot instead of calling GitHub or
decrypting GitHub tokens directly.

### Project Import Flow

Current files:

```text
projects/
  projects.module.ts
  application/
    dto/imported-project.dto.ts
    mappers/project.mapper.ts
    use-cases/project-import.service.ts
  presentation/
    http/controllers/projects.controller.ts
    http/requests/import-github-project.request.ts
```

Current flow:

```text
ProjectsController
  -> ImportGitHubProjectRequest
  -> ProjectImportService
  -> GitHubRepositoryService.getImportSnapshot()
  -> DatabaseService project create/update
  -> project mapper
  -> ImportedProjectDto
```

Why `projects` imports `GithubModule`:

Project import needs a normalized repository snapshot. The GitHub module
exports `GitHubRepositoryService` as a public application service. Projects
does not import GitHub infrastructure or decrypt tokens directly.

## Future Feature Example: Apply To Task

When implementing contributor applications, start in `applications` because it
owns application status.

Likely files:

```text
applications/
  applications.module.ts
  README.md
  domain/
    entities/application.entity.ts
    enums/application-status.enum.ts
    exceptions/application-already-exists.error.ts
    exceptions/invalid-application-transition.error.ts
    policies/application-eligibility.policy.ts
  application/
    use-cases/apply-to-task.use-case.ts
    dto/apply-to-task.input.ts
    dto/application.result.ts
    ports/contribution-task.reader.ts
    ports/approved-skills.reader.ts
    ports/eligibility-analyzer.port.ts
  infrastructure/
    persistence/application.repository.prisma.ts
    persistence/application.persistence-mapper.ts
  presentation/
    http/controllers/applications.controller.ts
    http/requests/apply-to-task.request.ts
    http/responses/application.response.ts
```

Flow:

```text
ApplicationsController
  -> ApplyToTaskRequest
  -> ApplyToTaskUseCase
  -> contribution task reader
  -> approved skills reader
  -> eligibility analyzer port
  -> Application entity/policy
  -> application repository
  -> ApplicationResponse
```

Do not let the AI service directly set `applications.status`. It should return
a structured recommendation, then the backend use case decides the stored
state.

## Cross-Module Rules

Allowed:

- A module may depend on another module when that dependency is explicit and
  narrow.
- A module imports another module only when that module exports a public
  application service from its module file.
- A module depends on a port/interface and receives an implementation through
  NestJS dependency injection.
- A module reacts to an event after another module has completed a business
  fact.
- A module may read another module's data only through a reader port, public
  service, or read model agreed by the owning module.

Not allowed:

- Importing another module's `infrastructure/` files.
- Writing another module's database tables directly.
- Putting shared business logic in `src/shared/`.
- Calling FastAPI AI or model providers from controllers.
- Returning raw Prisma rows as public API contracts.

## Shared Folder Rules

`src/shared/` is for technical infrastructure used across multiple modules.

Allowed:

```text
shared/auth
shared/config
shared/database
shared/errors
shared/events
shared/observability
```

Do not put these in `shared/`:

- Project business rules.
- Application eligibility rules.
- Skill approval rules.
- Reputation formulas.
- Module-specific repositories.
- Module-specific DTOs.
- AI prompts.
- Helpers used by only one module.

## AI Boundary

The FastAPI AI service owns AI computation:

- model/provider calls
- prompts
- embeddings generation
- Python AI tooling
- AI-service-specific tests

The NestJS backend owns business decisions:

- authorization
- account state
- approved skill state
- application state
- delivery state
- reputation state
- admin decisions
- audit snapshots

Correct AI decision flow:

```text
FastAPI returns recommendation
  -> NestJS validates schema
  -> NestJS applies deterministic policy
  -> NestJS stores audit metadata
  -> owning module updates state
```

Wrong flow:

```text
FastAPI directly approves a skill
FastAPI directly accepts an application
Frontend calls model provider directly
Controller accepts AI output and writes final state without policy checks
```

## Before Opening A Pull Request

Check these:

- The feature is in the owning module.
- Controllers are thin.
- Use cases contain workflow coordination.
- Important business rules are in domain entities or policies.
- External systems are behind infrastructure adapters or ports.
- Cross-module dependencies use public services, reader ports, or events.
- No module writes another module's tables directly.
- No module imports another module's private infrastructure.
- `shared/` contains only technical cross-cutting code.
- Request and response DTOs are stable and documented when frontend-facing.
- Tests match the risk of the change.
- Relevant README or docs were updated if the module shape changed.
- `docs/module-development-tracker.md` has a short change record for the task.
