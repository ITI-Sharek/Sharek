# Projects Module

Owns project records, import workflow, and project publication state.

## Current API

- `GET /projects/me`: owner/admin dashboard list for the authenticated owner's
  projects. Returns draft, published, and archived owner projects with
  contribution request/application counters plus the current monthly request
  quota view used by the frontend owner workspace.
- `POST /projects/import/github`: owner/admin import of a public GitHub
  repository by full name or URL. The endpoint fetches GitHub metadata and
  saves the project as `draft` by default, or as `published` when the owner
  explicitly submits `status: "published"`. Publishing requires reviewed
  `category` and `difficulty` values.
- Exported admin read used by `GET /admin/published-project-owners`: returns the
  latest owners with published-project counts and their most recent project.

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
The service checks ownership, requests a normalized repository snapshot from the
exported GitHub evidence service, applies owner-reviewed metadata overrides, and
writes project-owned data with Prisma. Draft projects stay hidden from future
contributor discovery until the owner confirms publication by saving the project
as `published`. The owner projects list reads only project-owned records and
their contribution request/application counts; it does not call GitHub.

Future project workflows belong in focused project services when the root
service becomes difficult to scan. This module must not access GitHub clients or
GitHub tables directly.
