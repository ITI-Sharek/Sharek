# Backend PR Checklist

## Context

- Task ID:
- PRD requirement IDs:
- Owning module:
- Related sprint doc:

## Required Reading

- [ ] `AGENTS.md`
- [ ] `docs/developer-architecture-guide.md`
- [ ] `docs/module-development-tracker.md`
- [ ] Target module README
- [ ] Relevant API/database docs when touched

## Architecture

- [ ] Code is inside the owning module.
- [ ] Controllers are thin.
- [ ] Business rules live in use cases or domain.
- [ ] External systems are behind ports/adapters.
- [ ] Cross-module dependency, if needed, uses a public exported service, reader port, or event.
- [ ] No module imports another module's private infrastructure.
- [ ] No module writes another module's owned tables directly.
- [ ] `shared/` contains only technical cross-module infrastructure.

## Tests And Checks

- [ ] `npm run check:architecture` passed.
- [ ] Relevant tests were added or updated.
- [ ] Relevant checks were run.
- [ ] Commands run are listed in the PR.

## Docs And Tracker

- [ ] Module README updated, or not needed.
- [ ] `docs/api-contracts.md` updated, or not needed.
- [ ] `sharek-api.http` updated, or not needed.
- [ ] `docs/database-plan.md` updated, or not needed.
- [ ] `docs/module-development-tracker.md` updated with a change record.

## Risks

- Known risks:
- Follow-up work:
