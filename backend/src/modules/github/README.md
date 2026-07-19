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
  github-remediation.service.ts
dto/
integrations/github-api.client.ts
mappers/
security/github-token-encryption.service.ts
github.module.ts
README.md
```

## Legacy remediation (SEC-003)

OAuth never requests the broad `repo` scope; the granted scope is recorded on
`GitHubAccount.token_scope`. `GitHubAccountService.getAccessToken` refuses
accounts flagged `requires_reauthorization` or whose scope is broad/unrecorded
(`GITHUB_REAUTHORIZATION_REQUIRED`), which blocks all evidence collection
through legacy tokens. `GitHubRemediationService` flags legacy accounts,
quarantines their stored evidence snapshots, purges quarantined snapshots and
obsolete tokens, and keeps a minimal 90-day cleanup audit — see
`docs/operations/github-legacy-remediation.md` and
`scripts/run-github-remediation.ts` (`pnpm remediate:github-legacy`).

The module exports `GitHubOAuthService`, `GitHubAccountService`,
`GitHubRepositoryService`, and `GitHubEvidenceService`. Consumers use those
services and DTOs; GitHub API and encryption implementations are private. Only
this module writes GitHub-owned tables or decrypts provider tokens.
