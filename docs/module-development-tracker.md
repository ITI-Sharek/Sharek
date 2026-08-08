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
| `contributor-profiles` | Implemented profile ensure/read/update, explicit avatar upload, and dynamic admin-managed contributor fields and experience levels | root controller/service, DTOs, presenter, validator, field/experience-level catalogs | richer contribution history and object-storage migration if avatar volume requires it | Update when profile visibility, username/profile contracts, profile APIs, or profile persistence changes |
| `skill-profiles` | Implemented durable selected-repository generation, pending-candidate policy, admin review transitions, review audit history, and approved-only eligibility reads | controller/service, generation service, review service, summary service, BullMQ queue/worker, concrete repository | file-level evidence evaluation and future eligibility consumers | Update when skill state, evidence, AI generation, or approval rules are added |
| `notifications` | Implemented notification write service and authenticated WebSocket delivery for contributor skill-review outcomes | notifications service/gateway/module, README | notification inbox, read-state APIs, delivery channels, and broader event-driven alerts | Update when notification rows, delivery behavior, or notification APIs change |
| `contribution-tasks` | Implemented private drafts plus explicit publication, actionable public discovery/detail, owner-plan limits, cancellation, and immutable lifecycle audits | grouped protected/public controllers, focused draft/publication/discovery services, DTOs, mapper, tests, module README | owner decisions/assignment integration and later Proposal-created draft attribution | Update when Contribution Request lifecycle, Requirements, capacity, deadlines, or owner limits are added |
| `applications` | Implemented owner-review submission, review-window lifecycle, owner decisions, Assignments, and bounded advisory Fit Assessment attempts/presentation auditing | controller, services, DTOs, tests, module README | later moderation/reporting and broader workflow consumers | Update when application status, AI decision handling, application APIs, or cancellation effects are added |
| `delivery-reviews` | Registered placeholder module | module README and module file | PR submission, owner review, ratings, delivery-approved event | Update when delivery status, ratings, review APIs, or events are added |
| `reputation` | Partial summary service | module README, module file, reputation service | reputation profile, score history, verified completion updates | Update when scoring rules, history, public reputation APIs, or events are added |
| `admin` | Implemented admin skill review, contributor-field, and experience-level management HTTP routes | admin controllers, DTOs, module README and module file | disputes, reports, moderation views, and broader admin queues | Update when admin queues, review actions, moderation, or audit views are added |
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

### 2026-07-21 - Admin-managed experience levels

- Modules: `contributor-profiles`, `admin`, and frontend contributor
  settings/registration/admin navigation.
- Requirement IDs: user-requested — the registration step-3 "years of
  experience" field was a hardcoded client array with no admin edit path
  (no dedicated backlog ID).
- Change type: database migration, backend/frontend API implementation, admin
  catalog management, tests, and documentation.
- Summary: Replaced the fixed `ContributorExperienceRange` enum with an
  admin-managed `ContributorExperienceLevel` catalog (same shape as
  `ContributorField`), referenced from `ContributorProfile` by
  `experience_level_id`. This unifies the previously divergent hardcoded value
  sets used by the registration step-3 chips (`junior/mid/senior/expert`) and
  the profile-settings dropdown (`zero_to_one/two_to_four/five_to_ten/ten_plus`)
  into one source of truth. Added an admin page for adding, ordering,
  activating, and deactivating experience levels, mirroring the existing
  contributor-fields admin page.
- API changes: added `GET /contributors/experience-levels` (public — no
  access token, since registration step 3 needs the catalog before an
  account/session exists, unlike `/contributors/profile-fields`) and admin
  experience-level list, create, and update endpoints
  (`GET|POST /admin/experience-levels`, `PATCH /admin/experience-levels/:levelId`);
  `PATCH /contributors/profiles/me` now accepts `experienceLevelId` instead of
  `experienceRange`, and the profile response returns `experienceLevel` (an
  object) instead of `experienceRange` (an enum string).
- Database changes: migration `20260721120000_contributor_experience_levels`
  adds the `ContributorExperienceLevel` table (seeded from the old enum
  values), adds `ContributorProfile.experience_level_id` with a backfill from
  the old `experience_range` column, then drops that column and the
  `ContributorExperienceRange` enum type.
- Docs updated: contributor-profiles/admin READMEs and this tracker.
- Risks/follow-up: none — the migration backfills existing profile data before
  dropping the old column, so no profile-level experience data is lost.

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

### 2026-07-21 - GitHub repeated-login account selection

- Modules: `github`, `identity`, and frontend OAuth callback handling.
- Requirement IDs: user-reported OAuth recovery defect (no dedicated backlog
  ID).
- Change type: OAuth authorization behavior, local callback configuration,
  conflict recovery UX, tests, and documentation.
- Summary: Added GitHub's `prompt=select_account` authorization parameter to
  identity-only login and repository connection so a repeated flow opens the
  account picker instead of silently reusing the browser's previous GitHub
  identity. A `GITHUB_ACCOUNT_TAKEN` conflict now shows a clear Arabic message
  and an account-picker retry action; repository connection failures no longer
  erase the active Sharek session.
- API changes: response schemas are unchanged; returned GitHub authorization
  URLs now include `prompt=select_account`.
- Database changes: none.
- Tests/checks: architecture check and backend/frontend lint, type-check, and
  production builds passed; full backend Jest suite passed with 35 suites and
  122 tests; full frontend Vitest suite passed with 21 files and 111 tests. The
  recreated API container compiled with zero errors, and live start responses
  confirmed the account-picker parameter and distinct callback URLs.
- Docs updated: GitHub/identity READMEs, API contracts, and this tracker.
- Risks/follow-up: account selection depends on GitHub's browser account-picker
  support and the user must still choose a GitHub identity not already owned by
  another Sharek account.

### 2026-07-21 - GitHub identity resolution by provider account ID

- Modules: `identity`, `github`, and frontend OAuth callback handling.
- Requirement IDs: `FR-011`; user-reported GitHub identity-mismatch defect.
- Change type: authentication security fix, conflict recovery UX, focused tests,
  and documentation.
- Summary: Removed GitHub's verified-email fallback from social sign-in. An
  existing Sharek user is now resolved only by GitHub's immutable numeric
  account ID through the social-provider link or the exact GitHub connection.
  Added a consistency guard that rejects historical social links when the same
  Sharek user has a different repository-connected GitHub ID. Google
  verified-email linking behavior remains unchanged.
- API changes: route and success response shapes are unchanged. Added `409
  GITHUB_SIGN_IN_EMAIL_CONFLICT` when an unrecognized GitHub identity reports
  an email already registered in Sharek, and `409
  GITHUB_AUTH_ACCOUNT_MISMATCH` when stored social and connected GitHub IDs
  disagree. The frontend presents distinct Arabic recovery guidance and keeps
  the GitHub account-picker retry action.
- Authorization impact: GitHub email is now profile metadata only and cannot
  authenticate an existing Sharek user. Session creation and provider upsert do
  not run after either new conflict.
- Database changes: none; no Prisma schema or migration changes.
- Tests/checks: focused identity regression tests passed (6 tests); full backend
  Jest passed with 35 suites and 124 tests; architecture check, backend/frontend
  lint and type-check, backend/frontend production builds, full frontend Vitest
  with 21 files and 111 tests, and `git diff --check` passed. Docker watch
  compilation reported zero errors and restarted the API successfully.
- Docs updated: identity/GitHub READMEs, API contracts, and this tracker.
- Risks/follow-up: previously created mismatched provider rows are intentionally
  rejected rather than silently reassigned or deleted. The user must sign in to
  the existing Sharek account and disconnect/reconnect GitHub if they want to
  change which GitHub identity that Sharek account owns. Two Sharek users still
  cannot share one email because `User.email` is unique.

### 2026-07-21 - Authenticated GitHub relinking and repository analysis

- Modules: `identity`, `github`, `skill-profiles`, and frontend contributor
  GitHub settings/repository selection.
- Requirement IDs: `FR-011`, `FR-012`, `FR-027`, `FR-028`, `FR-029`, and
  user-reported stale GitHub account-link and disabled-analysis defects.
- Change type: authenticated OAuth account reconciliation, disconnect safety,
  repository-evidence UX activation, tests, and documentation.
- Summary: Added an authenticated GitHub account callback that binds the OAuth
  state to the active Sharek user, rejects GitHub identities owned by another
  user, and atomically replaces that user's stale GitHub sign-in provider row
  with the exact selected GitHub numeric account ID. Unified disconnect now
  removes both repository and sign-in links while preventing passwordless
  account lockout. The contributor repository screen now supports OAuth-backed
  selection of up to 10 repositories, requires explicit analysis consent, and
  starts the existing durable skill-profile generation workflow instead of
  displaying the former GitHub-App-only placeholder.
- API changes: added protected `POST /auth/github/account/callback` and `DELETE
  /auth/github/account`. Repository listing and `POST
  /skill-profiles/me/generations` contracts are unchanged.
- Authorization impact: repository OAuth state must belong to the authenticated
  user; a selected GitHub ID cannot be reassigned from another Sharek user; and
  disconnect is rejected with `GITHUB_DISCONNECT_WOULD_LOCK_ACCOUNT` when
  GitHub is the user's only login method.
- Database changes: none; reconciliation uses the existing `github_accounts`
  and `auth_provider_accounts` ownership constraints and requires no migration.
