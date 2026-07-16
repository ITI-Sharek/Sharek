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
