# GitHub App Provider Contract

## Registration settings

- Public GitHub App when users outside the owning organization must install it.
- Request user authorization during installation so the backend can verify which
  logged-in user may access the installation.
- No setup URL. The state-bearing installation URL returns through the configured
  OAuth callback. Additional members of an existing organization installation use
  the normal state-bound GitHub App web authorization flow.
- Repository selection: selected repositories.
- Repository permissions: Metadata read-only and Contents read-only.
- Webhook active with a strong secret.
- Required lifecycle events: `installation` and the automatic
  `installation_repositories` event.

## Backend provider operations

1. Generate a short-lived app JWT using App ID and private key.
2. Exchange the user authorization code once using Client ID/Client Secret;
   refresh expiring user authorization with the rotating refresh token.
3. Resolve the token's immutable GitHub user ID and require it to match the
   GitHub identity linked to the initiating Share-k user.
4. List installations/repositories accessible to the user token to prove the
   initiating user currently has access to the callback's installation. One
   organization installation may be linked by multiple independently verified
   Share-k users.
5. Query installation details as the app and verify app ID, account, status,
   repository-selection mode, and permissions.
6. Generate a short-lived installation access token on demand after member and
   repository authorization succeeds.
7. List repositories accessible to the installation with pagination.
8. Use the installation token for existing README/language/activity/commit/file
   evidence reads.

## Credential rules

- Private key and client/webhook secrets come from validated secret
  configuration and never appear in source, responses, or logs.
- Expiring user and rotating refresh tokens are encrypted on the individual
  Share-k user-installation link and used only for current member-access checks.
  Refresh failure requires reauthorization; user revocation disables only that
  user's affected links.
- Installation tokens are ephemeral, minted on demand, and neither cached nor
  persisted in the first release.
- Code must not assume a fixed token length or prefix.
- Live member/repository verification is required on picker refresh, generation
  start, and worker evidence-read boundaries. A stored verification timestamp is
  audit metadata and cannot authorize a later read by itself.

## Webhook verification

- Verify the provider HMAC signature against the exact raw request body before
  parsing or persisting any state.
- Read delivery ID, event, and action headers; deduplicate delivery ID.
- Reject invalid signatures without state changes.
- `installation.created/unsuspend` causes provider re-verification before
  activation.
- `installation.suspend/deleted` revokes authorization for every user link to
  that canonical installation.
- `installation_repositories.added/removed` refreshes the selected repository
  set using immutable repository IDs.
- `github_app_authorization.revoked` clears the affected member authorization and
  disables only links verified as that provider user.

## Evidence permission matrix

Official endpoint contracts were checked in `research.md`: installation/member
repository lists, repository metadata, languages, contributor statistics, commit
activity, README, and commit listing require no more than `Metadata: read` plus
`Contents: read`. An operation requiring broader permission is removed or
separately approved, not silently granted.

## Failure behavior

- Idempotent reads: at most three attempts with exponential backoff and jitter;
  honor `Retry-After` or provider rate-limit reset headers.
- Authorization-code exchange: do not blindly retry because the code is
  single-use; return a safe restart-required outcome.
- `401/403`: refresh a derived installation token once within the three-attempt
  ceiling when safe, then surface authorization or revocation state.
- `404`: re-check installation/repository state; do not reinterpret it as public
  authorization.
- `429` or rate-limit exhaustion: honor provider reset/retry hints with bounded
  backoff and a retryable application status.
- `5xx`/timeout: bounded idempotent retry; never approve or invent evidence.
- Malformed provider responses: fail closed with safe observability metadata.

## Public redaction contract

Private repository names, URLs, README/code content, commit details, raw evidence,
provider payloads, and installation credentials cannot appear in public profile,
project, discovery/retrieval, logging, or unrelated AI response contracts.
Approved skills may expose only minimal public-safe attribution defined by an
explicit DTO allowlist. Contract and E2E tests must inspect all affected public
boundaries.
