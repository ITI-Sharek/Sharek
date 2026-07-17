# Continuous Integration Operations

**Status:** Supporting operational guidance

ShareK uses one workflow at `.github/workflows/ci.yml`. It runs for pull requests
targeting `dev` or `master`, pushes to `dev` or `master`, and manual
`workflow_dispatch` runs.

## Workspace contract

pnpm is authoritative for JavaScript dependencies. Run installation once from
the repository root:

```bash
pnpm install --frozen-lockfile
```

The root `pnpm-workspace.yaml` currently includes `frontend/` and `backend/`.
There is one root `pnpm-lock.yaml`; project-local pnpm locks and the former
backend npm lock are not authoritative. The Python AI service lives under
`ai/` and is validated by the AI job, not by pnpm.

Use pnpm filters from the repository root:

```bash
pnpm --filter ./frontend lint
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
pnpm --filter ./frontend build

pnpm --filter ./backend lint
pnpm --filter ./backend exec tsc --noEmit
pnpm --filter ./backend test --runInBand --testPathPattern=src
pnpm --filter ./backend test --runInBand --testPathPattern=test
pnpm --filter ./backend check:architecture
pnpm --filter ./backend exec prisma validate
pnpm --filter ./backend build
```

Use these Python commands from the repository root:

```bash
python -m pip install --requirement ai/requirements.txt
python -m pylint ai/src/sharek_agents
python -m compileall -q ai/src/sharek_agents
```

## Job graph

```text
pr-governance ----+
repository-checks -+
frontend ---------+
backend ----------+--> ci-gate
ai ---------------+
```

- `pr-governance` runs only for pull requests and validates branch names and PR
  titles. It expects issue branches such as `issue-6-remove-signup-role` and PR
  titles such as `S1-01: Remove signup role selection` or
  `Issue #6: Remove signup role selection`.
- `repository-checks` verifies that the consolidated lockfile supports a frozen
  workspace install without running dependency lifecycle scripts.
- `frontend` requires lint, type-check, test, and build scripts, then runs each.
- `backend` generates the Prisma client and runs lint, type-check, unit,
  integration/E2E, architecture, Prisma validation, and build checks.
- `ai` verifies that Python dependencies are exact-pinned, installs them, runs
  a Pylint fatal/error gate, compiles modules, and reports whether AI unit or
  contract tests exist.
- `ci-gate` runs with `always()` and fails unless every required job reports
  `success`, including when an upstream job fails or is cancelled. It permits
  `pr-governance` to be skipped on push/manual events where no pull request
  title exists.

## Current known failures and skips

- No AI unit or mocked contract tests are present under `ai/`. The AI job
  reports this as an explicit skip until test files exist.
- AI type-checking is not configured yet. Add a type-check step only after a
  real local command exists.

These are visible delivery blockers. Do not weaken `ci-gate`, add placeholder
success steps, or invent AI commands to make CI appear green.

## Safety and external services

Ordinary CI uses no production secrets and calls no paid AI or live GitHub API.
Backend tests disable the skill-profile queue by default and use controlled test
doubles for GitHub and FastAPI boundaries. The AI job installs dependencies,
lints source for fatal/error findings, compiles modules, and checks for tests;
it must not invoke OpenRouter, live GitHub, or other external application APIs.
Backend Prisma validation uses a non-secret local `DATABASE_URL` only to satisfy
Prisma schema parsing; no database service is started. No database or Redis
service container is configured because the current suites do not prove they
require one.

Add PostgreSQL or Redis services only with a real integration test and isolated
test credentials. Never run destructive migrations or use production data.

## Required check

After the workflow has run successfully at least once, configure branch
protection to require only the stable `ci-gate` check. Individual jobs remain
diagnostic implementation details and must still feed the gate.

## Branch protection limitation

GitHub branch protection and repository rulesets were unavailable for this
private repository when inspected on 2026-07-18:

```text
Upgrade to GitHub Pro or make this repository public to enable this feature.
```

Until enforcement is available, `@KariMuhammad` approval for `master` merges is
a documented team rule backed by `.github/CODEOWNERS`, not an automatically
enforced GitHub gate.
