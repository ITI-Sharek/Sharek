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
| `github` | Implemented OAuth/account/repository listing/import snapshot and normalized evidence support | GitHub controller, OAuth service, repository service, DTOs, GitHub API client, token encryption | repository ingestion jobs, webhook/sync handling, persistent skill-profile evidence snapshots | Update when GitHub scopes, token handling, repo evidence, or import behavior changes |
| `projects` | Implemented GitHub project import | projects controller, import request, project import service, project mapper | update draft, publish/archive, project discovery | Update when project lifecycle, visibility, metadata, or project APIs change |
| `contributor-profiles` | Implemented authenticated profile ensure and profile-by-username reads | controller, use cases, Prisma repository, presenter, domain policy | richer profile editing and public profile sections as product scope expands | Update when profile visibility, username/profile contracts, profile APIs, or profile persistence changes |
| `skill-profiles` | Registered placeholder module | module README and module file | skill generation, pending skills, admin approval/rejection | Update when skill state, evidence, AI generation, or approval rules are added |
| `contribution-tasks` | Registered placeholder module | module README and module file | task create/update/open/close and task discovery | Update when task lifecycle, required skills, capacity, deadlines, or owner limits are added |
| `applications` | Registered placeholder module | module README and module file | apply-to-task, eligibility recommendation, manual review, owner decision | Update when application status, AI decision handling, or application APIs are added |
| `delivery-reviews` | Registered placeholder module | module README and module file | PR submission, owner review, ratings, delivery-approved event | Update when delivery status, ratings, review APIs, or events are added |
| `reputation` | Registered placeholder module | module README and module file | reputation profile, score history, verified completion updates | Update when scoring rules, history, public reputation APIs, or events are added |
| `admin` | Registered placeholder module | module README and module file | manual review queues, disputes, reports, moderation views | Update when admin queues, review actions, moderation, or audit views are added |
| `ai` | AI ports prepared | AI module and application ports | FastAPI client adapters, schema validation, timeout/retry policy | Update when AI ports, schemas, adapters, audit metadata, or service behavior changes |
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
