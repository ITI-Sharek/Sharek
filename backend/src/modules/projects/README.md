# Projects Module

Owns project records, import workflow, and project publication state.

## Current API

- `POST /projects/import/github`: owner/admin import of a connected GitHub repository.

## Structure

```text
projects.module.ts
projects.controller.ts
projects.service.ts
projects.service.spec.ts
dto/
mappers/
README.md
```

`ProjectsController` handles HTTP validation and delegates to `ProjectsService`.
The service checks authorization, requests a normalized repository snapshot from
the exported `GitHubRepositoryService`, and writes project-owned data with Prisma.

Future project workflows belong in focused project services when the root
service becomes difficult to scan. This module must not access GitHub clients or
GitHub tables directly.
