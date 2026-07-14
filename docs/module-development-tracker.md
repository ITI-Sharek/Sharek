# Module Development Tracker

This file is the operational checklist for backend module work.

Use it with `docs/developer-architecture-guide.md`. The architecture guide tells
you where code belongs. This tracker tells you what to read, what to update, and
what proof is needed before a module change is considered ready.

Every teammate or coding agent must update this file when a backend task changes
module behavior, public API shape, database schema, tests, or module ownership.

## Required Agent Workflow

Use this flow for every backend implementation task:

```text
read context
  -> inspect existing module files
  -> identify owning module
  -> implement inside the rules
  -> update docs and tracker
  -> run tests/checks
  -> review the diff
  -> hand off with risks
```

### 1. Read Context First

Before writing code, read:

- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/developer-architecture-guide.md`
- `docs/backend-conventions.md`
- `docs/module-development-tracker.md`
- `docs/definition-of-done.md`
- the target module README under `src/modules/<module>/README.md`
- relevant API docs in `docs/api-contracts.md` or `sharek-api.http` when the
  task changes frontend-facing API behavior
- relevant database docs in `docs/database-plan.md` and `prisma/schema.prisma`
  when the task changes persistence
- relevant backlog and PRD requirement IDs

Do not start from a blank prompt. The agent must inspect the current files
before proposing or editing code.

### 2. Identify The Owning Module

Ask which module owns the final state:

- users, roles, sessions -> `identity`
- GitHub OAuth, linked account, repository evidence -> `github`
- project drafts and publication -> `projects`
- contributor profile record and public profile presentation -> `contributor-profiles`
- contribution task lifecycle -> `contribution-tasks`
- contributor application status -> `applications`
- skill candidates and approved skills -> `skill-profiles`
- delivery review and ratings -> `delivery-reviews`
- reputation score and history -> `reputation`
- admin queues and moderation workflow -> `admin`
- FastAPI AI contracts and adapters -> `ai`
- health checks -> `health`

If two modules are involved, the module that owns the final database state owns
the main use case. Other modules should expose a public service, reader port, or
event.

### 3. Inspect Existing Files

Before editing, inspect:

- module README
- module `.module.ts`
- existing controller/request/response files
- existing use cases, DTOs, mappers, ports
- existing domain rules or policies
- existing infrastructure adapters or repositories
- related tests
- relevant Prisma models

If the agent cannot explain the current flow in one short paragraph, it is not
ready to edit.

### 4. Implement Inside The Rules

Use the normal direction:

```text
controller -> request DTO -> use case -> domain/policy -> repository/port -> response DTO
```

For AI-backed decisions:

```text
use case -> deterministic checks -> AI port -> FastAPI adapter -> validated recommendation -> backend decision -> audit snapshot
```

Hard rules:

- Controllers stay thin.
- Business rules stay in use cases or domain.
- Domain code does not import NestJS, Prisma, HTTP clients, config, or model
  SDKs.
- Infrastructure contains Prisma repositories, external clients, queues, and
  security adapters.
- Cross-module dependency is allowed through public exported services, reader
  ports, or events.
- No module imports another module's private infrastructure.
- No module writes another module's tables directly.
- `shared/` is technical only.
- AI output never directly approves skills, accepts applications, or updates
  reputation.

### 5. Update Docs And Tracker

After code changes, update the docs that changed meaning:

| Change Type | Required Doc Update |
| --- | --- |
| New endpoint or API response changed | module README, `docs/api-contracts.md`, `sharek-api.http` when useful |
| New module workflow | module README and this tracker |
| New folder/layer in a module | module README and this tracker |
| Database schema or migration changed | `docs/database-plan.md`, module README, this tracker |
| AI contract changed | `docs/api-contracts.md`, `src/modules/ai/README.md`, this tracker |
| New env var | `.env.example`, `docs/local-development.md`, this tracker |
| New test strategy or command | module README or `docs/definition-of-done.md` when reusable |
| Sprint scope changed | sprint file under `docs/sprints/` and this tracker |

If no docs need updates, say why in the task summary.

### 6. Run Tests And Checks

Run the smallest checks that prove the change:

- `npm run check:architecture` for every backend change
- formatting/lint when code changed
- unit tests for changed services, policies, or adapters
- use-case tests when workflow changed
- integration/E2E tests when API or persistence behavior changed
- `git diff --check` for docs-only changes

Record the exact commands in the change record.

### 7. Review Before Handoff

Before finishing, review:

- Does the code live in the owning module?
- Did the implementation follow the call direction?
- Are module boundaries still protected?
- Did any table ownership get violated?
- Did API response shape stay stable or get documented?
- Are important business decisions audited?
- Did tests cover the risky behavior?
- Did module README and this tracker stay current?

## Module Status Dashboard

Use this table to see what is implemented, what is prepared, and what still
needs workflow code.

| Module | Current State | Main Implemented Files | Next Expected Work | Tracker Rule |
| --- | --- | --- | --- | --- |
| `identity` | Implemented auth/session endpoints | controller, request DTOs, auth service, mappers, security services | account-state policies, password reset, stronger persistence boundary if needed | Update when auth endpoints, user/session rules, roles, or account status change |
| `github` | Implemented OAuth/account/repository listing and contributor-attributed evidence snapshots | GitHub controller, OAuth service, repository service, DTOs, GitHub API client, token encryption | webhook/sync handling and normalized persistent evidence tables if JSON snapshots no longer scale | Update when GitHub scopes, token handling, repo evidence, or import behavior changes |
| `projects` | Implemented GitHub project import | projects controller, import request, project import service, project mapper | update draft, publish/archive, project discovery | Update when project lifecycle, visibility, metadata, or project APIs change |
| `contributor-profiles` | Implemented authenticated profile ensure and profile-by-username reads | controller, use cases, Prisma repository, presenter, domain policy | richer profile editing and public profile sections as product scope expands | Update when profile visibility, username/profile contracts, profile APIs, or profile persistence changes |
| `skill-profiles` | Implemented durable selected-repository generation and pending-candidate policy | generation controller/use cases, BullMQ queue/worker, Prisma repository, canonical skill policy | admin approval/rejection/adjustment APIs and file-level evidence evaluation | Update when skill state, evidence, AI generation, or approval rules are added |
| `contribution-tasks` | Registered placeholder module | module README and module file | task create/update/open/close and task discovery | Update when task lifecycle, required skills, capacity, deadlines, or owner limits are added |
| `applications` | Registered placeholder module | module README and module file | apply-to-task, eligibility recommendation, manual review, owner decision | Update when application status, AI decision handling, or application APIs are added |
| `delivery-reviews` | Registered placeholder module | module README and module file | PR submission, owner review, ratings, delivery-approved event | Update when delivery status, ratings, review APIs, or events are added |
| `reputation` | Registered placeholder module | module README and module file | reputation profile, score history, verified completion updates | Update when scoring rules, history, public reputation APIs, or events are added |
| `admin` | Registered placeholder module | module README and module file | manual review queues, disputes, reports, moderation views | Update when admin queues, review actions, moderation, or audit views are added |
| `ai` | Implemented authenticated FastAPI skill-profile adapter | AI port, strict FastAPI client adapter, response validation tests | eligibility/guidance/embedding adapters and broader contract tests | Update when AI ports, schemas, adapters, audit metadata, or service behavior changes |
| `health` | Implemented health endpoint | health controller, response, module, test | readiness checks for database/Redis/external dependencies if needed | Update when health response shape or readiness checks change |

## Per-Task Checklist

Copy this checklist into the sprint task or PR description.

```md
## Module Task Checklist

