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
- in-app notifications -> `notifications`
- delivery review and ratings -> `delivery-reviews`
- reputation score and history -> `reputation`
- admin queues and moderation workflow -> `admin`
- FastAPI AI contracts and adapters -> `ai`
- health checks -> `health`

If two modules are involved, the module that owns the final database state owns
the main service workflow. Other modules expose an exported service or event.

### 3. Inspect Existing Files

Before editing, inspect:

- module README
- module `.module.ts`
- existing controllers, services, and DTOs
- existing validators, mappers, repositories, integrations, and jobs
- related tests
- relevant Prisma models

If the agent cannot explain the current flow in one short paragraph, it is not
ready to edit.

### 4. Implement Inside The Rules

Use the normal direction:

```text
controller -> request DTO -> service -> Prisma/exported service/integration client -> response DTO
```

For AI-backed decisions:

```text
service -> deterministic checks -> AiService -> FastAPI client -> validated recommendation -> backend decision -> audit snapshot
```

Hard rules:

- Controllers stay thin.
- Services own authorization, workflow, validation, and business decisions.
- Controllers do not access Prisma or external clients.
- Cross-module dependency uses exported NestJS services or events.
- No module imports another module's private repository, integration, security,
  job, controller, mapper, validator, or utility.
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
| New optional folder in a module | module README and this tracker |
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
- unit tests for changed services, validators, repositories, or clients
- service tests when workflow changed
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
| `identity` | Implemented auth/session endpoints | controllers, DTOs, auth/session/password-reset/social-auth services, mappers, security | account management and security hardening | Update when auth endpoints, user/session rules, roles, or account status change |
| `github` | Implemented OAuth/account/repository listing and contributor-attributed evidence snapshots | GitHub controller, OAuth service, repository service, DTOs, GitHub API client, token encryption | webhook/sync handling and normalized persistent evidence tables if JSON snapshots no longer scale | Update when GitHub scopes, token handling, repo evidence, or import behavior changes |
| `projects` | Implemented GitHub project import | root controller/service, DTOs, mapper | update draft, publish/archive, project discovery | Update when project lifecycle, visibility, metadata, or project APIs change |
| `contributor-profiles` | Implemented profile ensure/read/update, explicit avatar upload, and dynamic admin-managed contributor fields | root controller/service, DTOs, presenter, validator, field catalog | richer contribution history and object-storage migration if avatar volume requires it | Update when profile visibility, username/profile contracts, profile APIs, or profile persistence changes |
| `skill-profiles` | Implemented durable selected-repository generation, pending-candidate policy, admin review transitions, review audit history, and approved-only eligibility reads | controller/service, generation service, review service, summary service, BullMQ queue/worker, concrete repository | file-level evidence evaluation and future eligibility consumers | Update when skill state, evidence, AI generation, or approval rules are added |
| `notifications` | Implemented notification write service and authenticated WebSocket delivery for contributor skill-review outcomes | notifications service/gateway/module, README | notification inbox, read-state APIs, delivery channels, and broader event-driven alerts | Update when notification rows, delivery behavior, or notification APIs change |
| `contribution-tasks` | Registered placeholder module | module README and module file | task create/update/open/close and task discovery | Update when task lifecycle, required skills, capacity, deadlines, or owner limits are added |
| `applications` | Registered placeholder module | module README and module file | apply-to-task, eligibility recommendation, manual review, owner decision | Update when application status, AI decision handling, or application APIs are added |
| `delivery-reviews` | Registered placeholder module | module README and module file | PR submission, owner review, ratings, delivery-approved event | Update when delivery status, ratings, review APIs, or events are added |
| `reputation` | Partial summary service | module README, module file, reputation service | reputation profile, score history, verified completion updates | Update when scoring rules, history, public reputation APIs, or events are added |
| `admin` | Implemented admin skill review and contributor-field management HTTP routes | admin controllers, DTOs, module README and module file | disputes, reports, moderation views, and broader admin queues | Update when admin queues, review actions, moderation, or audit views are added |
| `ai` | Implemented FastAPI skill-profile facade | `AiService`, DTOs, strict FastAPI client, response validation tests | eligibility/guidance/embedding clients and broader contract tests | Update when AI schemas, clients, audit metadata, or service behavior changes |
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
- [ ] Existing controllers, services, DTOs, optional technical files, and tests were inspected.
- [ ] Prisma models were inspected when persistence is touched.
- [ ] API docs were inspected when frontend-facing contracts are touched.
- [ ] Implementation stays inside module boundaries.
- [ ] Controllers are thin.
- [ ] Business rules and final decisions are in services or focused validators.
- [ ] External systems are behind module-local integration clients.
- [ ] Cross-module dependency, if needed, uses an exported service or event.
- [ ] No module imports another module's private technical files.
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

