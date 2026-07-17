# Backend Conventions

## Naming

- Module: `<feature>.module.ts`
- Small-module controller/service: `<feature>.controller.ts`, `<feature>.service.ts`
- Grouped files: `controllers/<workflow>.controller.ts`, `services/<workflow>.service.ts`
- DTOs: `dto/<action>.dto.ts` or `dto/<action>.request.ts`
- Integration clients: `integrations/<provider>.client.ts`
- Concrete repositories: `repositories/<feature>.repository.ts`
- Jobs: `jobs/<feature>.queue.ts`, `jobs/<feature>.worker.ts`
- Tests: colocated `<file>.spec.ts`; HTTP integration tests under `test/`

Do not use `.use-case.ts`, `.port.ts`, or Clean Architecture layer directories.

## Controllers

- Keep route methods short and delegate to one owning service.
- Use DTO validation for body, query, and route input.
- Apply authentication and role guards explicitly.
- Never inject Prisma/`DatabaseService` or external clients.

## Services

- Own authorization, business validation, workflow, and final decisions.
- Use Prisma directly for simple module-owned persistence.
- Use a concrete repository for cohesive complex persistence only.
- Call other modules through exported services.
- Split unrelated responsibilities into focused services.

## Modules

- Export only services that form the module's public API.
- Do not export repositories, clients, security classes, queues, or controllers.
- Do not write another module's tables.
- Keep module-specific helpers inside the module, not `shared/`.

## DTO And API Safety

- Preserve public routes and response shapes unless the task explicitly changes them.
- Return explicit DTOs when records contain private fields.
- Never expose password hashes, session hashes, OAuth tokens, encryption data,
  internal moderation notes, or model/provider secrets.
- Use project application errors so the global exception filter returns stable codes.

## Prisma

- Prisma schema and migrations are the only schema-change path.
- Use transactions when multiple writes form one decision.
- Keep table ownership documented in the module README.
- Regenerate and validate Prisma after schema changes.

## Integrations And Jobs

- Keep provider HTTP details in `integrations/` clients.
- Read URLs, credentials, limits, and feature flags from validated configuration.
- Workers delegate business processing to services.
- Retry and final-failure behavior must be explicit and tested.

## Documentation

Every implemented module has a README with ownership, public routes/services,
dependencies, and extension notes.
