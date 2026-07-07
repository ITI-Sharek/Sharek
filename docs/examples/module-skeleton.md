# Module Skeleton Example

Use this as an expanded example for a business module after a real sprint task
needs multiple boundaries. New modules should start smaller:

```text
module-name/
  module-name.module.ts
  README.md
```

Do not create the expanded tree until real files are ready to live inside it.

```text
module-name/
  module-name.module.ts
  README.md
  domain/
    entities/
    value-objects/
    events/
    exceptions/
    policies/
    contracts/
  application/
    use-cases/
    dto/
    ports/
    mappers/
  infrastructure/
    persistence/
    integrations/
    jobs/
  presentation/
    http/
      controllers/
      requests/
      responses/
      guards/
      presenters/
```

## Example: Applications Module

When implementing `ApplyToTask`, the files may look like this:

```text
applications/
  domain/
    entities/application.entity.ts
    enums/application-status.enum.ts
    exceptions/application-already-exists.error.ts
    exceptions/invalid-application-transition.error.ts
  application/
    use-cases/apply-to-task.use-case.ts
    dto/apply-to-task.input.ts
    dto/application.result.ts
    ports/contribution-task.reader.ts
    ports/approved-skills.reader.ts
  infrastructure/
    persistence/application.repository.prisma.ts
    persistence/application.persistence-mapper.ts
  presentation/
    http/
      controllers/applications.controller.ts
      requests/apply-to-task.request.ts
      responses/application.response.ts
```

## Rules

- Controllers call use cases.
- Use cases coordinate business rules.
- Domain code protects invariants.
- Infrastructure contains Prisma/provider/queue code.
- Other modules consume public ports or services, not private infrastructure.