### 2026-07-16 - Standard NestJS module architecture migration

- Modules: all 12 backend modules, with implementation changes in `identity`,
  `github`, `projects`, `contributor-profiles`, `skill-profiles`, `ai`, and
  `reputation`.
- Requirement IDs: architecture migration plan, ADR-002, and preserved active
  contributor-profile redirect contracts.
- Change type: architecture, module layout, service boundaries, tests, docs, and
  architecture tooling.
- Summary: Replaced Clean Architecture layer folders, use-case classes, reader
  ports, and one-implementation abstract repositories with standard NestJS
  controllers, services, DTOs, concrete repositories, integrations, and jobs.
  Split identity into auth/session/password-reset/social-auth services and GitHub
  into OAuth/account/repository/evidence services. Added `AiService` and kept
  final AI decisions in owning backend services.
- API changes: none; existing routes and response contracts were preserved.
- Database changes: none; existing Prisma models and migrations were preserved.
- Tests/checks: architecture check, lint, type-check, focused service tests,
  full Jest suite, build, Prisma validation, and `git diff --check`.
- Docs updated: ADR-002, `AGENTS.md`, architecture guides, conventions,
  skeleton, module READMEs, Spec Kit plan/tasks, tracker, and both backend skill
  copies.
- Risks/follow-up: the existing Prisma schema exposes only the `github` auth
  provider enum while Google OAuth code uses a compatibility cast; this
  pre-existing schema/code mismatch should be resolved in a separate migration.

### 2026-07-16 - Runtime and endpoint documentation parity review

- Modules: `health`, `identity`, `github`, `projects`, `contributor-profiles`,
  and `skill-profiles`; documentation index and current-state guides.
- Requirement IDs: endpoint testability, route/documentation parity, and the
  standard NestJS module architecture decision.
- Change type: runtime verification and API documentation.
- Summary: Started the Docker Compose backend, verified the API container,
  PostgreSQL migration execution, Redis connectivity configuration, NestJS
  route registration, validation behavior, and protected-route behavior. Added
  a complete Postman-oriented endpoint guide and aligned the REST Client file
  with every currently registered endpoint, including password reset,
  contributor profiles, and skill-profile generation.
- API changes: none; all 35 registered backend routes remain unchanged.
- Database changes: none; Docker applied the existing pending password-reset
  migration and reported no startup migration failure.
- Tests/checks: `npm run check:architecture` passed for 12 modules; lint passed
  with 5 existing warnings and 0 errors; type-check passed; 26 Jest suites and
  86 tests passed with `--detectOpenHandles`; build passed; live `GET /health`
  returned 200; `git diff --check` passed.
- Docs updated: `docs/postman-api-guide.md`, `docs/api-contracts.md`,
  `sharek-api.http`, `docs/README.md`, `README.md`,
  `docs/current-state-and-next-steps.md`, selected AI planning/agent docs, and
  this tracker.
- Risks/follow-up: real Google/GitHub OAuth, SMTP OTP delivery, and the
  separate FastAPI AI service require their external credentials/services for
  full end-to-end testing. Prisma still reports the package.json configuration
  deprecation warning for a future Prisma 7 config migration.

### 2026-07-19 - Verify Jira Sprint 1 backend completion

- Modules: `identity`, with verification across `github`, `ai`, database, and
  local Docker infrastructure.
- Jira/task IDs: `SK-105` / `TASK-1-03`, `SK-106` / `TASK-1-04`, `SK-107` /
  `TASK-1-05`, backend boundary of `SK-108` / `TASK-1-06`, and `SK-109` /
  `TASK-1-07`.
- Change type: authorization hardening, test repair, documentation, and Sprint
  1 verification.
- Summary: Added service-level active-admin authorization to role assignment,
  updated the controller to pass the authenticated actor, repaired the OTP
  sender expectation, and restored contributor-profile HTTP test dependency
  wiring. Audited the Sprint 1 schema, auth/session/GitHub OAuth, normalized
  GitHub ingestion, AI client boundary, and Docker Compose foundation against
  their Jira acceptance criteria.
