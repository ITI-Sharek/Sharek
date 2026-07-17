# GitHub Collaboration Workflow

**Status:** Supporting operational guidance

The default branch is `master`. Work is developed on focused branches and
reviewed through pull requests; no workflow automatically commits, pushes,
merges, or starts implementation.

## Issue flow

1. Start from an approved issue with user value, outcome, scope, non-goals,
   acceptance criteria, dependencies, impacts, tests, documentation, and demo
   proof.
2. Add the issue to `ShareK MVP Execution` and populate Status, Priority, Size,
   Area, Slice, Risk, and Iteration when available.
3. Keep blocked dependencies in `Backlog`; use `Ready` only when implementation
   can start without an unresolved dependency.
4. One developer owns at most one `In progress` implementation issue.
5. Keep tests inside the implementation issue rather than deferring them to a
   separate cleanup phase.

## Branch and pull-request flow

1. Branch from an up-to-date `master` using a focused `feat/`, `fix/`, `test/`,
   `docs/`, `refactor/`, or `chore/` prefix.
2. Exclude unrelated work and preserve uncommitted human changes.
3. Open a focused pull request using the lowercase
   `.github/pull_request_template.md` path and link the approved issue.
4. Record exact tests, authorization/security impact, migrations, API/UI impact,
   documentation, and screenshots when applicable.
5. Move the issue to `In review` only when the diff and required local checks are
   ready for a reviewer.
6. Require cross-owned review, resolved conversations, and `ci-gate` success.
7. A human merges the pull request. Automation must not merge it.
8. Move the issue to `Done` only when its acceptance criteria and evidence are
   complete; closing a partial implementation does not establish completion.

## Collision control

- Serialize changes to root workspace files, lockfiles, CI workflows, Prisma
  schema/migrations, shared auth guards, and central API contracts.
- Freeze request/response contracts before parallel frontend/backend work.
- AI work begins only after the owning NestJS contract and consuming workflow
  exist; FastAPI remains advisory and never owns a business transition.
- Rebase dependent branches after their prerequisite merges and rerun `ci-gate`.

Project field and manual UI details remain in `github-project.md` and the
corresponding audit checklist.