- Tests/checks: focused identity tests passed with 9 tests and callback e2e
  tests passed with 4 tests; full backend Jest passed with 35 suites and 127
  tests; full frontend Vitest passed with 21 files and 111 tests. Backend and
  frontend lint, TypeScript checks, production builds, backend architecture
  check, and `git diff --check` passed. Live Docker checks returned API health
  200, Redis `PONG`, FastAPI health 200, and confirmed the configured FastAPI
  OpenAPI contract exposes `POST /skill-profiles/generate`.
- Docs updated: identity/GitHub/skill-profiles READMEs, API contracts, frontend
  repository-flow specification, and this tracker.
- Risks/follow-up: OAuth repository access is the current explicit-consent MVP;
  a future GitHub App installation flow can offer narrower per-repository grants
  without blocking the implemented analysis workflow. Existing mismatches are
  reconciled only after the owner signs in and successfully completes Change
  account; they are never silently moved between Sharek users.

### 2026-07-21 - Constitution and Sprint 2 governance reconciliation

- Modules: project-wide governance and planning templates; no runtime module
  behavior changed.
- Requirement/task IDs: project-wide constitution; ADR-002; SK-112, SK-113,
  and SK-114 planning alignment.
- Change type: constitution amendment, Spec Kit template synchronization, and
  Sprint 2 planning correction only.
- Summary: Reconciled the constitution with the accepted standard NestJS
  feature-first architecture, three account roles plus contextual resource
  authorization, GitHub App-only private repository access target, evidence
  privacy, advisory AI, explicit state transitions, forward-only migrations,
  brownfield delivery discipline, and integration resilience. Updated the
  Sprint 2 plan to recognize the implemented SK-112/SK-113 work and require a
  gap audit before any bounded corrective specification.
- API/database changes: none; no product code or Prisma migration changed.
- Checks: constitution/template consistency checks, architecture check, and
  whitespace validation are recorded in the task handoff.
- Docs updated: `.specify/memory/constitution.md`, Spec Kit plan/spec/tasks
  templates, `docs/sprints/sprint_2_backend_first_specKit_plan.md`, and this
  tracker.
- Risks/follow-up: synchronize the later advisory-only AI policy with the
  canonical decision log and affected PRD requirements; record and plan the
  GitHub App migration because current repository OAuth behavior does not yet
  meet the approved private-access target; revalidate Jira status before any
  Jira mutation.

### 2026-07-21 - Account-mode capability constitution amendment

- Modules: project-wide governance and SK-112 planning artifacts; no runtime
  module behavior changed.
- Requirement/task IDs: constitution v3.0.0; Jira SK-112; backlog TASK-2-03;
  PRD FR-034 through FR-039.
- Change type: governance and specification synchronization only.
- Summary: Recorded the clarified decision that OWNER and CONTRIBUTOR remain
  account modes for primary journeys but may both create and own projects and
  contribute elsewhere without changing role. Preserved contextual ownership,
  application, assignment, account-status, and explicit Admin authorization.
  Also synchronized public personal-repository identity proof and
  organization/shared GitHub App selection rules.
- API/database changes: none; current OWNER/ADMIN project routes and persistence
  remain unchanged until the approved SK-112 implementation plan is executed.
- Checks: constitution, templates, active specification, decision log, Sprint 2
  guidance, architecture rules, and whitespace/version consistency validated.
- Docs updated: constitution, canonical decision log, Spec Kit templates,
  clarified SK-112 specification/checklist, Sprint 2 plan, and this tracker.
- Risks/follow-up: SK-112 planning must address current route authorization,
  duplicate-draft/publication uniqueness, explicit preview/draft/publication,
  published-to-archived withdrawal, GitHub App persistence, and migration/data
  compatibility without duplicating the existing project module.

### 2026-07-26 - Project discovery APIs (TASK-3-05)

- Modules: `projects`.
- Requirement/task IDs: backlog TASK-3-05 (deps TASK-2-03, TASK-2-05);
  PRD FR-038.
- Change type: new read endpoint plus supporting DTOs, mapper, and tests.
- Summary: Added `GET /projects/discover`, an authenticated
  contributor/owner/admin discovery feed that returns published projects only.
  Supports pagination and filtering by technology stack, category, difficulty,
  and a title/description keyword search. Each item carries `discoveryMetadata`
  (source attribution plus a keyword set and composed semantic text) mirroring
  the metadata indexed for semantic discovery. Draft and archived projects are
  excluded via a published-only Prisma `where` guard.
- API/database changes: new `GET /projects/discover` route; no schema or Prisma
  migration change (reads existing project-owned columns only).
- Checks: `check:architecture`, `eslint`, `tsc --noEmit`, `jest` (130 tests),
  and `nest build` all pass.
- Docs updated: `src/modules/projects/README.md`, `docs/api-contracts.md`, and
  this tracker.
- Risks/follow-up: technology filtering uses Postgres JSON `array_contains`, so
  matches are case-sensitive against stored values; a normalized technology
  facet/aggregation for the frontend filter (TASK-3-06) and the FastAPI semantic
  ranking layer (TASK-2-05) remain follow-ups.

### 2026-07-26 - Optional GitHub skill-profiling specification

- Modules: project-wide product governance; future changes will be owned by
  `github`, `skill-profiles`, `contributor-profiles`, `identity`, and `ai`.
- Requirement/task IDs: PRD FR-011 through FR-014, FR-027 through FR-033,
  FR-083, FR-084, FR-088, FR-090, FR-094; backlog TASK-1-04, TASK-1-05, and
  TASK-3-02 through TASK-3-04; Constitution v3.1.0; ADR-002.
- Change type: product requirement synchronization, constitution amendment,
  and Spec Kit specification/technical planning only.
- Summary: Separated registration and normal profile access from optional
  GitHub skill profiling. Defined the target GitHub App installation boundary,
  explicit repository selection, analysis consent, explicit generation start,
  profile-based status presentation, admin review, and revocation behavior.
- API/database changes: none; current broad repository OAuth implementation is
  documented as brownfield behavior to migrate during later implementation.
- Checks: Spec Kit requirements checklist passed without clarification markers;
  pre/post-design constitution gates passed; constitution version/template
  consistency and `git diff --check` passed.
- Docs updated: Feature 1 PRD, backlog, Sprint 1-3 journeys, Constitution v3.1.0,
  Spec Kit plan template, active feature pointer, managed `AGENTS.md` plan
  reference, and
  `specs/004-optional-github-skill-profile/`.
- Task generation: added 66 dependency-ordered tasks across configuration,
  additive persistence, repository-free profile behavior, verified GitHub App
  installation, explicit-consent generation, revocation, cutover, tests, and
  final verification in `specs/004-optional-github-skill-profile/tasks.md`.
- Post-analysis remediation: ran the Spec Kit clarification workflow with five
  accepted decisions, then synchronized plan/research/model/contracts/quickstart
  and regenerated task coverage for pending-user permissions, multiple
  installations, 30-day legacy evidence cleanup, local disconnect versus
  provider uninstall, explicit retry, public private-evidence redaction tests,
  latency/revocation thresholds, bounded provider retries, and usability
  validation. The specification checklist remains 16/16 passing.
- Final Spec Kit analysis remediation (2026-07-27): clarified that one canonical
  organization GitHub App installation may have multiple independently verified
  Share-k user links while each user's selection, consent, generations, skills,
  and disconnect remain isolated. Updated the data model and contracts to use an
  installation/link join boundary and live access checks rather than an
  undefined verification-age threshold. Replaced the incorrect `AuthService`
  authorization task with audit-first guard/controller tests, added the retry
  controller task and explicit AI/log redaction paths, inventoried legacy fields,
  split the 30-day cleanup into module-owned controlled-clock tasks/tests, and
  classified the ten-person usability exercise as external release evidence.
- Risks/follow-up: create the technical plan before code changes; register a
  development GitHub App only after callback, setup, webhook, credential, data
  migration, and compatibility contracts are planned. The optional agent-context
  refresh could not run because Python with PyYAML is unavailable; no context
  file was changed.

### 2026-07-27 - Optional GitHub App skill-profiling implementation

- Modules: `github`, `skill-profiles`, `contributor-profiles`, with preserved
  identity-only GitHub login and anonymous public-project import boundaries.
- Requirement/task IDs: Feature 1 FR-001 through FR-021, TS-001 through TS-008,
  PRD FR-011 through FR-014 and FR-027 through FR-033; completed Spec Kit tasks
  are recorded individually in `specs/004-optional-github-skill-profile/tasks.md`.
- Summary: added selected-repository GitHub App configuration, RS256 app JWT and
  raw-body HMAC boundaries, provider client, canonical installations, isolated
  verified member links, mutable immutable-ID repository membership, expiring
  single-use callback attempts, selected-repository picker, local disconnect,
  signed idempotent lifecycle webhooks, explicit versioned generation consent,
  retry-as-new-generation, on-demand installation-token evidence, pending skill
  review preservation, public evidence redaction, audited broad-OAuth cutover,
  and module-owned day-30 cleanup operations. Installation alone never enqueues
  analysis. Organization installations may be shared only through separately
  verified member links.