- API changes: none; `PATCH /auth/users/:id/role` keeps the same public contract.
- Authorization impact: role assignment now requires an active admin inside
  `AuthService` in addition to the existing access-token and role guards.
- Database changes: none; existing Prisma schema and migrations were reviewed.
- Tests/checks: `npm run check:architecture`, `npm run lint`,
  `npx tsc --noEmit`, `npm test -- --runInBand`, `npm run build`,
  `DATABASE_URL=postgresql://sharek:sharek@localhost:5433/sharek?schema=public npx prisma validate`,
  `docker compose config --quiet`, `docker compose exec -T api npx prisma migrate status`,
  PostgreSQL pgvector verification, Redis `PING`, live `GET /health`, and
  `git diff --check` passed. Final Jest result: 26 suites and 87 tests passed;
  lint passed with no warnings.
- Architecture check: passed for all 12 standard NestJS modules.
- Docs updated: `src/modules/identity/README.md`, external Sprint 1 handoff, and
  this tracker.
- Risks/follow-up: live OAuth requires configured GitHub credentials. Live AI
  contract and client/UX verification remain outside this backend repository
  and are captured in the external handoff document.

### 2026-07-19 - Allow arbitrary development CORS origins

- Modules: backend bootstrap and shared configuration.
- Requirement IDs: local development interoperability; no Jira task ID.
- Change type: development runtime configuration, focused tests, and docs.
- Summary: Development now reflects any requesting browser origin while
  retaining credential support, allowing local, mobile, emulator, and LAN
  clients to call the backend without maintaining a development allowlist.
- API changes: none; routes and payload contracts are unchanged.
- Authorization impact: none; authentication and authorization checks remain
  unchanged.
- Database changes: none; no Prisma schema or migration changes.
- Tests/checks: focused CORS tests plus architecture, lint, type-check, full
  tests, build, live arbitrary-origin preflight, and `git diff --check`.
- Docs updated: `.env.example`, `docs/local-development.md`, and this tracker.
- Risks/follow-up: non-development environments still require every trusted
  browser origin to be listed explicitly in `CORS_ORIGINS`.

### 2026-07-19 - Repair Google OAuth Docker configuration boundary

- Modules: `identity` runtime configuration and Docker Compose.
- Requirement IDs: Google social authentication development integration; no
  Jira task ID.
- Change type: environment wiring, external client handoff, and documentation.
- Summary: Passed the existing Google OAuth client ID, secret, and callback URL
  variables into the Dockerized API and documented the browser OAuth flow. Live
  diagnosis confirmed backend development CORS responds correctly on port
  `4000`; the observed client request incorrectly targeted port `3000`.
- API changes: none; the existing Google OAuth routes and payloads are unchanged.
- Authorization impact: none.
- Database changes: none; no Prisma schema or migration changes.
- Tests/checks: Docker Compose configuration validation, architecture, lint,
  type-check, full tests, build, and `git diff --check`.
- Docs updated: `.env.example`, Google OAuth client handoff, and this tracker.
- Risks/follow-up: real Google sign-in remains unavailable until valid Google
  credentials are added to `.env`, the callback URI is registered in Google
  Cloud, and the client agent applies the separate handoff.

### 2026-07-19 - Accept provider metadata on social-auth redirects

- Modules: `identity`.
- Requirement IDs: Google/GitHub social authentication callback integration;
  no Jira task ID.
- Change type: callback validation repair, focused tests, and documentation.
- Summary: Browser GET callbacks now extract and validate only OAuth completion
  fields while ignoring unrelated provider-controlled query metadata such as
  Google's `iss`, `scope`, `authuser`, and `prompt`. Provider cancellation
  errors are forwarded to the frontend callback. Strict POST callback DTO
  validation and the global non-whitelisted-property policy remain enabled.
- API changes: successful GET callbacks keep redirecting to
  `${FRONTEND_URL}/auth/callback`; provider error callbacks now redirect with
  `error` and optional `error_description` instead of returning validation JSON.
- Authorization impact: none; OAuth state validation still occurs during the
  POST completion workflow.
