# Definition Of Done

A backend change is done only when the applicable items below are complete.

## Behavior

- Requirement/task IDs are identified.
- Route, request, response, status, and error contracts are verified.
- Authorization, ownership, and inactive-account behavior are reviewed.
- The owning module makes all final business decisions and writes only its tables.
- AI recommendations are validated before they affect business state.

## Structure

- Controllers delegate to focused services.
- DTO validation is explicit.
- Cross-module calls use exported services only.
- Optional folders exist only when needed.
- No legacy layer folders, use-case classes, ports, or decorative abstractions exist.
- Module README reflects new workflows and public services.

## Data And Security

- Prisma schema changes include migrations and generated-client validation.
- Transactions protect multi-write decisions where required.
- Public DTOs exclude secrets and private persistence fields.
- Provider keys, tokens, URLs, and model secrets are configuration-driven.
- Logs do not leak credentials or sensitive payloads.

## Tests And Gates

- Focused unit tests cover success, authorization, validation, and failure paths.
- Relevant HTTP/E2E tests cover public contracts.
- `npm run check:architecture` passes.
- `npm run lint` passes without new warnings.
- `npx tsc --noEmit` passes.
- Relevant tests and the full test suite pass.
- `npm run build` passes.
- `npx prisma validate` passes when Prisma is relevant.

## Documentation And Handoff

- API/database documentation is updated when contracts change.
- `docs/module-development-tracker.md` contains a short change record.
- The final report lists changed files, requirement IDs, tests, architecture
  result, migrations, known risks, and follow-up work.