- API changes: added `POST /github/app/installations/start`, browser `GET
  /auth/github/app/callback`, protected completion/status/repository/disconnect
  routes, `POST /webhooks/github/app`, and generation retry. Generation start now
  requires `installationLinkId`, immutable `repositoryIds`, and consent version
  `github-skill-analysis-v1`. Legacy repository OAuth routes return the stable
  migration error after the database cutover clock is set; new OAuth grants no
  longer request `repo` or `public_repo`.
- Authorization/privacy impact: every picker/start/worker boundary performs live
  member and repository validation; installation credentials are ephemeral;
  member/refresh tokens are encrypted per user link; callback codes/tokens never
  reach the frontend; local disconnect does not uninstall or delete social
  identity; other-user/public skill output excludes private evidence summaries.
- Database changes: additive migration
  `20260727120000_add_github_app_foundation` creates installation/link/repository,
  callback-attempt, webhook-delivery, and singleton cutover state plus immutable
  generation authorization/consent snapshots. Forward migration
  `20260727140000_nullable_legacy_github_credentials` makes the legacy access
  token nullable for audited purge. Both migrations were applied with `prisma
  migrate deploy` to the running local Docker PostgreSQL database; `prisma
  migrate status` reports all 16 repository migrations applied. No staging or
  production database was changed.
- Configuration: documented and passed through GitHub App IDs, client secret,
  Base64 private key, webhook secret/proxy, installation/callback/return URLs,
  and existing slug/full-app-URL forms. Existing `.env` values and GitHub App
  configuration were not changed.
- Verification: `docker compose exec -T api npx prisma migrate deploy` applied
  both Feature 1 migrations; containerized `npx prisma migrate status` reported
  the schema current. `npx prisma validate` and `npx prisma generate` passed;
  focused GitHub/skill-profile acceptance tests passed; `npm run
  check:architecture` passed for 13 modules; `npm run lint`, `npx tsc --noEmit`,
  `npm run build`, and `git diff --check` passed. The final permitted full
  `npx jest --runInBand` run passed 51 suites and 210 tests. Initial
  unprivileged E2E failures were solely local socket `EPERM`; the permitted runs
  passed.
- Documentation: updated module READMEs, local development/Smee guidance, API
  contracts and REST examples, database cutover plan, team onboarding, Feature 1
  research/quickstart/tasks, and this tracker.
- Known risks/release blockers: the two migrations still require representative
  brownfield/staging validation and rollback review; live GitHub provider,
  organization-approval, webhook replay, and end-to-end revocation exercises
  require external credentials/public HTTPS. The SC-004 usability result remains
  honestly `0/10` and pending external validation. T065 is now the only unchecked
  task because it requires a deployed pre-release environment and ten real
  representative contributors; all repository-executable tasks are complete.

### 2026-07-27 - Feature 1 frontend integration-gap remediation

- Modules: `github` and `skill-profiles`.
- Requirement IDs: Feature 1 installation completion, explicit provider
  installation choice, idempotent generation recovery, and frontend handoff.
- Summary: added authenticated callback-attempt candidate retrieval so a
  frontend receiving an opaque `attemptId` can safely select a server-verified
  personal or organization installation before protected completion. Added
  latest-generation retrieval and active-generation conflict metadata so a
  contributor can recover polling after reload or a duplicate start.
- API changes: added `GET
  /github/app/installations/attempts/:attemptId` and `GET
  /skill-profiles/me/generations/latest`. The existing
  `SKILL_PROFILE_GENERATION_ALREADY_ACTIVE` 409 response now includes the owned
  active `generationId` in `metadata`.
- Authorization/privacy impact: attempt lookup requires the normal access-token
  guard and filters by attempt ID, authenticated user, callback-processed state,
  unconsumed completion, and expiry. It returns only provider installation ID,
  account login/type, attempt ID, and expiry; pending credentials, state hashes,
  and raw provider payloads remain private. Reauthorization attempts expose only
  their intended target candidate. Latest-generation lookup is user-scoped.
- Database changes: none; both operations read existing GitHub-owned and
  skill-profiles-owned tables, so no Prisma migration was needed.
- Documentation: corrected stale legacy repository-name generation examples and
  updated the Feature 1 HTTP contract, module READMEs, API contracts, and REST
  examples with the candidate and reload-recovery flows.
- Verification: focused service/repository tests passed 32/32; updated HTTP
  contract suites passed 10/10; `npm run check:architecture`, `npm run lint`,
  `npx tsc --noEmit`, `npx prisma validate`, `npm run build`, and `git diff
  --check` passed. The full `npx jest --runInBand` run passed 51 suites and 218
  tests.
- Known risks/follow-up: repository-executable frontend blockers are resolved.
  Real GitHub provider/organization approval and SC-004 ten-contributor
  pre-release validation remain external release evidence.

### 2026-07-27 - Canonical documentation architecture-check repair

- Modules: all backend modules; no runtime module behavior changed.
- Requirement/task IDs: DEC-040 documentation ownership; backend PR #45 CI.
- Change type: architecture tooling and documentation.
- Summary: Replaced the architecture check's required path to the deleted local
  BMAD ADR copy with the repository-local canonical-documentation pointer.
  `docs/architecture.md` remains the required and enforced backend architecture
  contract, while historical rationale stays in the shared Documentation
  repository.
- API/database changes: none.
- Tests/checks: `npm run check:architecture`, `git diff --check`.
- Docs updated: this tracker.
- Risks/follow-up: backend CI verifies the local pointer and implementation
  contract but does not clone or validate the separate private Documentation
  repository.

### 2026-07-28 - Contribution Request private draft lifecycle (#48)

- Module: `contribution-tasks`, with one exported read capability added to
  `projects`.
- Requirement/task IDs: Sprint 4 B02, GitHub issue #48; canonical decisions
  DEC-036 through DEC-039 and the Contribution Request domain contract.
- Summary: implemented owner-only create, inspect, update, and terminal
  idempotent discard for private Contribution Request drafts. Required and
  Preferred Requirements are separate ordered records; technology tags remain
  request metadata. Updates use optimistic concurrency, state changes and audit
  appends are transactional, and client owner IDs are not accepted.
- API changes: added `POST /projects/:projectId/contribution-requests`, `GET` and
  `PATCH /contribution-requests/:requestId`, and `POST
  /contribution-requests/:requestId/discard`, with dedicated DTO responses,
  audience-safe non-enumeration, stable domain errors, and optional command
  idempotency keys.
- Authorization: only an authenticated active `owner` may use the lifecycle.
  The contribution-tasks module obtains Project ownership/publication facts
  exclusively through exported `ProjectsService`; it does not read or write
  Project tables.
- Database changes: forward-only migration
  `20260728013000_contribution_request_drafts` preserves legacy request rows,
  adds `discarded`, Applications Close Time, ordered Requirement rows, and
  append-only audit rows. It was applied to local Docker PostgreSQL; all 17
  migrations report current. No Application schema or migration was changed.
- Documentation: updated the module README, API contracts, REST examples,
  database plan, and this tracker.
- Verification: `npx prisma format`, `npx prisma validate`, local `prisma
  migrate deploy/status`, 33 focused service/Project/HTTP tests, `npm run
  check:architecture`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and
  `git diff --check` passed. The full `npm test -- --runInBand` run passed 53
  suites and 241 tests.
- Dependency blocker: issue #49 was intentionally not started. Live issue #47
  remains open and the current `ApplicationStatus` still contains the legacy
  `pending_validation`, `eligible`, and `ineligible` states with no approved
  `REQUEST_CANCELLED` representation. Publication/cancellation cannot safely
  update existing non-terminal Applications until #47 lands; duplicating that
  other developer's migration would violate task ownership.
- Known risks/follow-up: legacy Contribution Request rows have no structured
  Requirement rows or Applications Close Time and therefore return an explicit
  completeness error if edited. Issue #49 must add its own forward migration
  for publish/cancel audit actions after rebasing on #47, then cover public
  filters, close-time boundaries, entitlements/limits, and Application
  cancellation propagation.

### 2026-07-28 - Owner project publication and public discovery

- Modules: `projects`, with allowlisted source-control support from `github` and
  authenticated-account lookup from `identity`.
- Requirement/task IDs: SK-112 / TASK-2-03; the core preview, draft,
  owner-edit, refresh, publication/archive, authorization, idempotency, and
  minimal public-read paths across FR-001 through FR-023. The hardening items
  called out below remain open.
- Summary: replaced the retired combined GitHub import behavior with explicit
  preview, confirmed draft creation, owner detail/edit/refresh/publish/archive,
  and minimal public list/detail flows. Owner mutations use actor-derived
  ownership, optimistic revisions, scoped idempotency receipts, live source
  checks, manual-override preservation, and audited state transitions. Missing
  and non-owned resources share the same not-found response.
- API changes: added `POST /projects/github/preview`, `POST /projects`, owner
  routes under `/projects/me`, and public reads under `/public/projects`; the
  legacy `POST /projects/import/github` route now returns `410 Gone`.
- Authorization/privacy impact: only active owners and contributors can create
  and mutate owned projects; an ordinary admin role is not an owner bypass.
  Personal repositories are matched to the immutable linked GitHub identity,
  organization/private repositories require a selected GitHub App installation,
  and private source metadata is withheld after current access is lost. Public
  responses expose only the publication-safe projection.