- [ ] Backlog task ID and PRD IDs are known.
- [ ] Owning module is identified.
- [ ] `AGENTS.md` was read.
- [ ] `docs/developer-architecture-guide.md` was read.
- [ ] `docs/module-development-tracker.md` was read.
- [ ] Target module README was read.
- [ ] Existing controller/use-case/domain/infrastructure/test files were inspected.
- [ ] Prisma models were inspected when persistence is touched.
- [ ] API docs were inspected when frontend-facing contracts are touched.
- [ ] Implementation stays inside module boundaries.
- [ ] Controllers are thin.
- [ ] Business rules are in use cases or domain.
- [ ] External systems are behind ports/adapters.
- [ ] Cross-module dependency, if needed, uses a public exported service, reader port, or event.
- [ ] No module imports another module's private infrastructure.
- [ ] No module writes another module's owned tables directly.
- [ ] Tests/checks were run and listed.
- [ ] `npm run check:architecture` passed.
- [ ] Module README was updated or explicitly not needed.
- [ ] `docs/api-contracts.md` was updated or explicitly not needed.
- [ ] `sharek-api.http` was updated or explicitly not needed.
- [ ] `docs/database-plan.md` was updated or explicitly not needed.
- [ ] This tracker was updated with a change record.
- [ ] Known risks and follow-up work are listed.
```

## Module Change Records

Append a short record here after every meaningful backend module change. Keep
records short and factual. Do not paste full diffs.

### 2026-07-07 - Architecture documentation hardening

- Modules: all backend modules and `shared`.
- Change type: documentation and process.
- Summary: Added detailed module READMEs, central developer architecture guide,
  health module README, and this tracker to enforce read -> code -> test ->
  docs update workflow.
- Code files changed: none.
- API changes: none.
- Database changes: none.
- Tests/checks: `git diff --check`.
- Architecture check: `npm run check:architecture`.
- Docs updated: `README.md`, `AGENTS.md`, `docs/*`, `src/modules/*/README.md`,
  `src/shared/README.md`.
- Risks/follow-up: future implementation tasks must append their own change
  records here and update the target module README when behavior changes.

### 2026-07-07 - Share-k backend Codex skill

- Modules: all backend modules and `shared`.
- Change type: agent workflow.
- Summary: Added `$sharek-backend-architect` as a Codex skill and stored a
  repo-local copy under `docs/skills/sharek-backend-architect/`.
- Code files changed: none.
- API changes: none.
- Database changes: none.
- Tests/checks: `python3 quick_validate.py`, `npm run check:architecture`.
- Docs updated: `AGENTS.md`, `docs/README.md`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: teammates need the skill installed in their own Codex
  environment if they want automatic skill triggering outside this machine.

### 2026-07-08 - GitHub repository evidence normalization

- Modules: `github`, `projects`.
- Requirement IDs: `TASK-1-05`, `FR-027`, `FR-028`, `FR-034`, `FR-035`.
- Change type: backend implementation and documentation.
- Summary: Added a reusable GitHub API client and expanded repository snapshots
  with README, languages, contribution activity, commit signals, descriptions,
  and repository statistics for project import and future skill profiling.
- Code files changed: `src/modules/github/application/dto/github-repository.dto.ts`,
  `src/modules/github/application/use-cases/github-repository.service.ts`,
  `src/modules/github/infrastructure/integrations/github-api.client.ts`,
  `src/modules/github/github.module.ts`.
- API changes: no new endpoint. `GET /github/repositories` remains the picker
  endpoint. `POST /projects/import/github` now stores richer normalized evidence
  in `repoStatistics` when GitHub exposes it.
- Database changes: none.
- Tests/checks: `npm test -- --runInBand src/modules/github`,
  `npm test -- --runInBand test/github-onboarding.spec.ts`,
  `npm run check:architecture`, `npm run lint`, `npm test -- --runInBand`,
  `npm run build`, `git diff --check`.
- Architecture check: passed.
- Docs updated: `src/modules/github/README.md`, `docs/api-contracts.md`,
  `sharek-api.http`, `docs/developer-architecture-guide.md`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: GitHub stats endpoints can return pending or unavailable
  values, so normalized evidence records `unavailableReason`. Background
  ingestion, persistent evidence tables, webhook refresh, and full code-file
  evidence extraction are still future work. Real browser OAuth still needs
  manual testing with the team's GitHub OAuth app before demo.

### 2026-07-08 - Backend CI workflow

- Modules: all backend modules and `shared`.
- Change type: CI and verification.
- Summary: Added GitHub Actions backend CI to run dependency installation,
  Prisma client generation, architecture checks, lint, unit tests, and build on
  pull requests and pushes to `main`.
- Code files changed: none.
- API changes: none.
- Database changes: none.
- Tests/checks: `npx prisma generate`, `npm run check:architecture`,
  `npm run lint`, `npm test -- --runInBand`, `npm run build`,
  `git diff --check`.
- Architecture check: passed.
- Docs updated: `docs/current-state-and-next-steps.md`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: this workflow does not run Docker Compose, real migrations,
  or E2E tests yet. Add those once the team stabilizes the local database and
  integration test path.

### 2026-07-08 - GitHub repository listing error hardening

- Modules: `github`.
- Change type: backend error handling and documentation.
- Summary: Step 10 manual testing exposed a generic 500 from
  `GET /github/repositories`. Hardened GitHub token decrypt and repository-list
  response validation so failures return explicit application errors.
- Code files changed:
  `src/modules/github/infrastructure/security/github-token-encryption.service.ts`,
  `src/modules/github/infrastructure/integrations/github-api.client.ts`.
- API changes: no route shape change. Error responses are clearer:
  `GITHUB_TOKEN_DECRYPT_FAILED` or
  `GITHUB_REPOSITORY_LIST_INVALID_RESPONSE` instead of generic 500.
- Database changes: none.
- Tests/checks: `npm test -- --runInBand src/modules/github`,
  `npm run check:architecture`, `npm run lint`, `npm test -- --runInBand`,
  `npm run build`, `git diff --check`.
- Architecture check: passed.
- Docs updated: `sharek-api.http`, `docs/module-development-tracker.md`.
- Risks/follow-up: if the stored token was encrypted with an old
  `GITHUB_TOKEN_ENCRYPTION_KEY`, the user must reconnect GitHub.

### 2026-07-08 - Contributor GitHub private repository consent

- Modules: `github`.
- Requirement IDs: `FR-011`, `FR-012`, `FR-027`, `FR-028`.
- Change type: backend implementation and documentation.
- Summary: Made GitHub OAuth scope role-aware. Contributors now request GitHub
  `repo` consent so repository listing and future skill evidence can include
  public and private repositories. Owners/admins keep the lighter `public_repo`
  consent because owner GitHub access is only an optional project-import
  shortcut for the MVP.
- Code files changed:
  `src/modules/github/application/use-cases/github-oauth.service.ts`,
  `src/modules/github/infrastructure/integrations/github-api.client.ts`.
- API changes: no route shape change. `GET /github/oauth/start` chooses scope
  from the authenticated user's role. `GET /github/repositories` now asks
  GitHub for `visibility=all`, so private repositories can appear when the
  stored token has contributor `repo` consent.
- Database changes: none.
- Tests/checks: `npm test -- --runInBand src/modules/github`,
  `npm test -- --runInBand test/github-onboarding.spec.ts`,
  `npm run check:architecture`, `npm run lint`, `git diff --check`.
- Architecture check: passed.
- Docs updated: `src/modules/github/README.md`, `docs/api-contracts.md`,
  `sharek-api.http`, `docs/module-development-tracker.md`.
- Risks/follow-up: GitHub OAuth App `repo` scope is broad. A future production
  hardening pass should consider a GitHub App or fine-grained permission model
  for read-only private repository evidence.

### 2026-07-08 - Social auth and public owner project import

- Modules: `identity`, `github`, `projects`.
- Requirement IDs: `FR-001`, `FR-002`, `FR-011`, `FR-027`, `FR-034`.
- Change type: backend implementation, database migration, and documentation.
- Summary: Added direct Google and GitHub signup/signin beside email/password
  auth. Social auth links by provider account or verified email and returns the
  normal Share-k session DTO. GitHub social auth also refreshes the connected
  GitHub account token. Owner project import now accepts a public GitHub repo
  `fullName` or `repoUrl` without requiring the owner to connect GitHub.
- Code files changed: `prisma/schema.prisma`,
  `src/modules/identity/application/use-cases/social-auth.service.ts`,
  `src/modules/identity/infrastructure/integrations/google-oauth.client.ts`,
  `src/modules/identity/presentation/http/controllers/identity.controller.ts`,
  `src/modules/github/application/use-cases/github-oauth.service.ts`,
  `src/modules/github/application/use-cases/github-repository.service.ts`,
  `src/modules/github/infrastructure/integrations/github-api.client.ts`,
  `src/modules/projects/application/use-cases/project-import.service.ts`.
- API changes: added `GET/POST /auth/google/*` and
  `GET/POST /auth/github/*` social auth endpoints. `POST /projects/import/github`
  now accepts `{ "repoUrl": "https://github.com/owner/repo" }` as well as
  `{ "fullName": "owner/repo" }`.
- Database changes: added `AuthProvider`, `AuthProviderAccount`, and
  `AuthOAuthState`; made `User.password_hash` nullable for social-only users.
- Tests/checks: `npx prisma generate`, `npm run check:architecture`,
  `npm run lint`, `npm test -- --runInBand src`,
  `npm test -- --runInBand src/modules/identity`,
  `npm test -- --runInBand src/modules/github src/modules/projects`,
  `npm run build`, `git diff --check`.
  `npm test -- --runInBand test/github-onboarding.spec.ts` was blocked in this
  sandbox by `listen EPERM: operation not permitted 0.0.0.0`.
- Docs updated: `sharek-api.http`, `docs/api-contracts.md`,
  `src/modules/identity/README.md`, `src/modules/github/README.md`,
  `src/modules/projects/README.md`, `docs/database-plan.md`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: real OAuth still needs manual browser testing against the
  team's configured Google and GitHub OAuth apps and callback URLs. Private
  owner project import remains out of MVP scope unless the product adds private
  project publishing. Applying the new migration to the local Docker database
  was blocked in this sandbox by Docker/socket permissions; run
  `DATABASE_URL=postgresql://sharek:sharek@localhost:5433/sharek?schema=public npx prisma migrate deploy`
  from a normal terminal before manual REST testing.

### 2026-07-09 - Email verification OTP and merge hardening

- Modules: `identity`, `github`.
- Requirement IDs: `FR-001`, `FR-002`.
- Change type: backend implementation, database migration, documentation, and
  merge hardening.
- Summary: Changed email/password registration to create a pending user, issue a
  hashed 6-digit email verification OTP, and return tokens only after
  `POST /auth/verify-email`. Added OTP resend, SMTP/Gmail-capable email
  delivery, pending-account activation through verified Google/GitHub social
  auth, and fixed GitHub repository evidence endpoints to return application
  errors for missing `fullName`.
- Code files changed: `prisma/schema.prisma`,
  `src/modules/identity/application/use-cases/identity.service.ts`,
  `src/modules/identity/infrastructure/integrations/email-verification.sender.ts`,
  `src/modules/identity/presentation/http/controllers/identity.controller.ts`,
  `src/modules/identity/presentation/http/requests/*email*.ts`,
  `src/modules/identity/application/use-cases/social-auth.service.ts`,
  `src/modules/github/presentation/http/controllers/github-oauth.controller.ts`.
- API changes: `POST /auth/register` now returns a pending user and verification
  expiry instead of tokens. Added `POST /auth/verify-email` and
  `POST /auth/verify-email/resend`. GitHub evidence endpoints now return
  `GITHUB_REPOSITORY_FULL_NAME_REQUIRED` when `fullName` is missing.
- Database changes: added `EmailVerificationOtp`; removed the accidental
  `20260709105314_test_migration` that dropped UUID defaults from social-auth
  tables before commit.
- Tests/checks: `npm run prisma:generate`,
  `npx tsc -p tsconfig.build.json --noEmit`,
  `npm run check:architecture`, `npm run lint`,
  `npm test -- --runInBand`, `git diff --check`.
- Architecture check: passed.
- Docs updated: `sharek-api.http`, `docs/api-contracts.md`,
  `src/modules/identity/README.md`, `src/modules/github/README.md`,
  `docs/database-plan.md`, `docs/local-development.md`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: real SMTP/Gmail delivery needs manual testing with a real
  Google App Password or team SMTP provider. `npm run build` was blocked locally
  by root-owned ignored `dist/` artifacts; run
  `sudo chown -R amr18:amr18 /opt/Sharek_Backend/Backend/dist` or remove `dist/`
  from a terminal with permission, then rerun `npm run build`.

### 2026-07-13 - Local Postgres port and build artifact recovery

- Modules: all backend modules.
- Change type: local development configuration and generated artifact recovery.
- Summary: Aligned fresh Docker Compose Postgres host-port defaults with the
  local npm script expectation of `localhost:5433`, moved the locked generated
  `dist/` output aside, regenerated Prisma Client, and verified the backend can
  compile and initialize against the healthy Docker Postgres service.
- Code files changed: none.
- API changes: none.
- Database changes: none.
- Tests/checks: `npm run check:architecture`, `npx prisma generate`,
  `npm run build`, `docker compose ps`,
  `docker compose exec -T postgres pg_isready -U sharek -d sharek`,
  `PORT=3001 npm run start:dev`.
- Architecture check: passed.
- Docs updated: `.env.example`, `.gitignore`, `docker-compose.yml`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: `PORT=3001 npm run start:dev` now reaches Nest startup and
  database initialization, but port `3001` was already occupied on the host; use
  another `PORT` value or stop the process currently listening on `3001`.

## Agent Handoff Template

Every agent should finish with this shape:

```md
## Backend Task Handoff

Task:
Requirement IDs:
Owning module:

Files changed:
-

Architecture notes:
-

API changes:
-

Database changes:
-

Tests/checks run:
-

Docs/tracker updates:
-

Risks/follow-up:
-
```

## Alternatives Considered

### Alternative 1: Separate checklist file inside every module

This gives each module full independence, but it creates many small files that
are easy to forget. It also makes cross-module review harder because reviewers
must open many locations to understand status.

### Alternative 2: Track everything only in Jira or GitHub issues

This is useful for project management, but it does not live beside the code.
Agents and teammates working in VS Code need a repo-local source of truth that
is available without leaving the backend checkout.

### Alternative 3: Generate docs automatically from code only

Generated docs help API accuracy, but they do not explain ownership,
boundaries, business decisions, or why a module should own a workflow.

### Chosen Approach

Use one central repo-local tracker plus module READMEs.

This keeps the system strong without making it heavy:

- module README explains local ownership and file placement.
- `developer-architecture-guide.md` explains architecture rules.
- this tracker records workflow, status, and change history.
- PR/sprint checklists force humans and agents to update docs after code.
- `npm run check:architecture` catches missing module docs and basic boundary
  violations before review.

### 2026-07-13 - Verify backend CI test dependency fix

- Modules: `identity` (test wiring), `contributor-profiles` E2E flow coverage.
- Requirement IDs: FR-026 (login -> ensure -> profile lookup redirect flow).
- Change type: test stabilization.
- Summary: Updated `test/contributor-profile-redirect.e2e-spec.ts` to provide
  `ConfigService` when instantiating `IdentityController`, matching the
  controller's constructor dependency and restoring CI test execution.
- Code files changed: `test/contributor-profile-redirect.e2e-spec.ts`.
- API changes: none.
- Database changes: none.
- Tests/checks: `npm test -- test/contributor-profile-redirect.e2e-spec.ts --runInBand`,
  `npm run lint`, `npm run check:architecture`, `npm run build`,
  `npm test -- --runInBand`.
- Docs updated: `docs/module-development-tracker.md`.
- Risks/follow-up: lint warnings from existing specs (`no-explicit-any`) remain
  unchanged and pre-existing.

### 2026-07-14 - Split GitHub social auth from repository consent

- Modules: `identity`, `github`.
- Requirement IDs: `TASK-1-04`, `TASK-1-05`, `FR-011`, `FR-012`,
  `FR-027`, `FR-090`.
- Change type: backend behavior, API contract documentation, and tests.
- Summary: Changed GitHub social signup/signin to request only identity scope
  (`read:user user:email`) and stopped social auth from creating the
  repository-evidence GitHub connection. The authenticated
  `/github/oauth/start` flow remains the explicit contributor repository
  consent step and still requests `repo` for contributor evidence.
- Code files changed:
  `src/modules/github/application/use-cases/github-oauth.service.ts`,
  `src/modules/identity/application/use-cases/social-auth.service.ts`,
  `src/modules/identity/application/use-cases/social-auth.service.spec.ts`,
  `test/github-onboarding.spec.ts`.
- API changes: no route shape change. `GET /auth/github/start` now returns an
  authorization URL with minimal identity scope; `GET /github/oauth/start`
  keeps role-aware repository consent.
- Database changes: none.
- Tests/checks: `npm test -- src/modules/identity/application/use-cases/social-auth.service.spec.ts --runInBand`,
  `npm test -- test/github-onboarding.spec.ts --runInBand`,
  `npm run check:architecture`, `npm run lint`, `npm run build`,
  `npm test -- --runInBand`.
- Architecture check: passed.
- Docs updated: `docs/api-contracts.md`, `sharek-api.http`,
  `src/modules/identity/README.md`, `src/modules/github/README.md`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: existing lint warnings in unrelated specs remain. The
  frontend should show repository access as a post-signup profile/onboarding
  consent step before calling `/github/oauth/start`.

### 2026-07-14 - Fix GitHub repository OAuth browser callback

- Modules: `github`.
- Requirement IDs: `TASK-1-05`, `FR-027`, `FR-090`.
- Change type: backend callback routing, local OAuth configuration, docs, and
  tests.
- Summary: Added a browser repository-connect callback at
  `/auth/github/callback/repository` that forwards GitHub `code`/`state` to the
  frontend `/auth/callback` route. Updated the repository OAuth callback URL
  defaults so the GitHub OAuth App can keep the parent
  `/auth/github/callback` registration while repository consent uses a child
  redirect path.
- Code files changed:
  `src/modules/github/presentation/http/controllers/github-oauth.controller.ts`,
  `src/modules/github/github.module.ts`, `test/github-onboarding.spec.ts`,
  `test/setup-env.ts`.
- API changes: added `GET /auth/github/callback/repository` as the browser
  redirect endpoint for repository OAuth. Existing `POST /github/oauth/callback`
  still performs the connection and token storage.
- Database changes: none.
- Tests/checks: `npm test -- test/github-onboarding.spec.ts --runInBand`,
  `npm run check:architecture`, `npm run build`, `npm run lint`,
  `npm test -- --runInBand`, frontend `npm run lint`,
  `curl -I http://localhost:4000/auth/github/callback/repository?...`.
- Architecture check: passed.
- Docs updated: `.env.example`, `docker-compose.yml`, `docs/api-contracts.md`,
  `docs/local-development.md`, `docs/team-onboarding.md`,
  `sharek-api.http`, `src/modules/github/README.md`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: the local GitHub OAuth App must have authorization callback
  URL `http://localhost:4000/auth/github/callback`, and the running API
  container must be recreated after `.env` changes.

### 2026-07-14 - Paginate contributor GitHub repository picker

- Modules: `github`.
- Requirement IDs: `TASK-1-05`, `FR-027`, `FR-090`.
- Change type: backend API contract, frontend repository picker UX, docs, and
  tests.
- Summary: Added page/perPage handling to the GitHub repository picker so
  contributors can browse public and private repositories in organized pages
  instead of loading one unbounded list. The backend requests one extra GitHub
  repository to detect `hasNextPage`; the frontend renders previous/next page
  controls and page metadata.
- Code files changed:
  `src/modules/github/application/dto/github-repository.dto.ts`,
  `src/modules/github/application/use-cases/github-repository.service.ts`,
  `src/modules/github/infrastructure/integrations/github-api.client.ts`,
  `src/modules/github/presentation/http/controllers/github-oauth.controller.ts`,
  `src/modules/github/presentation/http/requests/github-repositories-query.request.ts`,
  `test/github-onboarding.spec.ts`.
- API changes: `GET /github/repositories` now accepts optional `page` and
  `perPage` query params and returns `{ items, page, perPage, hasNextPage }`
  for the repository picker.
- Database changes: none.
- Tests/checks: `npm test -- src/modules/github/application/use-cases/github-repository.service.spec.ts --runInBand`,
  `npm test -- src/modules/github/infrastructure/integrations/github-api.client.spec.ts --runInBand`,
  `npm test -- test/github-onboarding.spec.ts --runInBand`,
  `npm run check:architecture`, `npm run lint`, `npm run build`,
  `npm test -- --runInBand`, frontend focused GitHub tests, frontend
  `npm run lint`, frontend `npm test`, frontend `npm run build`.
- Architecture check: passed.
- Docs updated: `docs/api-contracts.md`, `sharek-api.http`,
  `src/modules/github/README.md`, `docs/module-development-tracker.md`.
- Risks/follow-up: GitHub does not expose a cheap total count for all visible
  repositories on this endpoint, so the UI shows page navigation with
  `hasNextPage` rather than total pages.

### 2026-07-14 - Require usernames during email/password registration

- Modules: `identity`.
- Requirement IDs: `TASK-1-04`, `FR-011`.
- Change type: backend API contract, frontend signup integration, docs, and
  tests.
- Summary: Added register-time usernames to `POST /auth/register`, exposed
  `GET /auth/username-availability`, centralized invalid/reserved/taken checks
  in `IdentityUsernameService`, and enabled the frontend username field against
  the real backend endpoint. GitHub direct auth signup remains non-blocking and
  only assigns the normalized GitHub login when it is valid and free.
- Code files changed:
  `src/modules/identity/domain/username/username.policy.ts`,
  `src/modules/identity/application/use-cases/identity-username.service.ts`,
  `src/modules/identity/application/use-cases/identity.service.ts`,
  `src/modules/identity/application/use-cases/social-auth.service.ts`,
  `src/modules/identity/presentation/http/controllers/identity.controller.ts`,
  `src/modules/identity/presentation/http/requests/register.request.ts`,
  `src/modules/identity/presentation/http/requests/username-availability.request.ts`.
- API changes: `POST /auth/register` now requires `username`; added public
  `GET /auth/username-availability?username=...` returning
  `{ available, suggestion, reason }`.
- Database changes: none; the existing nullable unique `User.username` column
  is used.
- Tests/checks: focused identity unit tests, `test/github-onboarding.spec.ts`,
  frontend username availability tests, `npm run check:architecture`,
  `npm run lint`, `npm test -- --runInBand`, `npm run build`, frontend
  `npm run lint`, frontend `npm test`, frontend `npm run build`, and
  `git diff --check` passed.
- Architecture check: passed.
- Docs updated: `docs/api-contracts.md`, `sharek-api.http`,
  `src/modules/identity/README.md`, `docs/module-development-tracker.md`.
- Risks/follow-up: profile/onboarding username editing still needs a dedicated
  endpoint if a GitHub OAuth signup cannot take the suggested GitHub login.

### 2026-07-14 - Document selected-repository AI skill profiling plan

- Modules: `skill-profiles`, `github`, `ai`, future `admin`, and frontend
  integration.
- Requirement IDs: `TASK-1-05`, `TASK-2-04`, `TASK-2-05`, `TASK-3-03`,
  `TASK-3-04`, `TASK-3-06`, `TASK-7-03`, `TASK-8-03`, `FR-012`, `FR-014`,
  `FR-027` through `FR-033`, `FR-083` through `FR-094`, `NFR-001`, `NFR-002`.
- Change type: implementation planning documentation and tracker update.
- Summary: Added a concrete handoff plan for the flow where contributors select
  repositories, the backend snapshots evidence, BullMQ runs AI skill
  profiling, generated skills are stored as pending, and admins approve or
  reject skills before eligibility use.
- Code files changed: none.
- API changes: none implemented. Proposed future APIs are documented in
  `docs/selected-repos-ai-skill-profiling-plan.md`.
- Database changes: none implemented. The plan calls out a future Prisma
  migration for durable skill-profile generation state.
- Tests/checks: `npm run check:architecture`, `git diff --check`.
- Architecture check: passed.
- Docs updated: `docs/selected-repos-ai-skill-profiling-plan.md`,
  `docs/module-development-tracker.md`.
- Risks/follow-up: backend, FastAPI AI repo, admin review, and frontend
  integration still need implementation after this planning artifact.

### 2026-07-14 - Implement backend selected-repository skill generation

- Modules: `skill-profiles`, `github`, `ai`.
- Requirement IDs: `TASK-1-05`, `TASK-3-03`, `TASK-3-04`, `FR-012`,
  `FR-014`, `FR-027` through `FR-033`, `FR-083` through `FR-094`,
  `NFR-001`, `NFR-002`.
- Change type: backend API, Prisma schema/migration, FastAPI AI adapter,
  GitHub evidence service, docs, and tests.
- Summary: Added contributor skill profile generation from selected GitHub
  repositories. The backend creates durable generation records, collects
  selected repository evidence through the GitHub module, calls the FastAPI
  `SkillProfileGenerator` adapter, stores high-confidence generated skills as
  `pending`, and exposes a polling endpoint for generation status.
- Code files changed:
  `prisma/schema.prisma`,
  `prisma/migrations/20260714100000_skill_profile_generations/migration.sql`,
  `src/modules/ai/application/ports/skill-profile-generator.port.ts`,
  `src/modules/ai/infrastructure/integrations/fastapi-skill-profile-generator.client.ts`,
  `src/modules/github/application/use-cases/github-repository.service.ts`,
  `src/modules/skill-profiles/**`.
- API changes: added `POST /skill-profiles/me/generations` and
  `GET /skill-profiles/me/generations/:generationId`.
- Database changes: added `SkillProfileGenerationStatus`,
  `SkillProfileGeneration`, and optional `SkillProfile.generation_id`.
- Tests/checks: `npx prisma generate`, `npx prisma validate`,
  `npm run check:architecture`, focused skill profile generation use-case
  tests, `npm test -- --runInBand`, `npm run lint`, `npm run build`,
  `git diff --check`.
- Architecture check: passed.
- Docs updated: `docs/api-contracts.md`, `docs/database-plan.md`,
  `sharek-api.http`, `src/modules/ai/README.md`,
  `src/modules/skill-profiles/README.md`,
  `docs/module-development-tracker.md`.
- Historical follow-up: this initial version ran in-process. The hardening entry
  below supersedes that implementation with BullMQ, retries, restart recovery,
  and frontend multi-select/progress integration. Admin approval endpoints
  remain separate backlog work.

### 2026-07-14 - Harden selected-repository skill profiling after review

- Modules: `skill-profiles`, `github`, `ai`, FastAPI AI repository, and
  frontend GitHub repository picker.
- Requirement IDs covered: `TASK-1-05`, `TASK-3-02`, `TASK-3-03`, `FR-012`,
  `FR-014`, `FR-029`, `FR-030`, `FR-032`, `FR-033`, `FR-083`, `FR-084`,
  `FR-088`, `FR-090`, `FR-094`, `NFR-001`, `NFR-002`, `NFR-003`.
- Partial requirement: `FR-028` currently covers repository metadata, README,
  languages, contributor activity, commit signals, and exact-login authorship;
  file-level authored code/manifests/static analysis remain future work.
- Explicitly not claimed: automatic post-OAuth trigger (`FR-027`), admin review
  actions (`TASK-2-04`, `TASK-3-04`, `FR-031`), RAG indexing, observability,
  and production evaluation fixtures.
- Summary: Replaced in-process generation with BullMQ/Redis jobs, retries, and
  restart recovery. Repository selections are now checked against authenticated
  `/user/repos`; evidence includes exact contributor authorship and safe partial
  failure codes. FastAPI requires internal bearer authentication and returns
  exact evidence citations. NestJS validates citations and applies deterministic
  weak-evidence policy. Repeated pending skills are canonicalized and superseded.
  Frontend selections persist across pages, enforce the 10-repository maximum,
  and display `needs_more_evidence` as a terminal state. Docker Compose now
  uses a Docker-only TypeScript output path in the `api_build` volume so host
  builds no longer collide with root-owned `dist/` files.
- API changes: generation status now includes `needs_more_evidence`; malformed
  generation IDs return validation errors; failure messages are user-safe.
- Database changes: added `needs_more_evidence`, `superseded`, `skill_key`, and
  `superseded_at` in
  `prisma/migrations/20260714120000_harden_skill_profile_generations/migration.sql`;
  `20260714130000_normalize_skill_profile_keys` normalizes historical aliases.
- Dependencies: added `bullmq` to the NestJS backend and `pytest` to the AI
  service requirements.
- Tests added/updated: GitHub pagination/membership/authorship, strict FastAPI
  adapter citations, queue enqueue failure, weak-evidence policy, canonical
  names, AI endpoint authentication/attribution, and frontend cross-page/limit
  behavior.
- Final verification: architecture check passed for 12 modules; backend lint
  passed with 0 errors (14 existing test-only warnings); 26 backend suites and
  94 tests passed; backend build passed while Docker watch was active; all 9
  Prisma migrations are applied; backend `/health` returned 200; 6 FastAPI
  tests passed; frontend lint, 11 suites/70 tests, and production build passed;
  all three repositories passed `git diff --check`.
- Docs updated: API contracts, database plan, current-state guide, local
  development guide, REST Client guide, selected-repository plan, and `github`, `ai`, and
  `skill-profiles` READMEs; AI repository now includes README and env example.
- Risks/follow-up: admin review and file-level authored-code evidence remain
  separate backlog work. GitHub attribution gaps intentionally degrade to
  `needs_more_evidence` rather than optimistic confidence. Rotate the exposed
  Groq credential and set the replacement only in the ignored AI `.env` before
  performing a live model call; no exposed key is stored in these repositories.
