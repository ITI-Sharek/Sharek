# Backend PR Checklist

## Context

- Task ID:
- Product requirement/decision IDs:
- Owning module:
- Delivery-plan slice:

## Required Reading

- [ ] `AGENTS.md`
- [ ] `docs/operations/engineering-guide.md`
- [ ] `docs/audits/codebase-gap-report.md`
- [ ] Target module README
- [ ] Relevant API/database docs when touched

## Architecture

- [ ] Code is inside the owning module.
- [ ] Controllers are thin.
- [ ] Business rules live in the owning service/domain workflow.
- [ ] External systems are isolated behind integration clients.
- [ ] Cross-module dependency, if needed, uses a public exported service or completed-fact event.
- [ ] No module imports another module's private infrastructure.
- [ ] No module writes another module's owned tables directly.
- [ ] `shared/` contains only technical cross-module infrastructure.

## Tests And Checks

- [ ] `npm run check:architecture` passed.
- [ ] Relevant tests were added or updated.
- [ ] Relevant checks were run.
- [ ] Commands run are listed in the PR.

## Documentation

- [ ] Module README updated, or not needed.
- [ ] `docs/api-contracts.md` updated, or not needed.
- [ ] `sharek-api.http` updated, or not needed.
- [ ] `docs/architecture.md` updated, or not needed.
- [ ] `docs/audits/codebase-gap-report.md` updated when current implementation evidence changed.
- [ ] Planned work remains in `docs/delivery-plan.md`.

## Risks

- Known risks:
- Follow-up work:
