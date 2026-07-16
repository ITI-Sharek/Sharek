# M5 Backend Integration And Cloud Agent

## Scope

Allowed primary areas:

- `src/modules/github`
- `src/modules/projects`
- `src/modules/contribution-tasks`
- `src/modules/delivery-reviews`
- Docker/deployment support in coordination with M6

## Responsibilities

- Implement GitHub OAuth integration and repository normalization.
- Build project publishing workflows.
- Build contribution task workflows.
- Build delivery submission and owner review workflows.
- Keep GitHub tokens out of project and task modules.
- Coordinate evidence data with M2.

## Not Allowed

- Do not let project modules call GitHub SDKs directly if the GitHub module can
  provide normalized data.
- Do not update reputation directly from delivery logic.
- Do not store GitHub secrets in logs or responses.

## Required Tests

- GitHub adapter normalization.
- Project publish visibility.
- Task creation ownership.
- Delivery submission authorization.
- Delivery approved event behavior.