- Database changes: added project slug/revision/source-state/manual-override and
  archival fields plus `ProjectOperation` and `ProjectStateTransition`. Migration
  `20260728120000_project_publication_owner_flow` backfills legacy slugs, removes
  the global repository-URL uniqueness rule, and adds the published-repository
  partial uniqueness guard. The migration was generated and validated but was
  not applied to any database.
- Documentation: updated the projects, GitHub, and identity module READMEs, API
  contracts, database plan, Postman guide, REST examples, and this tracker.
- Verification: focused projects, GitHub client, identity, configuration, and
  HTTP contract tests cover zero-write preview, ownership concealment, revision
  conflicts, idempotent mutations, publish/archive rules, private-access loss,
  provider failures, and public projections. Final repository-wide architecture,
  lint, type-check, Prisma validation, tests, build, and diff checks are recorded
  in the implementation handoff.
- Known risks/follow-up: this increment does not yet add webhook-driven source
  invalidation, immutable publication snapshot/refresh-attempt tables, receipt
  retention cleanup, or the optional idempotency replay response header. Those
  hardening items remain follow-up work rather than being represented as complete.

### 2026-07-28 - Application owner-review state migration (#47)

- Modules: `applications`, with an owner-workspace summary adjustment in
  `projects`.
- Requirement/task IDs: Sprint 4 B01, GitHub issue #47, DEC-030/031/036.
- Summary: replaced the superseded AI-validation Application states with
  `pending_owner_review`, `accepted`, `declined_by_owner`, `not_selected`,
  `expired`, `withdrawn`, and `request_cancelled`. Project summaries now count
  only Applications awaiting owner review through an exported Applications
  summary reader instead of reading or interpreting AI eligibility states.
- Database changes: forward-only migration
  `20260728150000_application_owner_review_states` preserves accepted and
  withdrawn outcomes, treats legacy rejection as an owner decline only when
  `owner_reviewed_at` proves the action, and derives unresolved outcomes from
  the parent Contribution Request without turning AI `ineligible` into a human
  decline. Invalid unresolved Applications attached to non-actionable draft
  Requests abort with an explicit recovery hint rather than entering an owner
  queue.
- API/authorization impact: no routes, DTO shapes, or authorization rules
  changed. Existing owner project summaries retain their response shape while
  adopting owner-review semantics.
- Verification: the real PostgreSQL migration regression harness passed with
  16 representative legacy rows plus the draft-parent guard; all 58 Jest suites
  and 260 tests passed.
  `npm run check:architecture`, `npm run lint`, `npx tsc --noEmit`, `npm run
  build`, `npx prisma validate`, and `git diff --check` passed. Backend CI now
  runs the migration harness against PostgreSQL 16.
- Documentation: updated Applications, Projects, Contribution Requests, API
  contract, database plan, and this tracker.
- Follow-up: issue #49 can now implement Contribution Request publication and
  cancellation propagation using `request_cancelled`; Application submission,
  expiry, Owner Decisions, and Assignments remain later Sprint 4 work.

### 2026-07-28 - Contribution Request draft review hardening (#48)

- Modules: `contribution-tasks` and the exported Project-access capability in
  `projects`.
- Requirement/task IDs: Sprint 4 B02, GitHub issue #48.
- Summary: reviewed the implemented private draft lifecycle and corrected its
  remaining contract gaps. Missing, malformed, and duplicate Requirements now
  return stable audience-safe codes. Project ownership and publication are
  revalidated on the write transaction connection. Same-key concurrent
  update/discard retries replay the completed command, while a discarded-command
  key reused with a different reason returns the documented idempotency conflict.
- Database/API impact: no schema, migration, route, or successful response shape
  changed.
- Verification: focused service, Project access, and HTTP contract tests cover
  the corrected validation and idempotency behavior; final repository-wide
  gates are recorded in the implementation handoff.

### 2026-07-28 - Submit and withdraw Applications (#50)

- Modules: `applications`, with narrow exported Request context from
  `contribution-tasks`, Application-status notifications from `notifications`,
  approved evidence summaries from `skill-profiles`, and existing owner project
  summary wiring in `projects`.
- Requirement/task IDs: Sprint 4 B04, GitHub issue #50, DEC-030/031/035/036,
  parent specification #46.
- Summary: active contributors can submit one Application per actionable
  published Contribution Request with a Contribution Approach and Proposed
  Delivery Duration. Submission transactionally fixes ordered Requirement and
  authorized Evidence Snapshots, enters `pending_owner_review` immediately,
  appends an audit, and notifies the owner without AI or attempt-quota work.
  Owners can list/inspect the pending Application, and its contributor can
  withdraw it before any terminal decision.
- API changes: added `POST /tasks/:taskId/applications`, `GET
  /tasks/:taskId/applications`, `GET /applications/:applicationId`, and `POST
  /applications/:applicationId/withdraw`. Stable lifecycle, authorization,
  duplicate, close-time, terminal, and idempotency codes are documented in
  `docs/api-contracts.md`.
- Database changes: migration
  `20260728200000_application_submission_withdrawal` adds Application input and
  review-timing fields, immutable Requirement/Evidence Snapshot tables,
  append-only Application audits, contributor/Request uniqueness, query indexes,
  and notification deduplication. Legacy rows retain nullable snapshot/duration
  fields because missing historical values are not invented.
- Authorization/privacy: only active contributors submit or withdraw; only the
  Request owner lists, while detail is limited to owner or applying contributor.
  Evidence uses approved skill summaries and bounded evidence-source metadata from
  repositories explicitly authorized during skill-profile generation; submission
  grants no new repository access, and public/private provider data is not
  returned. Owner-safe reads include profile context fixed at submission.
- Verification: focused Applications service and HTTP tests plus Notifications
  and Contribution Request tests pass. Prisma validation passes. The PostgreSQL
  migration harness could not run because no server was listening on
  `localhost:5432`; final architecture, lint, type-check, full tests, build, and
  diff results are recorded in the implementation handoff.
- Dependency/risk: issue #49 remains responsible for public Request publication,
  discovery, cancellation, and cancellation propagation. #50 consumes a
  transaction-scoped read/lock context and does not implement those commands.

### 2026-07-29 - Owner Decisions, Assignments, and feedback reports (#51)

- Modules: `applications`, with a transaction-scoped Request transition from
  `contribution-tasks`, outcome delivery from `notifications`, and decision
  feedback moderation in `admin`.
- Requirement/task IDs: Sprint 4 B05, GitHub issue #51, TASK-4-06/07,
  DEC-005/030/031/036, ADR-0002.
- Summary: Project owners now accept or decline pending Applications through
  idempotent commands. Acceptance atomically creates an immutable Owner Decision
  and one Assignment, derives the due date from the accepted Application's
  Proposed Delivery Duration, assigns the Request, and closes pending siblings
  as `not_selected` without manufacturing decline feedback. Decline requires
  trimmed non-empty feedback and affects only the chosen Application. AI
  assessment is excluded from visibility and decision predicates.
- Authorization and delivery hardening: both decisions revalidate current
  Project ownership through the Projects module on the caller transaction before
  resolving an idempotent replay. Durable affected-party notifications are
  written on that transaction and emitted realtime only after commit.
- Database changes: migration `20260729120000_owner_decisions_assignments` adds
  Owner Decisions, Assignments, decision/request audit actions, Assignment
  uniqueness, owner command idempotency, and the combined PostgreSQL decline
  feedback check (`feedback IS NOT NULL AND btrim(feedback) <> ''`). The existing
  Report model gains a minimal Owner Decision foreign key.
- API/authorization impact: added owner-only `POST
  /applications/:applicationId/accept` and `/decline`, with ownership and state
  rechecked inside the transaction, plus contributor-only `POST
  /owner-decisions/:ownerDecisionId/reports`. Reporting is moderation, not an
  appeal, and does not mutate Application state.
- Verification: contract, service, authorization, concurrency, idempotency,
  notification, and PostgreSQL constraint fixtures cover the #51 flows. The
  PostgreSQL migration harness, architecture check, lint, exact type-check,
  Prisma validation, build, and all 61 Jest suites / 319 tests pass.
### 2026-07-28 - Publish, discover, and cancel Contribution Requests (#49)

- Modules: `contribution-tasks`, with transaction-scoped cancellation effects
  through the exported `ApplicationsService`.
- Requirement/task IDs: Sprint 4 B03, GitHub issue #49, TASK-4-02/4-03,
  FR-046 through FR-050, FR-073 through FR-075, DEC-026/031/036, and parent
  specification #46.
- Summary: added explicit idempotent `draft -> published` and `published ->
  cancelled` owner commands. Publication rechecks Project ownership/state,
  completeness, close time, and current Bronze/Silver/Gold monthly usage under
  a serialized owner scope. Public feed/detail queries expose only published
  Requests with a future Applications Close Time and preserve Required versus
  Preferred Requirement classification.
- API changes: added protected `POST /contribution-requests/:id/publish` and
  `POST /contribution-requests/:id/cancel`, plus public `GET /tasks` and `GET
  /tasks/:id`. Feed filters are `q`, `technologies`, `difficulty`, and
  `hasReward`; stable publication-limit, state, and audience-safe not-found
  codes are documented.
- Database changes: migration
  `20260728230000_contribution_request_publication` adds Request
  `published`/`cancelled` and Application `request_cancelled` audit actions plus
  the actionable-read index. Request cancellation and every still-pending
  Application transition/audit are committed atomically; terminal Application
  history is unchanged.
- Authorization/privacy: owner commands derive the actor from the bearer
  session and recheck owned published Project access in the transaction. Public
  reads return dedicated allowlisted DTOs and never expose owner identity,
  Applications, audits, subscription records, or draft/cancelled identifiers.
- Architecture: grouped controllers and focused draft, publication, and public
  discovery services keep the module seams explicit. Discovery obtains Project
  title/slug projections only through the exported `ProjectsService`.
- Documentation: updated Contribution Requests, Applications, API contracts,
  REST examples, database plan, and this tracker.
- Verification: focused Request/Application service suites and both mocked and
  real-service Supertest HTTP contracts pass. Architecture, lint, type-check,
  Prisma validation, build, migration harness/status, and diff checks pass.
  The final full suite passes 62 suites and 313 tests.
- Known risk/follow-up: payment processing remains intentionally absent. The
  current Subscription table supplies plan context and owners without an active
  assignment receive Bronze; the broader admin/demo entitlement management API
  remains the separately scheduled subscription capability.

## 2026-07-28 — Contribution Request and Application Postman workflow

- Scope: Issues #48, #49, and #50 endpoint handoff.
- Documentation: added all eight Contribution Request draft/public lifecycle
  endpoints and retained the four Application endpoints. Audited every NestJS
  controller and filled the collection out to all 87 current HTTP routes,
  including canonical Projects, GitHub App, Skill Profiles, Contributor
  Profiles, Admin, and supplemental Identity routes. Added runnable auth,
  Project, Request, provider, catalog, date, and idempotency variables to the
  collection and local environment.
- Workflow: draft creation captures `contributionRequestId`; future close and
  completion dates are generated automatically; discard uses a separate draft
  ID so publication, discovery, Application, withdrawal, and cancellation can
  be tested without destroying the shared workflow state early.
- Verification: both Postman JSON files parse successfully. An exact
  method/path inventory reports 87 controller routes and zero missing Postman
  routes (91 requests total, including login/workflow duplicates).

## 2026-07-28 — Issues #49/#50 integration hardening

- Modules: `projects`, `contribution-tasks`, `applications`, `skill-profiles`,
  and `github`.
- Summary: closed the dependency-order gaps between Request publication and
  Application submission. Public Request reads and submission now require the
  parent Project to remain published, while the owning owner can still cancel
  a published Request after Project archival so pending Applications are not
  stranded.
- Consistency: the Project dashboard and Request publication use one canonical
  Bronze/Silver/Gold entitlement lookup. Dashboard usage now counts
  `published_at` in the current UTC month, matching publication enforcement.
- Evidence/privacy: Application Evidence Snapshot creation transactionally
  revalidates and locks the contributor's active GitHub App link, installation,
  selected repositories, consent, and matching generation. Revoked or legacy
  unverifiable evidence is excluded.
- Auditability: Request cancellation allocates its audit ID before propagating
  child state changes. Every resulting Application audit records the supplied
  reason, shared correlation ID, and parent Request audit ID as causation.
- Tests: added archived-Project discovery/submission cases, plan-aware quota
  assertions, transactional evidence-authorization cases, stable lifecycle HTTP
  errors, and a real HTTP/service cancellation seam covering child transitions,
  audit linkage, and subsequent `REQUEST_CANCELLED` rejection.
- Verification: architecture, lint, type-check, Prisma validation, build,
  migration regression, Postman JSON/route inventory, and diff checks pass. The
  full Jest run passes 62 suites and 325 tests.

## 2026-07-28 — Owner Project Contribution Request lifecycle list

- Module: `contribution-tasks`; frontend dependency: owner Project workspace
  Issue #4 acceptance criterion.
- API: added protected `GET /projects/:projectId/contribution-requests` for an
  active owner. The response contains `projectId`, `totalCount`, and an
  exhaustive `byStatus` object for all six persisted Request lifecycle states.
- Authorization: Project ownership is checked through the exported Projects
  capability and the Request query is also owner-scoped. Owned archived Projects
  remain readable so lifecycle history does not disappear from the workspace;
  unknown and other-owner Projects retain the safe Project-not-found response.
- Frontend contract: every status key is always present and items use the full
  owner-safe Contribution Request DTO, ordered by latest update within each
  group. The frontend can render sections directly without maintaining a local
  draft list or inferring missing states.
- Documentation/testing: added service and HTTP contract coverage, REST and API
  examples, module documentation, and a runnable Postman request.
- Verification: architecture, lint, type-check, Prisma validation, production
  build, Postman JSON/route inventory, and diff checks pass. The full Jest run
  passes 62 suites and 327 tests.

## 2026-07-29 - Contribution Proposals: submit, version, withdraw (S4-B09)

- Modules: `contribution-proposals` (new), `projects` (added exported read and
  transaction-lock capabilities).
- Requirement/task IDs: GitHub issue #55 (S4-B09); parent spec issue #46;
  `specs/005-sprint-4-contribution-workflows/spec.md`; ADR 0002, ADR 0003.
- Change type: new module, new Prisma models + migration, one exported
  ProjectsService method, HTTP-contract and service tests.
- Summary: Added the `contribution-proposals` module owning contributor-authored
  Contribution Proposals with immutable versions, owner revision requests
  (append-only), withdrawal, private proposer/owner visibility, per-Project
  intake control, and anti-spam rate limits. Submission enforces an active
  published Project, intake enabled, the attribution-and-assignment disclosure,
  a daily submission cap, and one pending proposal per Project (that last rule was
  dropped later in Sprint 4 — see S4-B10 below). Only the proposer
  can answer a revision request with a new version; owners never edit
  contributor-authored content. All state changes append immutable audit records
  with idempotency keys and command fingerprints. The module reads Project facts
  only through exported `ProjectsService` capabilities.
- API/database changes: new routes under `/contribution-proposals`; new
  migration `20260729122140_contribution_proposals` adding `ContributionProposal`,
  `ContributionProposalVersion`, `ContributionProposalAudit`,
  `ProjectProposalIntake`, and the `ContributionProposalStatus` /
  `ContributionProposalAuditAction` enums. No existing table was modified beyond
  additive back-relations.
- Checks: `check:architecture`, `eslint`, `tsc --noEmit`, `jest` (full suite),
  and `nest build` all pass. Migration generated and applied against a throwaway
  Postgres via `prisma migrate dev`.
- Docs updated: module README, developer architecture guide, API contracts,
  database plan, and this tracker.
- Risks/follow-up: proposal acceptance into an attributed draft Contribution
  Request (S4-B10) and decline/misuse-report handling remain out of scope; owner
  submission notifications were intentionally deferred to keep this slice focused.

## 2026-07-29 - PR #62 Contribution Proposal review hardening

- Requirement/task IDs: GitHub issue #55 and PR #62.
- Contract: replaced the generic proposal body with the canonical problem or
  opportunity, proposed outcome, and Project benefit fields; added bounded
  cursor pagination to both list routes and runnable REST/Postman examples for
  all eight endpoints.
- Consistency: submission now locks and revalidates Project publication, intake,
  daily rate, idempotency replay, and pending-proposal state inside the write
  transaction. A PostgreSQL partial unique index protects the one-pending rule
  (superseded later in Sprint 4 — migration
  `20260730131000_allow_multiple_pending_proposals` drops both the rule and the
  index), while revision request sequencing prevents a concurrent version from clearing
  a newer owner request. Prisma failures are mapped only when their exact
  constraint is known.
- Tests: added transaction, constraint-error, cursor, revision race,
  HTTP-to-service, and Project-lock coverage. Applied the migration to an
  isolated PostgreSQL 14 database and verified that a duplicate pending row is
  rejected while a new pending row is allowed after withdrawal.
- Verification: architecture, lint, type-check, Prisma schema validation,
  focused tests, and the full Jest run pass; the full run covers 64 suites and
  361 tests.

### 2026-07-29 - Contribution Proposals: respond and adopt (S4-B10)

- Modules: `contribution-proposals`, `contribution-tasks` (exported draft
  creation + attribution exposure).
- Requirement/task IDs: GitHub issue #56 (S4-B10); parent spec issue #46;
  `specs/005-sprint-4-contribution-workflows/spec.md`; ADR 0002, ADR 0003.
- Change type: new owner-response endpoints, cross-module attributed-draft
  creation, new Prisma states/columns/table + migration, and tests.
- Summary: Added owner `accept` and `decline` responses plus contributor/owner
  `misuse-reports` to the proposals module. Accept flips a pending proposal to
  `accepted` under a transaction-scoped Project lock, owner check, and optimistic
  guard, then creates exactly one owner-controlled draft Contribution Request from
  the latest Proposal Version through the exported
  `ContributionTasksService.createDraftFromAcceptedProposal`, with immutable
  proposer attribution and no Assignment/Application/quota/selection priority.
  Decline is terminal with a contributor-visible reason. Misuse reports store an
  immutable authorship-evidence snapshot with no automatic findings. Published
  resulting Requests expose approved attribution through the public detail view;
  draft fields stay owner-only and a discarded draft never reopens the proposal.
  All commands are idempotent and append immutable audit rows.