- Database changes: none; no Prisma schema or migration changes.
- Tests/checks: focused callback validator tests plus architecture, lint,
  type-check, full tests, build, live Google-style callback redirect, and
  `git diff --check`.
- Docs updated: `src/modules/identity/README.md` and this tracker.
- Risks/follow-up: a real provider round trip still depends on valid external
  Google/GitHub credentials and registered callback URLs.

### 2026-07-19 - Diagnose live AI skill-profile integration

- Modules: `ai` and `skill-profiles` integration boundary.
- Requirement IDs: backend boundary of `SK-108` / `TASK-1-06`.
- Change type: runtime configuration correction, contract verification, and
  external AI handoff documentation.
- Summary: Corrected the ignored local backend environment to reach host-run
  FastAPI through `host.docker.internal:8000`. Runtime OpenAPI inspection found
  that FastAPI currently exposes `POST /profile/repos`, while NestJS requires
  `POST /skill-profiles/generate`, and that both request and response schemas
  plus bearer-token behavior are incompatible. Documented the exact AI work
  required instead of weakening backend evidence and audit validation.
- API changes: none in the NestJS backend.
- Authorization impact: none; the required internal AI bearer-token boundary
  remains unchanged.
- Database changes: none; no Prisma schema or migration changes.
- Tests/checks: FastAPI host health passed; Docker-network health timed out and
  listener inspection confirmed Uvicorn was bound only to `127.0.0.1:8000`;
  sanitized OpenAPI route/schema inspection and backend health passed, followed
  by `git diff --check`.
- Docs updated: AI skill-profile contract handoff and this tracker.
- Follow-up verification: FastAPI now binds to `0.0.0.0:8000`, exposes the
  required route with declared security, and accepts the backend bearer token.
  An empty authenticated request reached schema validation and returned HTTP
  422 as expected.
- Risks/follow-up: generation remains blocked locally because the host firewall
  times out TCP traffic from backend Docker subnet `172.24.0.0/16` to port
  `8000`. Allow that narrow path or attach FastAPI to the backend Docker network.

### 2026-07-19 - Admin skill review backend

- Modules: `admin`, `skill-profiles`, and Prisma.
- Requirement IDs: `TASK-2-04`, `FR-023`, `FR-024`, `FR-031`, `FR-032`.
- Change type: backend implementation, database migration, tests, and docs.
- Summary: Added admin-only skill review APIs for pending AI-generated skills,
  approval, rejection, and proficiency adjustment. Review transitions are owned
  by `SkillProfilesReviewService`, while `AdminSkillReviewsController` stays as
  the HTTP boundary. Every review action appends a
  `SkillProfileReviewDecision` audit row, and `SkillProfileSummaryService`
  exposes an approved-only eligibility reader.
- API changes: added `GET /admin/skill-reviews/pending`,
  `POST /admin/skill-reviews/:skillProfileId/approve`,
  `POST /admin/skill-reviews/:skillProfileId/reject`, and
  `PATCH /admin/skill-reviews/:skillProfileId/proficiency`.
- Database changes: added `SkillProfileReviewAction` enum and
  `SkillProfileReviewDecision` model/table in
  `prisma/migrations/20260719120000_admin_skill_review_decisions/migration.sql`.
- Tests/checks: focused admin review tests passed; full Jest suite passed
  (29 suites, 94 tests); architecture check passed; lint passed with 0 errors
  and 10 existing warnings; type-check passed; build passed; Prisma validation
  passed with local `DATABASE_URL`; `git diff --check` passed.
- Docs updated: `docs/api-contracts.md`, `docs/database-plan.md`,
  `src/modules/admin/README.md`, `src/modules/skill-profiles/README.md`,
  `specs/002-admin-skill-review/*`, and this tracker.
- Risks/follow-up: approval and notification writes are sequential across
  exported services rather than one shared transaction, so failure handling
  remains explicit at the service boundary.

### 2026-07-19 - Contributor activation and skill-review notifications

- Modules: `identity`, `notifications`, `skill-profiles`, `admin`, and Prisma.
- Requirement IDs: `TASK-2-04`, `FR-023`, `FR-031`, `FR-032`.
- Change type: backend implementation and documentation.
- Summary: Added an exported identity account-status service that activates a
  pending contributor after a successful skill approval, plus an exported
  notifications service for skill-review outcome rows. `SkillProfilesReviewService`
  now calls those exported services after approve and reject transitions while
  keeping proficiency-only adjustments pending.
