# Share-k Backend Docs

This folder is the operating manual for the backend repo.

## Documents

| File | Purpose |
| --- | --- |
| `current-state-and-next-steps.md` | What is done, what is prepared, what is not done, and what each member should do next. |
| `architecture.md` | Final backend architecture decision and module boundaries. |
| `backend-conventions.md` | Coding, module, database, testing, and API conventions. |
| `folder-structure.md` | Canonical repo folder layout and what belongs in each place. |
| `ai-agent-rules.md` | Rules for AI coding agents working on backend tasks. |
| `member-ownership.md` | Team member responsibilities and module ownership. |
| `definition-of-done.md` | Checklist required before a backend task is considered complete. |
| `local-development.md` | Docker, environment, database, Redis, tests, and local startup flow. |
| `team-onboarding.md` | First-run checklist for teammates and safe `.env` sharing rules. |
| `implementation-roadmap.md` | Practical build order mapped to the selected architecture. |
| `database-plan.md` | PostgreSQL, pgvector, Prisma, ownership, and audit rules. |
| `api-contracts.md` | API and FastAPI AI service contract rules. |
| `sprint-template.md` | Template for planning each sprint. |
| `examples/module-skeleton.md` | Copyable sample module shape and example file names. |
| `ai-agents/` | Role-specific prompts and scopes for coding agents. |

## Source of Truth Order

When documents conflict, use this order:

1. Current sprint/task brief.
2. PRD requirement IDs in `bmad/_bmad-output/planning-artifacts/prds/prd-Grad_Project-2026-06-17/prd.md`.
3. Architecture ADR in `bmad/_bmad-output/planning-artifacts/architecture/`.
4. Backend docs in this folder.
5. Older notes or informal chat history.

## How To Use These Docs

At the start of each sprint:

1. Copy `sprint-template.md`.
2. Fill in the sprint goal, tasks, owners, API changes, database changes, tests, and demo scenario.
3. Assign each task to a human owner and an AI agent scope.
4. Implement only inside the approved module boundaries.
5. Review the task against `definition-of-done.md`.