- API/database changes: new `POST /contribution-proposals/:id/{accept,decline}`
  and `POST /contribution-proposals/:id/misuse-reports`; migration
  `20260729140000_proposal_response_and_adoption` adds `accepted`/`declined`
  proposal states and audit actions, `accepted_at`/`declined_at`/`decline_reason`,
  `ContributionRequest.origin_proposal_id` (unique) + `attributed_contributor_id`,
  and the `ContributionProposalMisuseReport` table.
- Checks: `check:architecture`, `eslint`, `tsc --noEmit`, `jest` (376 tests), and
  `nest build` all pass. Migration generated with `migrate diff` and applied to a
  throwaway Postgres with `migrate deploy`.
- Docs updated: module README, API contracts, database plan, `sharek-api.http`,
  the Postman collection, and this tracker.
- Risks/follow-up: moderation review of misuse reports (admin workflow) and
  reputation effects remain out of scope; owner submission notifications are still
  deferred.
## 2026-07-29 - PR #63 Owner Decision review hardening

- Requirement/task IDs: GitHub issue #51, Sprint 4 B05, TASK-4-06/07, and PR
  #63.
- Merge integration: resolved the PR against current `main` while preserving
  Contribution Request publication/cancellation and Contribution Proposal
  contracts. Removed unrelated agent-skill configuration from the feature diff.
- Authorization/lifecycle: pending queues, detail, accept, and decline now use
  current Project ownership rather than the denormalized Request owner. Review
  and decisions remain available after Project archival so pending Applications
  cannot become stranded; Request state still gates Assignment creation.
- Contributor contract: authorized Application detail exposes nullable immutable
  Owner Decision and Assignment projections, including the declined decision ID
  and feedback required by the moderation-report route.
- Error handling: duplicate feedback reports are mapped only for the exact
  reporter/Owner Decision uniqueness constraint; unrelated Prisma uniqueness
  failures remain visible to their owning error path.
- Verification: the isolated PostgreSQL 14 migration harness passes, including
  feedback and uniqueness constraints. Architecture, lint, exact type-check,
  Prisma validation, build, diff checks, focused tests, and all 66 Jest suites /
  404 tests pass.

## 2026-07-29 - Application owner review window (S4-B06)

- Modules: `applications` (owner), `notifications`, `contribution-tasks`, and
  `projects`; technical Redis connection parsing moved to `shared/queue` for
  reuse by concrete BullMQ queues.
- Requirement/task IDs: GitHub issue #52, Sprint 4 B06, parent issue #46,
  dependency #51, `specs/005-sprint-4-contribution-workflows/spec.md`, DEC-004,
  ADR 0002, and ADR 0003.
- Workflow: added a repeatable, retrying review-window sweep plus startup
  catch-up. From persisted timestamps it sends one day-3 reminder to the
  current Project owner, presents pending Applications as overdue at day 5,
  and at day 7 changes only an undecided Application to `expired`, appends a
  system-attributed audit, and notifies the contributor.
- Safety: expiry runs before reminders and every write conditionally rechecks
  `pending_owner_review`. Reminder markers and notifications commit atomically;
  expiry state, audit, and notification commit atomically. Terminal states,
  sibling Applications, Requests, Assignments, reputation, eligibility, and
  contributor profiles are not changed. Deterministic tests cover exact
  pre/on/post boundaries, current-owner routing, retries, transaction failure,
  owner-decision races, and duplicate delivery.
- API/database: no route was added. Authorized Application DTOs now include
  `expiredAt` and `overdue`. Migration
  `20260729200000_application_review_window` adds the reminder marker, scan
  indexes, `ApplicationAuditAction.expired`, and a nullable audit actor for
  honest system attribution.
- Documentation: added the issue-specific implementation plan and updated the
  Applications/Notifications READMEs, API contract, database plan, developer
  architecture guide, local environment controls, and this tracker.
- Verification: architecture check, lint, exact type-check, Prisma validation,
  production build, diff checks, and the isolated PostgreSQL migration harness
  pass. Focused tests pass 129/129; the full Jest run passes 69 suites and 422
  tests.

## 2026-07-29 - Application review-window API client verification

- Requirement/task IDs: GitHub issue #52, Sprint 4 B06.
- REST/Postman: documented all review-window response fields and the absence of
  a public scheduler route in `sharek-api.http` and the Postman guide. Added
  Postman assertions for submission, pending-owner list, and authorized detail,
  including terminal `EXPIRED` presentation. Replaced the hardcoded decline
  placeholder with a reusable REST Client variable.
- Automated client contract: added `npm run test:api-clients`, which parses both
  Postman JSON files, compiles embedded Postman scripts, compares all controller
  method/path pairs with the collection, rejects stale REST routes, and requires
  all seven Application/Owner Decision workflow routes in the REST Client.
- HTTP coverage: the Application Supertest contract now asserts
  `reviewDueAt`, `expiresAt`, `expiredAt`, and `overdue` on submission/list/detail
  and verifies terminal expiry is never presented as overdue.
- Verification: Docker Compose configuration, architecture check, lint, exact
  type-check, Prisma validation, production build, migration harness, API-client
  inventory, and diff checks pass. Focused tests pass 129/129; all 69 Jest suites
  and 422 tests pass. The collection contains all 98 controller routes, and the
  REST Client contains 69 runnable requests with all seven required Application
  workflow routes.

## 2026-07-29 - Docker and host runtime recovery

- Requirement/task IDs: GitHub issue #52 operational verification and local
  backend recovery.
- Root cause: Docker service names (`postgres` and `redis`) are valid only on
  the Compose network. Host-run NestJS inherited those names while PostgreSQL
  was published on the configured host port, producing Redis `EAI_AGAIN` and
  Prisma `P1001` failures.
- Runtime: `start:dev`, Prisma migration, and Prisma Studio commands now share a
  service-URL resolver that preserves Compose URLs in containers and maps them
  to the configured localhost ports on the host. Compose forwards all
  Application review scheduler controls and health-checks the API `/health`
  route.
- Live verification: PostgreSQL is healthy and accepts connections, Redis
  returns `PONG`, all 24 migrations are applied, and the API is healthy on port
  4000. BullMQ has the repeatable 60-second review sweep registered with no
  failed jobs. A separate host-run startup compiled with zero errors, connected
  through localhost, started NestJS, and served `/health`; the Docker API was
  then restored and left healthy.
- Quality gates: Compose validation, architecture check, lint, exact type-check,
  Prisma validation, build, migration harness, API-client validation, diff
  checks, and all 69 Jest suites / 422 tests pass. No additional API or database
  contract change was introduced by the runtime recovery.
- Supply chain: refreshed the lockfile to patched `brace-expansion` and
  `fast-uri` releases. The production dependency audit reports zero known
  vulnerabilities; npm's full development-tree audit still propagates the new
  `brace-expansion` advisory through legacy test/lint tooling despite the
  installed patched 1.x release. Docker builds now use deterministic `npm ci`
  installation from the reviewed lockfile.

## 2026-07-30 - Prisma owner-decision relation repair

- Requirement/task IDs: targeted `prisma-schema-relations` repair following
  GitHub issue #51 and PR #64 integration.
- Schema: restored the four Prisma-only inverse relations from `User` and
  `ContributionRequest` to `OwnerDecision` and `Assignment`; the owning-side
  foreign keys already exist in migration `20260729120000_owner_decisions_assignments`,
  so no database migration was added.
- Root cause: PR #64's main-into-feature conflict resolution omitted the inverse
  fields that PR #63/#51 had already added.
- Verification: Prisma validation and client generation, architecture check,
  lint, exact type-check, build, 7 focused suites / 94 tests, and all 69 Jest
  suites / 437 tests pass.

## 2026-07-30 - Application review-window verification hardening

- Requirement/task IDs: GitHub issue #52 follow-up to PR #65 and schema repair
  PR #66.
- Coverage: added direct assertions for marker-only reminders, zero-effect
  day-5 overdue presentation, overdue accept/decline, EXPIRED terminal
  decisions, expiry-wins races, decision-neutral expiry, deterministic expiry
  audit keys, reused deadline fields, exhausted worker retries, and the exact
  six-route Applications HTTP inventory.
- Standards: centralized the queue-enabled decision, named the day-3/day-5/day-7
  policy constants, and removed invented Redis/PostgreSQL service URL fallbacks
  in favor of validated environment or `.env` configuration.
- Verification: Prisma validation and generation, architecture check, lint,
  exact type-check, build, API-client inventory, the PostgreSQL migration
  harness, 8 focused suites / 79 tests, and all 72 Jest suites / 451 tests pass.

## 2026-07-30 - Sprint 4 backend review fixes

- Modules: `applications`, `contribution-proposals`, `contribution-tasks`,
  `notifications`, and `projects`.
- Requirement/task IDs: Sprint 4 parent #46; closed issues #51, #55, and #56;
  review-window follow-up to #52.
- Workflow fixes: Owner Decisions now reject the inclusive day-7 expiry
  boundary even when the sweep is delayed. Proposal revision, acceptance, and
  decline notifications commit atomically with their response and emit
  realtime only afterward. Proposal detail exposes the resulting Request
  lifecycle, and public accepted-Proposal attribution includes the canonical
  contributor username.
- Contract fixes: malformed owner-project IDs are rejected as UUIDv4 at the
  controller boundary, and project titles are trimmed before non-empty
  validation. Distinct pending Proposals to one Project are allowed within the
  existing serialized daily rate limit.