- API changes: review responses now include activation and notification side
  effect metadata for approve/reject outcomes.
- Database changes: none; reused existing `User` and `Notification` tables.
- Tests/checks: targeted unit tests passed for identity activation,
  notification creation, and review side effects; architecture check, lint,
  type-check, full Jest suite, build, Prisma validate, and `git diff --check`
  all passed.
- Docs updated: `specs/002-admin-skill-review/*`, `docs/api-contracts.md`,
  `docs/database-plan.md`, `docs/developer-architecture-guide.md`,
  `src/modules/*/README.md`, and this tracker.
- Risks/follow-up: approval and notification writes are sequential across
  exported services rather than one shared transaction, so failure handling
  remains explicit at the service boundary.

### 2026-07-19 - Real-time notification delivery

- Modules: `notifications`, `skill-profiles`, and package dependencies.
- Requirement IDs: `TASK-2-04`, `FR-023`, `FR-031`.
- Change type: backend implementation, WebSocket dependency, tests, and docs.
- Summary: Added a Socket.IO notifications namespace with access-token session
  authentication, per-user rooms, invalid-session disconnect handling, and
  `notification.created` delivery after `NotificationsService` persists a
  notification row. Skill review responses now report
  `notification.deliveredRealtime`.
- API changes: added Socket.IO namespace `/notifications` with `auth.token` and
  server event `notification.created`.
- Database changes: none.
- Tests/checks: focused gateway/service/review tests passed; architecture check
  passed for 13 modules; lint passed with 0 errors and 10 existing warnings;
  type-check passed; full Jest suite passed with 32 suites and 102 tests; build
  passed; Prisma validation and `git diff --check` passed.
- Docs updated: `docs/api-contracts.md`, `src/modules/notifications/README.md`,
  `specs/002-admin-skill-review/*`, and this tracker.
- Risks/follow-up: real-time delivery is best-effort and in-process. A future
  multi-instance deployment should add a Socket.IO Redis adapter or event bus.

### 2026-07-20 - Project metadata publication import

- Modules: `projects` and `github`.
- Requirement IDs: `TASK-2-03`, `FR-034`, `FR-035`, `FR-036`, `FR-037`,
  `FR-039`.
- Change type: backend API contract, service workflow, tests, and docs.
- Summary: Extended `POST /projects/import/github` so owner/admin imports
  still auto-fetch public GitHub metadata but can now save reviewed project
  metadata as `draft` or `published`. New imports default to `draft`, published
  saves set `published_at`, and draft saves clear it so projects remain hidden
  until owner confirmation.
- API changes: request body now accepts optional `status`, reviewed `title`,
  `description`, `tags`, `technologies`, `category`, and `difficulty`;
  responses now include `category`, `difficulty`, and `publishedAt`.
- Database changes: none; reused existing `Project.status`, `published_at`,
  `category`, `difficulty`, JSON metadata, and GitHub snapshot columns.
- Tests/checks: `npm test -- --runInBand src/modules/projects/projects.service.spec.ts`
  passed; `npm test -- --runInBand test/github-onboarding.spec.ts` passed;
  `npm test -- --runInBand` passed with 35 suites and 117 tests;
  `npm run check:architecture` passed; `npm run lint` passed;
  `npx tsc --noEmit` passed; `npx prisma validate` passed; `npm run build`
  passed.
- Docs updated: `docs/api-contracts.md`, `sharek-api.http`,
  `src/modules/projects/README.md`, and this tracker.
- Risks/follow-up: contributor-facing project discovery is still future work;
  it must filter on `status = published` when implemented.

### 2026-07-20 - Owner projects frontend API connection

- Modules: `projects` and `github`.
- Requirement IDs: `TASK-2-03`, `TASK-4-02`, `FR-034`, `FR-035`, `FR-036`,
  `FR-037`, `FR-039`, `FR-050`.
- Change type: backend API contract, frontend integration support, tests, and
  docs.
- Summary: Added `GET /projects/me` for the owner workspace so the updated
  frontend no longer needs mocked owner project data. The endpoint returns the
  authenticated owner's projects, per-project contribution request/application
  counters, and the monthly request quota view. Also tightened project
  publication so direct API calls cannot publish without reviewed `category`
  and `difficulty`.
