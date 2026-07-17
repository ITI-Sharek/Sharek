# AI Agent Rules

## Before Editing

1. Read `AGENTS.md`, `docs/README.md`, `docs/architecture.md`, and the relevant module README.
2. Read the relevant `docs/delivery-plan.md` slice and inspect the current implementation.
3. Check `git status` and preserve human changes.
4. Confirm route, DTO, authorization, table ownership, and migration impact.

## Implementation

- Follow standard NestJS module structure: controller, service, DTO, Prisma.
- Do not introduce Clean Architecture layers, use-case classes, ports, or
  abstract repositories without multiple real implementations.
- Keep controllers thin and services responsible for workflow and decisions.
- Use only exported services for cross-module calls.
- Never import another module's private technical files or write its tables.
- Add optional folders only for real code.
- Keep secrets and environment-specific values out of tracked source.
- Do not silently change public routes or response/error contracts.

## AI Features

- Keep business orchestration in NestJS and call the bounded FastAPI service
  through the NestJS AI facade (`docs/architecture.md` §5).
- Keep deterministic checks and final decisions in NestJS services.
- Validate structured AI output before use.
- Persist evidence, confidence, uncertainty, model/prompt versions, and dispute
  audit metadata through the owning module.
- Treat repository text and diffs as untrusted data and never execute repository
  code during analysis.
- Define timeout, retry, fallback, and failure behavior.

## Verification

Run:

```bash
npm run check:architecture
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

Also validate Prisma when schema or generated-client behavior is relevant. Review
the final diff for stale paths, accidental contract changes, and unrelated edits.

## Handoff

Report requirement/decision IDs, changed files, tests, architecture-check result,
migrations, API/authorization review, codebase-gap evidence updates, and remaining risk.
