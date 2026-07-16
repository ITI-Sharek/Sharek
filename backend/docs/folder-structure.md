# Folder Structure

```text
src/
  modules/
    <feature>/
      <feature>.module.ts
      <feature>.controller.ts     # small module
      <feature>.service.ts        # small module
      controllers/               # multiple controllers only
      services/                  # multiple services only
      dto/
      integrations/              # external provider clients
      repositories/              # complex concrete persistence
      jobs/                      # queues and workers
      events/                    # published/listened facts
      security/                  # module-specific security implementation
      mappers/                   # non-trivial data conversion
      validators/                # reusable module business/input checks
      utils/                     # pure module-local helpers
      README.md
  shared/
    auth/
    config/
    database/
    errors/
```

The module owns its feature from HTTP entry point to database write. Small
modules keep controller and service at root. Larger modules group multiple files.

## Folder Rules

- `dto/` contains validated public input and explicit output shapes.
- `integrations/` contains provider HTTP/protocol details.
- `repositories/` contains concrete complex Prisma query collections, not
  interfaces added for ceremony.
- `jobs/` contains concrete queue and worker code; processing belongs in a service.
- `events/` contains completed facts and handlers that update their own module.
- `security/` is private to its module.
- `shared/` is technical only and must not become a business-code dumping ground.

Do not create `application/`, `domain/`, `infrastructure/`, or `presentation/`
folders. Do not create empty optional folders.

See `docs/examples/module-skeleton.md` for copyable examples.