- API changes: added protected owner/admin `GET /projects/me`; documented that
  `POST /projects/import/github` published saves require `category` and
  `difficulty`.
- Database changes: none; reused existing project, contribution request, and
  application relations.
- Tests/checks: `npm run check:architecture` passed; backend `npm run lint`
  passed; backend `npx tsc --noEmit` passed; `npx prisma validate` passed;
  focused backend tests passed with 2 suites and 10 tests; full backend
  `npm test -- --runInBand` passed with 35 suites and 119 tests; backend
  `npm run build` passed. Frontend `npx tsc --noEmit`, `npm run lint`,
  `npm test`, and `npm run build` passed.
- Docs updated: `docs/api-contracts.md`, `sharek-api.http`,
  `src/modules/projects/README.md`, frontend owner project contract comment,
  and this tracker.
- Risks/follow-up: quota is currently a fixed Silver-style monthly limit view
  until subscription-plan enforcement is implemented for owner contribution
  requests. Contributor discovery still must filter on `status = published`.

### 2026-07-20 - Contributor profile settings and managed fields

- Modules: `contributor-profiles`, `admin`, `identity`, and frontend contributor
  settings/admin navigation.
- Requirement IDs: frontend backend-handoff `P0-3`; user-requested contributor
  profile settings extension (no dedicated backlog ID).
- Change type: database migration, backend/frontend API implementation, image
  upload, admin catalog management, tests, and documentation.
- Summary: Persisted contributor brief, availability, exact experience ranges,
  dynamic admin-managed fields, and declared skills. Added a settings dropdown,
  explicit PNG/JPEG/WebP avatar upload, public avatar delivery, and an admin
  page for adding, ordering, activating, and deactivating contributor fields.
  Explicit profile images now override provider avatars, while social auth also
  preserves an existing identity avatar when another provider shares the email.
- API changes: added `PATCH /contributors/profiles/me`, `PUT
  /contributors/profiles/me/avatar`, `GET /contributors/profile-fields`, `GET
  /contributors/profiles/:username/avatar`, and admin contributor-field list,
  create, and update endpoints.
- Database changes: migration
  `20260720100000_contributor_profile_settings` adds the experience enum,
  declared skills and explicit avatar columns, contributor-field catalog, and
  contributor-profile field join table, with initial catalog seeds.
- Tests/checks: architecture check, Prisma validation/generation, backend and
  frontend lint/type-check/build passed; full backend Jest suite passed with 35
  suites and 121 tests; full frontend Vitest suite passed with 19 files and 105
  tests; the migration was applied successfully to the local Docker database
  and all new routes compiled with zero watch errors.
- Docs updated: contributor-profiles/admin READMEs, API contracts, database
  ownership plan, and this tracker.
- Risks/follow-up: avatar bytes are stored in PostgreSQL for the current 2 MB
  MVP limit; migrate to object storage if image traffic or database volume
  grows materially.

### 2026-07-20 - Admin workspace routing and operational overview

- Modules: `admin`, `projects`, `skill-profiles`, and frontend admin routing.
- Requirement IDs: `FR-003`, `FR-023`, `FR-031`; user-reported admin workspace
  regression (no dedicated backlog ID).
- Change type: frontend route correction, dashboard data presentation, backend
  read endpoint, focused test, and documentation.
- Summary: Corrected the `/admin` parent route to render nested sidebar pages
  through its outlet, restoring skill reviews, notifications, and contributor
  field management. The overview now lists contributors waiting for skill
  approval and owners with published projects instead of showing only summary
  cards.
- API changes: added protected `GET /admin/published-project-owners`, delegated
  to the exported `ProjectsService`.
- Database changes: none.
- Tests/checks: full backend Jest suite passed with 35 suites and 122 tests;
  backend build/type-check/lint and architecture check passed. Frontend Vitest
  passed with 19 files and 106 tests, lint and production build passed, and all
  three nested admin URLs returned HTTP 200. Docker watch compilation reported
  zero errors and mapped the new endpoint. The full frontend `tsc` gate is
  currently blocked by an unrelated existing `roles-section.tsx` button
  variant mismatch; the changed admin files pass lint and the production build.
- Docs updated: admin/projects READMEs, API contracts, and this tracker.
- Risks/follow-up: the overview intentionally returns only the 10 most recently
  publishing owners; add pagination if this becomes a full admin directory.