- Database: migration
  `20260730130000_proposal_response_notifications` adds
  `NotificationType.proposal_status`; migration
  `20260730131000_allow_multiple_pending_proposals` drops the superseded
  one-pending-Proposal partial unique index.
- Documentation: updated the Applications, Contribution Proposals,
  Contribution Requests, Notifications, and Projects module READMEs plus API
  and database contracts.
- Verification: architecture check, lint, exact type-check, Prisma validation
  and generation, build, API-client inventory, migration harness, clean
  27-migration deployment on a temporary PostgreSQL database, focused tests,
  and all 72 Jest suites / 454 tests pass.
- Remaining Sprint 4 scope: issues #53, #54, and #57-#60 remain open; Advisory
  Fit and the gated Materials slice were not implemented by this review.

## 2026-07-30 - Skill-profile AI request contract repair

- Modules: `ai` and `skill-profiles`.
- Root cause: FastAPI required a top-level skill-profile `role`, while the
  NestJS worker serialized repository evidence without it, so valid contributor
  generations were rejected with HTTP 422 before analysis began.
- Contract: `SkillProfileInput` now requires `role`, and contributor generation
  sends `role: "contributor"` explicitly.
- Coverage: the FastAPI client test asserts the serialized request body, while
  the generation service test asserts the contributor workflow supplies the
  role. The AI repository's stale legacy security tests were migrated to the
  current evidence-capsule service and now cover the compatible schema.
- Database/API impact: no migration and no browser-facing API change.
- Verification: architecture check, lint, exact type-check, build, all 72
  backend Jest suites / 455 tests, Python compilation, and all 7 AI tests pass.

## 2026-08-03 - Advisory Fit attempt and presentation auditing (#54)

- Modules: `applications`, with the existing authenticated FastAPI contract
  consumed through the exported `ai` facade.
- Requirement/task IDs: Sprint 4 B08, GitHub issue #54, parent #46, and the
  completed assessment foundation in #53.
- Workflow: provider failures and invalid findings now append immutable failed
  `AssessmentAttempt` rows with safe metadata. A new idempotency key may retry
  an unavailable request once; each retry has an incremented attempt number and
  a `retry_of_attempt_id` link, while conditional claims prevent concurrent
  retries from duplicating provider work. Exhausted retries return
  `ASSESSMENT_RETRY_LIMIT_REACHED` without changing Application or Owner
  Decision state.
- Presentation: the first authorized completed-assessment presentation is
  recorded through the unique durable marker and append-only audit, with a
  persisted-marker readback for concurrent uniqueness races. It is not a read
  receipt.
- Database/API documentation: added the retry-link migration and updated the
  Prisma schema, Applications README, API contract, database plan, and module
  dashboard.
- Verification: architecture check, lint, exact type-check, Prisma generation
  and validation, focused service/AI/HTTP tests, and the full 74-suite / 477
  test Jest run pass.

## 2026-08-03 - Advisory Fit retry recovery contract

- Modules: backend `applications` and frontend `contribution-requests`.
- Requirement/task: follow-up to Sprint 4 Advisory Fit issues #53/#54 so an
  owner can recover visibly when the first provider attempt is unavailable.
- Backend contract: every assessment projection now returns the derived
  `retryAvailable` flag. It is true for a temporary system limit and after the
  first unavailable provider attempt, then false after the one allowed provider
  retry. Existing immutable attempts, retry linkage, idempotency, concurrency
  claims, and `ASSESSMENT_RETRY_LIMIT_REACHED` enforcement are unchanged.
- Frontend recovery: the retry button follows `retryAvailable`, exhausted
  requests show neutral explanatory copy without another button, stable retry
  conflict codes have specific Arabic copy, and ambiguous POST failures trigger
  a GET refresh while preserving the idempotency key for safe replay.
- Database/migration impact: none. The pre-existing retry-attempt persistence
  model is unchanged.
- Verification: all 74 backend suites / 478 tests and all 58 frontend suites /
  305 tests pass. Backend architecture check, backend/frontend lint, exact
  type-checks, production builds, the Docker watch compilation, and the live
  backend health check also pass.

## 2026-08-03 - Advisory Fit provider timeout margin

- Modules: backend `ai` integration and Advisory Fit configuration.
- Diagnosis: a real `UNAVAILABLE` response completed exactly at the previous
  10-second NestJS Advisory Fit timeout, while FastAPI permits a 60-second
  provider call. This converted slow valid provider responses into failed
  assessment attempts before the AI service could respond.
- Change: raised the bounded default to 75 seconds, validated it, forwarded it
  through Docker Compose, and documented `AI_ADVISORY_FIT_TIMEOUT_MS`.

## 2026-08-05 - Sprint 4 core release gate (S4-B11 / #57)

- Scope: verified Project/Contribution Request publication, Application
  submission and human decision, optional non-gating Advisory Fit, and private
  Proposal revision/acceptance into an attributed owner draft across Backend,
  Frontend, and AI contracts.
- Release evidence: added immutable camel-case Advisory Fit request/response
  fixtures and a required CI gate that machine-runs eight named Backend
  HTTP/service suites. Cross-repository mode additionally verifies clean exact
  reviewed SHAs and default-branch ancestry, runs six named Frontend suites,
  validates the fixtures with the actual FastAPI schemas, and runs AI HTTP tests.
- Gate prerequisite: AI PR #7 merged to `AI_Agents/main` at
  `1fa196a13aeb6cc5477e48017b7d15a7b6aa46c1`. The cross-repository verifier was
  rerun against that clean merged revision and Frontend `master`; Backend passed
  152/152 named tests, Frontend passed 40/40, and AI passed 26/26 plus real
  Pydantic fixture validation.
- Authorization/privacy: confirmed owner/contributor boundaries, immediate
  owner visibility independent of assessment state, private Proposal history,
  bearer-authenticated AI access, citation allowlisting, and attribution without
  Assignment or selection priority.
- API/database: no browser route or database schema change. The internal AI
  request now replaces opaque skill records with bounded evidence capsules and
  exact evidence-ID allowlisting. Existing Sprint 4 migrations remain
  authoritative and are exercised by the migration harness.
- Runtime evidence: a fresh pgvector PostgreSQL 16 environment deployed all 30
  migrations, then a real NestJS/Redis HTTP sequence passed 22 sanitized steps:
  publish/discover, immediate Application visibility, optional non-blocking
  no-evidence Advisory Fit, independent accept and decline decisions, Proposal
  revision/version/acceptance, and attributed draft completion/publication.
  The run exposed and closed a Prisma `P2010` caused by deserializing the `void`
  result of `pg_advisory_xact_lock`; the query now returns a supported text cast,
  with 26/26 focused Proposal service tests passing.
- Verification: cross-repository fixture verifier, focused core Jest replay,
  Prisma generation/validation, architecture, lint, exact type-check, full Jest,
  API-client inventory, migration harness, build, full Frontend gates, and the
  clean AI prerequisite's pytest/compile gates, and the dated real-process HTTP
  evidence under `docs/release-gates/`. B11 is ready to merge once final PR #69
  CI passes; Materials remains gated until #57 closes through that merge.

### 2026-08-07 - Materials: safe foundation (S4-B12, part 1)

- Scope: introduced the `materials` module with the data model, private
  storage port, and configurable format and size limits. No routes yet; upload
  and versioning follow in the second part.
- Data model: `Material` carries identity, ownership scope, and one of three
  fixed visibility classes; `MaterialVersion` is immutable, so a replacement is
  a new version rather than an edit; `MaterialGrant` is an explicit revocable
  grant retained after revocation; `MaterialAudit` is append-only and outlives
  content purge, because deletion removes bytes rather than the record that
  bytes existed. Migration `20260807090000_materials_foundation`.
- Invariant: a Material belongs to exactly one of a Project or a Contribution
  Request, enforced by a raw check constraint because Prisma cannot express it
  and visibility resolution is undefined for a row attached to both or neither.
- Storage: raw bytes go through a `MaterialStorage` port rather than a client,
  so the domain rules are written against a contract and S3 or MinIO is an
  adapter swap. Keys are generated rather than derived from filenames, and the
  local adapter asserts containment within its root regardless.
- Consent boundary: nothing in this module extracts, embeds, retrieves, or
  calls a provider. Upload is storage consent only.
- Focused verification: storage adapter specs run against real temporary files
  covering digest, immutability, idempotent delete, and three path-traversal
  shapes; environment specs pin the configurable limit bounds.

### 2026-08-07 - Materials: upload and immutable versions (S4-B12, part 2)

- Scope: upload routes for Project and Contribution Request Materials, an
  append-only version endpoint, and an owner read. Still no download route and
  no scan; a version is created quarantined and stays there until B12 part 3.
- Content is validated against the bytes, not the header. The declared
  Content-Type is attacker-controlled, so an allowlist alone would accept
  anything renamed: PDF is confirmed by magic bytes, DOCX by the ZIP signature
  plus the WordprocessingML main part, and text formats -- which have no magic
  bytes -- by being decodable UTF-8 without NUL.
- Rejections distinguish an unsupported format from a format that lied about
  itself, and carry the configured allowlist or size limit as metadata so
  clients do not duplicate the numbers.
- Appends take a per-Material advisory lock, so two concurrent uploads cannot
  claim the same version number. The lock result is cast to text because
  pg_advisory_xact_lock returns void, which Prisma cannot deserialize.
- Bytes are written before the transaction so a failure can delete them; the
  storage key therefore carries no version number, because the version is only
  resolved inside that transaction under the lock.
- Consent boundary: the service takes no AI dependency at all, which is the
  strongest available form of "upload performs no provider call".
- Focused verification: live upload against the running API covering an
  accepted PDF, a binary renamed as PDF, an unsupported type, an appended
  version preserving the previous one, storage keys, and audit rows.

### 2026-08-07 - Materials: quarantine, scanning, and the reaper (S4-B12, part 3)

- Scope: the `quarantined -> scanning -> ready | rejected` state machine, the
  BullMQ queue that drives it, and a reaper for versions stranded before a
  verdict. Still no download route; that is part 4, and until it exists no
  version is reachable regardless of scan status.
- Detection sits behind a `MalwareScanner` port with a deterministic stub. The
  stub reports the EICAR test file as infected, so the rejection path is driven
  by the same input a production scanner would reject, with no malware in the
  repository. `MATERIAL_SCANNER_STUB_MODE` forces a verdict on demand; `error`
  is the mode that proves an unreachable scanner does not pass files.
- A scanner that cannot answer throws rather than returning a verdict. The
  processor releases the version to `quarantined` and rethrows so BullMQ
  retries, because an unreachable scanner must never be indistinguishable from
  one that said "clean".
- Every transition is a conditional claim on the current status, not a write.
  A duplicate delivery and the reaper can act on one version simultaneously,
  and the row count is the only thing that makes one of them lose.
- The reaper sweeps two shapes on `updated_at`: stuck in `scanning` because a
  worker died holding the claim, and sitting `quarantined` with nothing queued.
  Attempts are counted from `scan_started` audit rows, which are written in the
  same transaction as the claim, so the count cannot drift from what ran.
- Giving up leaves the version `quarantined` with `MATERIAL_SCAN_ABANDONED`,
  not `rejected`: it stays undownloadable either way, but `rejected` would tell
  the owner their file is malware when we merely failed to check it. The DTO
  now carries `scanErrorCode` so the distinction reaches the frontend.
- Enqueue happens strictly after the upload transaction commits, matching the
  Advisory Fit queue. A disabled queue throws rather than dropping the job.
- Focused verification: live upload of a clean PDF reaching READY, an EICAR
  upload reaching REJECTED, a forced scanner outage leaving the version
  unscanned, and a reaper sweep releasing a version stranded in `scanning`.

### 2026-08-07 - Materials: visibility, grants, downloads, deletion (S4-B12, parts 4-5)

- Scope: the three visibility classes, revocable grants, short-lived download
  links, and two-phase deletion with an idempotent purge. This completes the
  backend half of #58.
- Visibility is resolved by a dedicated access service and never inferred from
  role. A contributor is not granted access by being a contributor; they hold
  something -- a live grant, or a live Assignment.
- `restricted_project` requires both a live grant and a live Assignment in the
  Project. A grant alone would outlive every reason it was issued for, and
  nobody would remember to revoke it.
- Assignment is per Contribution Request, not per Project, so "Project
  assignee" reads as anyone holding a live Assignment on any Request in that
  Project. That keeps a grant alive while one of a contributor's Requests
  finishes and another is still open. Flagged for the team to confirm.
- `assignment` visibility on a Project-scoped Material is refused rather than
  accepted, at upload and at visibility change: a Project has no Assignment, so
  the class could never open the Material to anyone but the owner.
- Access denials return the same not-found as absence. "Exists but is not for
  you" confirms that a named Project holds a document by that title.
- Downloads are two calls. The token names a subject and a target and carries
  no authorization decision, which is resolved again at redemption against live
  state -- that is what makes revocation bite against a link already issued.
  The redemption route stays behind the access guard and requires the caller to
  be the token's subject, so a shared link is not a copy of the document.
- The token has its own secret, required with no default. A shipped default
  would let anyone holding the source mint a link for any Material.
- Deletion ends access inside the transaction that stamps deleted_at, revoking
  every live grant with it. Purging content follows and is not allowed to fail
  the command: reporting deletion as failed because cleanup lagged would tell
  the owner their file is still readable when it is not.
- Purge deletes bytes before stamping the row, so the only possible partial
  failure is the harmless one. Repeating a purge is a no-op, and audit rows
  survive it.
- Focused verification: live grant and revocation against a real Assignment, a
  download link invalidated mid-flight by a revocation, a terminal Assignment
  closing access, and a repeated purge leaving audit rows intact both times.

### 2026-08-07 - Materials: listing, constraints, and grant identity (S4-B12 follow-up)

- Scope: the read surface Frontend #10 needs and #58 did not provide. Four
  gaps, all found by surveying the frontend against the shipped API rather
  than by a failing test.
- There was no listing endpoint at all -- only `GET /materials/:id` -- so
  nothing could render a Materials section without already knowing an id.
  Added for both Project and Contribution Request scopes.
- Listing filters in the query. Fetching everything and discarding afterwards
  is one refactor away from returning it, and the count alone leaks how many
  private documents a Project holds.
- An owner's listing includes deleted Materials with `deletedAt` and per
  version `purgedAt`. #10 requires honest `deleted` and `purge-pending`
  states, and until now a deleted Material 404'd for everyone, so the row
  simply vanished and the owner could not tell a completed deletion from a
  failed request.
- Limits were reachable only by being rejected: `MATERIAL_TOO_LARGE` and
  `MATERIAL_TYPE_UNSUPPORTED` carry them as error metadata. #10 must state
  them up front, so they are now served from the same config the validator
  reads rather than hardcoded in the client, where they would drift.
- Grants returned bare UUIDs. The grant list exists to tell an owner who they
  handed a document to, so it now carries the same identity fields used for
  proposers and Contribution Request attribution.
- Both new static routes sit outside `/materials/` -- `material-downloads` and
  `material-upload-constraints` -- because the parameterised
  `/materials/:materialId` matches first and its UUID pipe rejects them.
  Declaration order also works, until someone reorders the methods.

### 2026-08-07 - GitHub App installation verification accepts provider read scopes

- Scope: corrected GitHub App connection completion for installations whose
  GitHub payload includes additional read-only permissions.
- Root cause: completion incorrectly required `Metadata` and `Contents` to be
  the only permission entries, although GitHub legitimately returned
  `statuses: read` and `pull_requests: read` for the deployed App.
- Safety: verification still requires the configured App ID, selected-repository
  mode, and `Metadata` plus `Contents` at `read`; member access and selected
  repository revalidation are unchanged.
- Verification: focused GitHub App service regression test covers the production
  permission shape; broader checks are recorded with the deployment handoff.

### 2026-08-08 - GitHub evidence request timeout increased

- Scope: pass the validated GitHub API URL and timeout settings into the Docker
  API container and raise the local request budget from 4 seconds to 8 seconds.
- Reason: skill generation returned `GITHUB_PROVIDER_TIMEOUT` for both selected
  repositories before the AI service was called, while direct GitHub App reads
  succeeded; the larger bounded request budget gives repository evidence reads
  room for provider latency without changing permissions or credentials.
- Verification: recreated the API container, confirmed the health endpoint,
  inspected the effective timeout environment, and replayed GitHub App reads
  without printing tokens.

### 2026-08-08 - Private repository framework evidence stays inside GitHub module

- Scope: dependency/framework detection now runs in `GitHubEvidenceService`
  with the ephemeral installation token and is persisted in each evidence
  snapshot before the AI request.
- Security: FastAPI receives only bounded framework/file references; the
  skill-profile contract no longer accepts or forwards a GitHub PAT to the
  AI/analysis service. Private `package.json` data therefore remains behind
  the GitHub module boundary.
- Verification: focused detector/API/service tests cover `Next.js` from a
  private-style `package.json`, base64 content decoding, and preservation of
  pre-populated framework evidence in FastAPI.

### 2026-08-08 - Preserve detected skills across all selected repositories

- Scope: the owning `skill-profiles` service now merges bounded framework and
  dominant-language evidence into pending candidates when Alibaba omits a
  repository signal from its response.
- Safety: fallback candidates are beginner-level, confidence-thresholded,
  explicitly limited to dependency/language evidence, and remain pending for
  human review; the model can still provide stronger evidence when available.
- Verification: a regression test covers a two-repository generation where the
  model returns only TypeScript while Python, LangChain, and Pydantic are still
  retained from the second repository's evidence.

### 2026-08-08 - Persist skill-generation notifications and expose the inbox

- Scope: terminal skill-profile generation outcomes now create idempotent
  durable notifications for ready-for-review, needs-more-evidence, and failed
  states. The authenticated notifications controller exposes list, mark-one,
  and mark-all-read routes; the frontend hydrates the inbox after login and
  continues to receive Socket.IO events.
- Safety: notification creation happens after the generation state is durable,
  is deduplicated by generation/status, and cannot turn a successful generation
  into a failure. Read routes are scoped to the authenticated user. The Prisma
  enum migration is additive, and a one-time idempotent backfill covers existing
  pending-review generations.
- Verification: migration deployment, TypeScript compilation, focused service
  tests, full backend tests, and frontend lint/build/test are required before
  release handoff.
