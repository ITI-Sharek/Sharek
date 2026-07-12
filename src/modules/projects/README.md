# Projects Module

Owns project drafts, owner-reviewed metadata, publication, visibility, and
discovery data.

Projects answers these questions:

- Which Share-k projects exist?
- Which owner controls a project?
- Is a project still a draft or published?
- Which normalized GitHub repository data was used to create the project?
- What project metadata is visible to contributors?

Implemented endpoint:

- `POST /projects/import/github`

## Current Structure

```text
projects/
  projects.module.ts
  application/
    dto/imported-project.dto.ts
    mappers/project.mapper.ts
    use-cases/project-import.service.ts
  presentation/
    http/controllers/projects.controller.ts
    http/requests/import-github-project.request.ts
```

## How The Current Flow Works

```text
ProjectsController
  -> ImportGitHubProjectRequest
  -> ProjectImportService
  -> GitHubRepositoryService.getPublicImportSnapshot()
  -> project create/update through DatabaseService
  -> project mapper
  -> ImportedProjectDto
```

`POST /projects/import/github` is owner/admin-only. It asks the GitHub module
for a normalized public repository snapshot by `owner/repo` or GitHub repo URL,
then creates or refreshes a draft `Project`. Owner GitHub connection is not
required for this MVP import path.

Use this module for:

- Creating a project draft from normalized GitHub repository data.
- Updating owner-editable project metadata.
- Publishing and archiving projects.
- Listing/searching published projects.

This module stores repository references and normalized metadata. It must not
own or expose GitHub access tokens.

## Where To Put New Files

- `presentation/http/controllers`: project import, edit, publish, archive, and
  discovery endpoints.
- `presentation/http/requests`: create/update/publish/archive/search request
  validation.
- `presentation/http/responses`: project detail, project list, draft, or
  discovery response shapes.
- `application/use-cases`: import from GitHub, update draft, publish project,
  archive project, search published projects.
- `application/dto`: project outputs used by controllers or other modules.
- `application/mappers`: conversion from project records to safe DTOs.
- `domain/entities`: create when project lifecycle needs protected transitions
  such as draft -> published -> archived.
- `domain/policies`: owner edit policy, publication readiness policy,
  visibility policy.
- `infrastructure/persistence`: Prisma project repository when project queries
  outgrow the use case.

## Boundaries

Projects owns project state. It does not own GitHub OAuth tokens, contribution
applications, delivery reviews, or reputation.

Contribution tasks belong in `contribution-tasks`, even though they are created
under a project.
