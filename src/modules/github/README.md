# GitHub Module

Owns GitHub OAuth state, encrypted connection credentials, linked account data,
and normalized repository/evidence retrieval.

## Public HTTP Areas

- OAuth start/callback/disconnect and connected account status.
- Repository paging, README, description, statistics, languages, technologies,
  contribution activity, commit signals, and import snapshots.

## Structure

```text
controllers/
services/
  github-oauth.service.ts
  github-account.service.ts
  github-repository.service.ts
  github-evidence.service.ts
dto/
integrations/github-api.client.ts
mappers/
security/github-token-encryption.service.ts
github.module.ts
README.md
```

The module exports `GitHubOAuthService`, `GitHubAccountService`,
`GitHubRepositoryService`, and `GitHubEvidenceService`. Consumers use those
services and DTOs; GitHub API and encryption implementations are private. Only
this module writes GitHub-owned tables or decrypts provider tokens.

Both identity-only sign-in and repository-connection authorization URLs force
GitHub's account picker with `prompt=select_account`. The repository flow uses
the dedicated `/auth/github/callback/repository` browser callback before the
frontend completes the protected connection request. Identity consumers may
resolve the owner of an exact GitHub numeric account ID and verify the GitHub ID
connected to a Sharek user through the exported `GitHubOAuthService`; provider
email is profile metadata and is not a GitHub sign-in key.

Contributor repository OAuth requests `repo` scope. The current MVP uses that
read grant together with explicit frontend repository selection and analysis
consent. `GitHubEvidenceService` re-resolves every selected repository through
the stored encrypted token before producing skill evidence, so callers cannot
submit arbitrary inaccessible repository names. The identity module owns the
authenticated callback that reconciles the selected GitHub ID with social
sign-in linkage.
