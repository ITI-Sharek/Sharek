# Continuous Integration Operations

**Status:** Supporting operational guidance

ShareK uses one workflow at `.github/workflows/ci.yml`. It runs for pull requests
targeting `master`, pushes to `master`, and manual `workflow_dispatch` runs.

## Workspace contract

pnpm is authoritative for JavaScript dependencies. Run installation once from
the repository root:

```bash
pnpm install --frozen-lockfile
```

The root `pnpm-workspace.yaml` currently includes `frontend/` and `backend/`.
There is one root `pnpm-lock.yaml`; project-local pnpm locks and the former
backend npm lock are not authoritative.

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

## Job graph

```text
repository-checks --+
frontend ----------+--> ci-gate
backend -----------+
```

- `repository-checks` verifies that the consolidated lockfile supports a frozen
  workspace install without running dependency lifecycle scripts.
- `frontend` requires lint, type-check, test, and build scripts, then runs each.
- `backend` generates the Prisma client and runs lint, type-check, unit,
  integration/E2E, architecture, Prisma validation, and build checks.
- `ci-gate` runs with `always()` and fails unless every required job reports
  `success`, including when an upstream job fails, is skipped, or is cancelled.

## Current known failures and skips

- The frontend package currently defines only an intentionally failing
  placeholder test. Its CI job reports missing `lint`, `typecheck`, and `build`
  scripts before feature work can be treated as verified.
- The backend architecture checker still targets retired documentation paths and
  is expected to fail until its separate tooling issue is implemented.
- FastAPI source has not yet been moved into `ai/`. No AI job exists until the
  real Python manifest, pinned dependency command, lint, type-check, test, and
  mocked contract commands can be read from that workspace.

These are visible delivery blockers. Do not weaken `ci-gate`, add placeholder
success steps, or invent AI commands to make CI appear green.

## Safety and external services

Ordinary CI uses no production secrets and calls no paid AI or live GitHub API.
Backend tests disable the skill-profile queue by default and use controlled test
doubles for GitHub and FastAPI boundaries. No database or Redis service container
is configured because the current suites do not prove they require one.

Add PostgreSQL or Redis services only with a real integration test and isolated
test credentials. Never run destructive migrations or use production data.

## Required check

After the workflow has run successfully at least once, configure branch
protection to require only the stable `ci-gate` check. Individual jobs remain
diagnostic implementation details and must still feed the gate.
