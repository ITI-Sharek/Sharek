# NestJS Module Skeleton

**Status:** Supporting example
**Rules:** `engineering-guide.md` and `../architecture.md` take precedence.

## Small Module

```text
projects/
  projects.module.ts
  projects.controller.ts
  projects.service.ts
  projects.service.spec.ts
  dto/
    import-project.dto.ts
    project-response.dto.ts
  mappers/
    project.mapper.ts
  README.md
```

```text
ProjectsController -> ProjectsService -> DatabaseService
                                    -> GitHubRepositoryService
```

## Larger Module

```text
identity/
  identity.module.ts
  controllers/
    manual-auth.controller.ts
    session.controller.ts
    github-auth.controller.ts
    google-auth.controller.ts
  services/
    auth.service.ts
    session.service.ts
    password-reset.service.ts
    social-auth.service.ts
    identity-username.service.ts
  dto/
  integrations/
  security/
  validators/
  README.md
```

## Rules

- Start with module, controller, service, DTOs, tests, and README.
- Group controllers/services only when there are multiple files.
- Add repositories, integrations, jobs, events, mappers, security, validators,
  or utilities only for real implementation needs.
- Export services as the module public API; keep technical internals private.
- Preserve controller -> service -> Prisma/exported service/client flow.
