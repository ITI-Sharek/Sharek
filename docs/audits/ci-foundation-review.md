# CI Foundation Review

**Date:** 2026-07-17
**Stage:** Stage 4 - CI review and remote PR preparation
**Verdict:** NO-GO

## Scope Reviewed

- `.github/workflows/ci.yml`
- `.github/ISSUE_TEMPLATE/`
- `.github/pull_request_template.md`
- `docs/operations/ci.md`
- `docs/operations/github-workflow.md`
- root pnpm workspace configuration
- frontend, backend, and newly added `ai/` validation commands
- current branch diff against `master`

## Confirmed Fixes Applied

- Added an `ai` CI job now that the FastAPI service exists under `ai/`.
- Added `ai` to `ci-gate.needs` and to the `ci-gate` result check.
- Added exact-pin validation for `ai/requirements.txt`.
- Added AI lint, compile, and test-presence gates using repository-local commands.
- Updated `docs/operations/ci.md` to describe the four required CI jobs and current AI blockers.
- Added Python cache and virtualenv ignores to `.gitignore`.
- Updated the backend architecture checker to validate current repository docs
  and backend module boundaries instead of retired planning documents.
- Pinned direct AI dependencies in `ai/requirements.txt`.

## Critical Findings

1. **NO-GO: branch scope is no longer CI-only.**
   The branch contains application/product code, including the FastAPI service under `ai/` and frontend tooling/application files. That violates the original Stage 3/4 expectation that this branch prepare CI and collaboration foundation without product feature work. Do not open this PR as a pure CI foundation PR unless a human explicitly approves the broadened scope or splits the AI/frontend work into separate branches.

2. **NO-GO: AI tests are absent.**
   No `test_*.py` or `*_test.py` files exist under `ai/`. The AI job now fails until unit and mocked contract tests exist.

3. **Caution: frontend test command passes with no tests.**
   `pnpm --filter ./frontend test` passes because it uses `vitest run --passWithNoTests`. This is acceptable only as temporary CI plumbing. It is not meaningful test coverage.

## Validation Results

Passed:

- `ruby -e "require 'yaml'; ..."` for workflow and issue template YAML parsing
- workflow static assertions for `ci-gate`, frontend, backend, and AI result checks
- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm install --frozen-lockfile`
- `pnpm --filter ./frontend lint`
- `pnpm --filter ./frontend typecheck`
- `pnpm --filter ./frontend test`
- `pnpm --filter ./frontend build`
- `pnpm --filter ./backend lint` with 5 warnings
- `pnpm --filter ./backend exec tsc --noEmit`
- `pnpm --filter ./backend exec prisma generate`
- `pnpm --filter ./backend exec prisma validate`
- `pnpm --filter ./backend test --runInBand --testPathPattern=src`
- `pnpm --filter ./backend test --runInBand --testPathPattern=test`
- `pnpm --filter ./backend check:architecture`
- `pnpm --filter ./backend build`
- AI exact-pin validation for `ai/requirements.txt`
- pinned AI dependency dry-run resolution
- `python -m compileall -q ai/src/sharek_agents`

Failed:

- AI test-presence validation, because no AI tests exist yet.

Not run:

- `python -m pip install --requirement ai/requirements.txt`, because only a dry-run dependency resolution was needed for the pin fix.
- `python -m pylint ai/src/sharek_agents`, because dependencies were not installed locally.
- AI unit and contract tests, because no tests exist.
- `actionlint`, because it is not installed locally.

## External Services and Secrets

- CI does not reference production secrets.
- CI does not call paid AI APIs.
- CI does not call live GitHub APIs during tests.
- No PostgreSQL or Redis service containers are configured.
- Backend E2E tests require local ephemeral port binding for Supertest.

## Prepared Commands

Do not run these until the NO-GO blockers are resolved or a human explicitly approves the broadened branch scope.

```bash
git add .github/workflows/ci.yml .gitignore ai/requirements.txt backend/scripts/check-architecture.mjs docs/operations/ci.md docs/audits/ci-foundation-review.md
git commit -m "ci: fix architecture and AI dependency gates"
git push origin chore/github-workflow-and-ci
gh pr edit 4 --title "chore: unified workspace CI, frontend tooling, husky, docs, and AI service groundwork" --body-file docs/audits/ci-foundation-review.md
```

## Required Human Decision

Choose one before PR creation:

1. Split application changes out of `chore/github-workflow-and-ci` and keep this PR to CI/templates/docs only.
2. Explicitly approve broadening this PR to include the AI service and frontend tooling.

Even with option 2, CI remains NO-GO until AI tests are added or the AI test
gate is explicitly deferred by a human.
