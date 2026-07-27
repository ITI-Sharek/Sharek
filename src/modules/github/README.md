# GitHub Module

Owns legacy GitHub repository OAuth state during cutover plus canonical GitHub
App installations, independently verified user links, selected repository
membership, encrypted member authorization, signed webhook delivery state, and
normalized repository/evidence retrieval. Identity-only GitHub login remains
owned by `identity`.

## Public HTTP Areas

- OAuth start/callback/disconnect and connected account status.
- Repository paging, README, description, statistics, languages, technologies,
  contribution activity, commit signals, and import snapshots.
- Optional GitHub App installation start/completion/status/disconnect, selected
  repository picker, authenticated callback-attempt candidate lookup, and signed
  lifecycle webhook receiver.

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
security/github-app-credentials.service.ts
integrations/github-app-api.client.ts
github.module.ts
README.md
```

The module exports its workflow services only. Provider clients, private-key and
HMAC handling, token encryption, and GitHub persistence remain private. Only
this module writes GitHub-owned tables or decrypts provider tokens.

The GitHub App uses authorization during installation and no setup URL. The
backend hashes expiring single-use state, exchanges callback codes immediately,
stores only an opaque attempt ID in the frontend redirect, and independently
exposes safe candidates only through the authenticated attempt-owner endpoint
before independently verifying each Share-k user's live member access again at
completion. One organization installation
can therefore have multiple isolated user links. Local disconnect clears only
one link and never uninstalls the provider app or removes identity login.

Installation tokens are minted on demand and never stored or returned. Member
user/refresh tokens are encrypted per link, rotated on refresh, and used only
for member-access verification. Evidence reads require live member and selected
repository validation, then use the installation token. Webhooks verify the
exact raw-body HMAC, deduplicate delivery IDs, reconcile installation and
repository lifecycle, and revoke only the matching provider member on
`github_app_authorization.revoked`.

Security/projection review (2026-07-27): HTTP DTOs expose no tokens, secrets,
private keys, state hashes, or raw provider payloads; callback redirects expose
only opaque attempt IDs/safe error codes; public skill profile projection omits
evidence summaries; admin and authorized AI evidence sources are explicitly
allowlisted; no GitHub App secret value is logged. Private repository evidence
remains permitted only in owner generation, bounded admin review, and the
authorized skill-profile AI request.

Both identity-only sign-in and repository-connection authorization URLs force
GitHub's account picker with `prompt=select_account`. The repository flow uses
the dedicated `/auth/github/callback/repository` browser callback before the
frontend completes the protected connection request. Identity consumers may
resolve the owner of an exact GitHub numeric account ID and verify the GitHub ID
connected to a Sharek user through the exported `GitHubOAuthService`; provider
email is profile metadata and is not a GitHub sign-in key.

Legacy contributor repository OAuth may remain available only until the durable
database cutover clock is set. After cutover, broad routes fail with
`GITHUB_REPOSITORY_OAUTH_MIGRATED`, provider revocation is attempted, and local
credentials are purged regardless of provider outcome. Identity-only GitHub
login and anonymous public-project import are preserved.

Before cutover, contributor repository OAuth requests `repo` scope. The legacy
MVP uses that
read grant together with explicit frontend repository selection and analysis
consent. `GitHubEvidenceService` re-resolves every selected repository through
the stored encrypted token before producing skill evidence, so callers cannot
submit arbitrary inaccessible repository names. The identity module owns the
authenticated callback that reconciles the selected GitHub ID with social
sign-in linkage.
