# HTTP API Contract: Optional GitHub Skill Profiling

All protected operations derive the user from the authenticated session. IDs in
request data never authorize another user's installation or generation.

## Start GitHub App connection

`POST /github/app/installations/start`

Returns the configured GitHub App installation URL with a cryptographically
random state and expiry. GitHub App user authorization during installation is
enabled; no setup URL is used. The backend stores only a hash of the state before
the callback. Starting requires an existing GitHub identity link for the
authenticated Sharek user.

## Complete GitHub App connection

Browser callback: `GET /auth/github/app/callback`

Protected candidate lookup: `GET /github/app/installations/attempts/:attemptId`

Protected frontend completion: `POST /github/app/installations/callback`

The browser callback receives provider `code` and `state`, consumes the state,
exchanges the single-use code immediately, and redirects with only an opaque
connection-attempt ID or safe error code. It never forwards the code, user token,
refresh token, or provider payload to the frontend. Before listing installations
or retaining member credentials, it requires the provider's immutable GitHub user
ID to match the GitHub identity linked to the state owner.

The authenticated candidate lookup accepts only a UUID attempt owned by the
current user that is callback-processed, unexpired, and not completion-consumed.
It returns only `attemptId`, `expiresAt`, and allowlisted candidate
`providerInstallationId`, `accountLogin`, and `accountType` fields. For
reauthorization it returns only the attempt's intended installation candidate.

The protected completion request contains the opaque attempt ID plus one provider
installation ID selected from the attempt's server-verified accessible candidates.
The provider installation ID remains an untrusted choice: completion rechecks it
with the encrypted member authorization before returning an allowlisted
user-scoped installation-link summary.
If the same organization installation is already stored, completion reuses its
canonical provider record and creates only the authenticated user's verified
link. It never copies another user's consent, generations, or skills.

## Installation status

`GET /github/app/installations`

Returns the authenticated user's installation-link summaries: user-scoped ID, account
login/type, status, repository-selection mode, installed/verified timestamps,
and safe action URLs. It never returns provider tokens, secrets, or raw payloads.

## Repository picker

`GET /github/app/repositories?installationLinkId=<uuid>&page=1&perPage=30`

Performs live provider revalidation and returns only repositories currently
available to the authenticated user through the selected installation link:

```json
{
  "items": [
    {
      "repositoryId": "123456",
      "fullName": "octocat/example",
      "visibility": "private",
      "defaultBranch": "main"
    }
  ],
  "page": 1,
  "perPage": 30,
  "hasNextPage": false,
  "verifiedAt": "2026-07-26T12:00:00.000Z"
}
```

## Start generation

`POST /skill-profiles/me/generations`

The existing operation evolves to require a user-scoped installation-link ID,
immutable repository IDs, and explicit consent. Display names are server-derived
snapshots and are not accepted as authorization input:

```json
{
  "installationLinkId": "user-scoped-link-uuid",
  "repositoryIds": ["123456"],
  "consent": {
    "accepted": true,
    "version": "github-skill-analysis-v1"
  }
}
```

The backend refreshes member authorization when needed and revalidates the user's
installation link and every repository through GitHub before it
creates/enqueues the generation. Existing polling remains:

`GET /skill-profiles/me/generations/:generationId`

Reload recovery uses `GET /skill-profiles/me/generations/latest`, which returns
the authenticated user's newest generation in the same DTO shape. If a start is
rejected with `SKILL_PROFILE_GENERATION_ALREADY_ACTIVE`, the error metadata
contains the owned active `generationId` so the frontend can resume polling.

## Retry generation

`POST /skill-profiles/me/generations/:generationId/retry`

The authenticated contributor may retry only their own failed or
`needs_more_evidence` generation. The server copies the prior installation and
repository selection, requires a new accepted consent/version in the request,
revalidates current access, and creates a new generation ID. A valid installation
does not need to be reconnected. Removed repositories produce an explicit access
error and are not silently omitted.

## Disconnect installation

`DELETE /github/app/installations/:installationLinkId`

Locally disables that installation link and all future Share-k reads through it
after ownership validation. It does not delete identity-only GitHub login linkage
or affect other Share-k users linked to the same organization installation, and
does not uninstall the GitHub App. The response includes the provider settings
URL for the separate manage/uninstall action.

## Webhook receiver

`POST /webhooks/github/app`

Unauthenticated by Share-k session but authenticated by the GitHub webhook HMAC
signature. Supports installation lifecycle and repository-selection changes,
plus mandatory per-user `github_app_authorization` revocation, deduplicated by
provider delivery ID.

## Stable Error Codes

- `GITHUB_APP_NOT_CONFIGURED`
- `GITHUB_APP_STATE_INVALID`
- `GITHUB_APP_STATE_USER_MISMATCH`
- `GITHUB_APP_IDENTITY_REQUIRED`
- `GITHUB_APP_ACCOUNT_MISMATCH`
- `GITHUB_APP_INSTALLATION_NOT_VERIFIED`
- `GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED`
- `GITHUB_APP_INSTALLATION_INACTIVE`
- `GITHUB_APP_REPOSITORY_NOT_SELECTED`
- `GITHUB_APP_REPOSITORY_ACCESS_REVOKED`
- `GITHUB_APP_WEBHOOK_SIGNATURE_INVALID`
- `GITHUB_APP_PROVIDER_UNAVAILABLE`
- `SKILL_PROFILE_ANALYSIS_CONSENT_REQUIRED`
- `SKILL_PROFILE_INSTALLATION_REQUIRED`
- `SKILL_PROFILE_GENERATION_NOT_RETRYABLE`

Existing error-envelope conventions and authorization guards remain unchanged.
