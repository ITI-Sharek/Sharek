# GitHub Module

Owns the integration between Share-k and GitHub.

GitHub answers these questions:

- Is a Share-k user connected to GitHub?
- Which GitHub account is connected?
- Which repositories can we read for this user?
- What normalized repository evidence can other modules use?

Implemented endpoints:

- `GET /github/oauth/start`
- `GET /github/oauth/callback`
- `POST /github/oauth/callback`
- `GET /github/account`
- `GET /github/repositories`
- `GET /github/readme`
- `GET /github/repository/description`
- `GET /github/repository/statistics`
- `GET /github/repository/contribution-activity`
- `GET /github/repository/commit-signals`
- `DELETE /github/account`

## Current Structure

```text
github/
  github.module.ts
  application/
    dto/github-account.dto.ts
    dto/github-repository.dto.ts
    mappers/github-account.mapper.ts
    use-cases/github-oauth.service.ts
    use-cases/github-repository.service.ts
  infrastructure/
    integrations/github-api.client.ts
    security/github-token-encryption.service.ts
  presentation/
    http/controllers/github-oauth.controller.ts
    http/requests/github-oauth-callback.request.ts
```

## How The Current Flow Works

OAuth flow:

```text
GitHubOAuthController
  -> GitHubOAuthService
  -> GitHub OAuth API
  -> GitHubTokenEncryptionService
  -> gitHubAccount and gitHubOAuthState tables
  -> GitHubAccountDto
```

Repository flow:

```text
GitHubOAuthController
  -> GitHubRepositoryService
  -> encrypted token lookup
  -> GitHubApiClient
  -> normalized GitHubRepositoryDto
```

Repository evidence flow:

```text
GitHubRepositoryService.getImportSnapshot() or getPublicImportSnapshot()
  -> GitHubApiClient repository/README/languages/activity/commit calls
  -> normalized GitHubRepositoryImportSnapshot
  -> projects import or future skill profiling orchestration
```

Use this module for:

- GitHub OAuth connection metadata.
- Token references or encrypted token storage.
- Repository metadata ingestion.
- README/language/activity evidence collection.
- GitHub API normalization and rate-limit handling.

Other modules should request normalized GitHub data through ports or public
application services. They should not call GitHub SDKs directly.

Repository import behavior:

- `GET /github/repositories` lists repositories available through the connected
  GitHub token. Contributors grant the stronger GitHub `repo` scope so this can
  include private repositories for skill evidence. Owner/admin GitHub connect is
  optional and uses lighter public repository consent.
- `POST /projects/import/github` is owner/admin-only and creates or refreshes a
  draft `Project` from public GitHub repository metadata by `owner/repo` or
  GitHub repo URL. It does not require an owner GitHub account connection.
- Import stores normalized language, topic, statistics, and README snapshots so
  later background ingestion can pass stable repository evidence to the separate
  FastAPI AI repository.

Contributor skill evidence is the primary reason to fetch all visible
repositories from GitHub. Owner project import still uses the GitHub module for
normalization, but owners should not be asked for private repository access
unless the product explicitly adds private project publishing later.

Normalized evidence currently includes:

- repository title, owner, description, URL, visibility, default branch, topics,
  and basic repository counters.
- language byte counts from GitHub languages.
- README raw content when GitHub exposes it.
- contribution activity from GitHub contributor and weekly commit stats when
  available.
- recent commit signals: commit headline, author login, commit URL, and authored
  date.
- `unavailableReason` values for optional activity/commit data when GitHub
  returns pending, empty, missing, or unavailable stats.

Public application service methods:

- `listRepositories(userId)` for the frontend repository picker.
- `getRepositoryReadme(userId, fullName)` for authenticated README preview.
- `getRepositoryDescription(userId, fullName)` for authenticated description
  lookup.
- `fetchRepositoryStatistics(userId, fullName)` for authenticated statistics
  and normalized evidence.
- `fetchContributionActivity(userId, fullName)` for authenticated contribution
  activity.
- `fetchCommitSignals(userId, fullName, author?)` for authenticated recent
  commit signals, optionally filtered by author text.
- `getImportSnapshot(userId, fullName)` for connected-account repository
  snapshots.
- `getPublicImportSnapshot(repositoryReference)` for owner public project
  import without a connected owner GitHub account.
- `getSkillProfilingEvidence(userId, repositoryLimit)` for future contributor
  skill-profile generation orchestration.
- `markRepositoryImportPrepared(userId)` to mark the connected account as ready
  for later ingestion work.

What is not implemented yet:

- A background job that runs GitHub ingestion automatically after OAuth connect.
- Persistent evidence tables for AI skill profiling snapshots.
- Webhooks or scheduled repository refresh.
- Full code-file evidence extraction.

## Tests

Automated coverage includes:

- `src/modules/github/application/use-cases/github-repository.service.spec.ts`
  for repository normalization and skill-profiling evidence snapshots.
- `src/modules/github/infrastructure/integrations/github-api.client.spec.ts`
  for GitHub adapter behavior and optional evidence responses.
- `test/github-onboarding.spec.ts` for the HTTP smoke flow:
  register owner -> start GitHub OAuth -> mocked callback -> get account ->
  list repositories -> import GitHub project.
- `test/github-onboarding.spec.ts` also verifies OAuth consent scope selection:
  owners request `public_repo`, while contributors request `repo` so private
  repository evidence is available after explicit GitHub consent.

The smoke test does not use a real GitHub OAuth app or real GitHub `code`.
Manual browser testing is still required before demo if the team changes GitHub
OAuth app settings, callback URLs, or scopes.

## Where To Put New Files

- `presentation/http/controllers`: GitHub connection, repository, webhook, or
  account HTTP endpoints.
- `presentation/http/requests`: OAuth callback, webhook, repository selection,
  or sync request validation.
- `presentation/http/responses`: stable frontend response shapes for GitHub
  account or repository data.
- `application/use-cases`: OAuth start/callback, disconnect, list repositories,
  repository sync, import snapshot preparation.
- `application/dto`: normalized GitHub account, repository, evidence, or sync
  result DTOs.
- `application/mappers`: conversion from GitHub payloads or Prisma records into
  safe DTOs.
- `application/ports`: define reader ports only if other modules should depend
  on an interface instead of the exported service.
- `infrastructure/security`: token encryption and token-related helpers.
- `infrastructure/integrations`: GitHub API clients and provider-specific HTTP
  behavior.
- `infrastructure/jobs`: repository ingestion or scheduled sync jobs.

## Boundaries

This module may export a narrow public service for normalized repository data.
It must not expose raw GitHub tokens to other modules or the frontend.

`projects` may ask GitHub for a normalized import snapshot. `projects` owns the
Share-k project record and publication workflow.

`skill-profiles` or AI ingestion may use normalized evidence later. They must
not call GitHub SDKs or decrypt tokens directly.
