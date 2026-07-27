# Research: Optional GitHub Skill Profiling

## Decision 1: Use a GitHub App for repository evidence

**Decision**: Use a GitHub App installation with `Metadata: read` and
`Contents: read`, configured for selected repositories. Use short-lived
installation access tokens for evidence reads.

**Rationale**: GitHub Apps provide fine-grained permissions, explicit repository
selection, revocation signals, and short-lived installation credentials. This
matches the constitution and avoids the current OAuth App `repo` scope granting
access to everything the user can access.

**Alternatives considered**:

- Keep the current OAuth App `repo` scope: rejected as overly broad.
- Fine-grained personal access tokens: rejected because users would manually
  create and rotate credentials and Share-k would lose an installation lifecycle.
- Public repositories only: rejected because Feature 1 permits explicitly
  selected private evidence.

## Decision 2: Keep registration and social identity independent

**Decision**: Registration and profile access do not depend on GitHub. Existing
GitHub social sign-in may remain identity-only during migration. It cannot
authorize repository reads.

**Rationale**: This implements the requested UX, prevents provider outages from
blocking accounts, and preserves passwordless GitHub users without confusing
identity consent with code-analysis consent.

**Alternatives considered**:

- Remove GitHub sign-in immediately: rejected because it could lock out existing
  passwordless users.
- Reuse the GitHub App user token for all repository reads: rejected because
  installation tokens better represent app-selected repository access.

## Decision 3: Verify installation ownership server-side

**Decision**: Put a cryptographically random, expiring, single-use state on the
GitHub App installation URL. Enable user authorization during installation and
complete through the configured OAuth callback; do not configure or depend on a
setup URL. Exchange the code immediately on the backend, then query GitHub for
installations/repositories accessible to that user before accepting one untrusted
provider installation choice. Additional members of an existing organization
installation use the normal state-bound GitHub App web authorization flow.

**Rationale**: GitHub supports state on the installation URL, redirects
authorization-during-install through the callback URL, and makes the setup URL
unavailable in that mode. Server-side member-access verification prevents one
Share-k user from claiming another person's installation.

**Alternatives considered**:

- Combine a setup URL with authorization during installation: rejected because
  GitHub does not allow both settings.
- Trust a provider installation ID from the browser: rejected as an ownership flaw.
- Link installations only from webhooks: rejected because a webhook identifies
  the installation but does not by itself prove which logged-in Share-k user
  initiated the link.

## Decision 4: Use installation tokens as ephemeral credentials

**Decision**: The GitHub module signs an app JWT and creates an installation
access token on demand after current member/repository authorization succeeds.
Installation tokens are never persisted, cached, logged, or returned outside
`github` in the first release.

**Rationale**: Installation tokens expire after one hour, but no measured token
minting pressure justifies a new cache. On-demand creation is simpler and avoids
new credential-bearing Redis state; caching can be reconsidered with measurements.

**Alternatives considered**:

- Store installation tokens encrypted in PostgreSQL: rejected because they are
  short-lived derived credentials.
- Cache tokens in Redis until expiry: deferred until provider-call/latency
  measurements justify the additional secret lifecycle.

## Decision 4A: Persist expiring member authorization on the user link

**Decision**: Encrypt the GitHub App user token and rotating refresh token on the
individual Share-k user-installation link. Use them only for live member-access
verification. Refresh transactionally; refresh expiry/failure moves the link to
`reauthorization_required`, and provider revocation moves it to `revoked`.

**Rationale**: GitHub's user token represents the intersection of app access and
that member's current access. Without a refreshable member token, later picker,
start, and worker checks cannot prove which organization member is still allowed.

**Alternatives considered**:

- Callback-only member token: rejected because it cannot authorize later reads.
- Reauthorization at every boundary: rejected as disruptive and unsuitable for
  delayed BullMQ work.
- Installation/webhooks only: rejected because they do not prove the individual
  member's current access.

## Decision 5: Subscribe only to lifecycle webhooks

**Decision**: Enable signed webhooks and handle `installation`, the automatically
available `installation_repositories` event, and mandatory
`github_app_authorization` revocation. Deduplicate by delivery ID and process
state changes idempotently.

**Rationale**: These events promptly communicate suspension, deletion, and
repository-selection changes without broad event access or aggressive polling.

**Alternatives considered**:

- Poll every installation: rejected for delayed revocation and rate-limit cost.
- Subscribe to push/code events: rejected because skill analysis is explicitly
  user-triggered and does not require continuous source monitoring.

## Decision 6: Use an additive, staged OAuth migration

**Decision**: Add installation state first and switch new evidence collection to
the GitHub App second. One durable database cutover transaction stops legacy reads
and establishes the authoritative clock. The operation attempts provider
revocation for each broad credential, records success/failure, and purges the local
credential regardless; failed provider revocations produce explicit manual action
rather than retaining Share-k access. Raw legacy private evidence becomes
non-authorizing/non-reusable, then is redacted/purged after 30 days. Never
auto-convert consent.

**Rationale**: Existing GitHub identity links, generations, and approved skills
must remain usable. A staged migration is forward-only and recoverable.

**Alternatives considered**:

- Purge broad credentials at schema deployment rather than an audited cutover:
  rejected because it creates an uncontrolled rollback boundary.
- Continue accepting either credential indefinitely: rejected because it leaves
  the broad access path active and creates two authorization models.

## Decision 7: Use built-in Node.js cryptography

**Decision**: Use built-in Node.js `crypto` to sign short-lived RS256 GitHub App
JWTs and verify webhook SHA-256 HMAC signatures. Do not add a GitHub
authentication library for this bounded functionality.

**Rationale**: The Docker runtime is Node 22, whose maintained `crypto` APIs
support RSA-SHA256 signing, SHA-256 HMAC, timing-safe comparison, and authenticated
encryption. The operations are bounded and testable; no `package.json` change is
needed. Avoiding another credential-handling dependency reduces upgrade surface.

**Alternatives considered**:

- Add a GitHub App authentication SDK: rejected for the first implementation
  because token exchange and provider API calls already fit the module-local
  client pattern and do not require a broader SDK.
- Hand-build cryptography: rejected; all signing and HMAC primitives come from
  built-in, maintained Node.js APIs.

## Decision 8: Support multiple installations per user

**Decision**: A Share-k user may link multiple personal or organization
installations. Each installation has independent repository selection, status,
authorization checks, disconnect, and webhook reconciliation.

**Rationale**: Contributors commonly own personal repositories and participate
in multiple organizations. A one-installation constraint would force destructive
replacement and block legitimate evidence selection.

**Alternatives considered**:

- One installation per user: rejected as incompatible with personal plus
  organization usage.
- One personal and one organization installation: rejected as an arbitrary cap
  that still fails for contributors in multiple organizations.

## Decision 8A: Separate provider installations from user links

**Decision**: Store each provider installation once, and store a separate
user-to-installation link for every Share-k user whose current access GitHub has
independently verified. An organization installation may therefore have many
Share-k user links. Repository choices for analysis, consent, generations,
skills, and local disconnect remain scoped to the individual Share-k user.

**Rationale**: A GitHub organization installation is organization-wide rather
than owned by the first Share-k member who links it. A join entity preserves the
provider installation's global lifecycle while preventing one member from
inheriting another member's product consent or generated profile.

**Alternatives considered**:

- Make `installation_id` unique on a row containing one `user_id`: rejected
  because it prevents other verified organization members from using the app.
- Copy the installation once per user: rejected because webhook state and
  repository membership could diverge across duplicate provider records.

## Decision 9: Preserve decisions, purge legacy private access

**Decision**: At production cutover stop new use of legacy OAuth evidence and
revoke/purge broad repository OAuth credentials. Keep raw private evidence
non-authorizing and non-reusable for 30 days, then redact/purge it while preserving
approved skills, admin decisions, and minimal public-safe audit attribution.
Unresolved legacy candidates become `needs_more_evidence`.

**Rationale**: This retains reviewed contributor value without preserving the
broad credential or private content that motivated the migration.

**Alternatives considered**:

- Delete approved skills: rejected as unnecessarily destructive to reviewed
  business state.
- Retain credentials/private evidence indefinitely: rejected as perpetuating the
  privacy and least-privilege problem.

### Legacy field disposition

The cleanup must use an allowlist, not a generic JSON scrub:

| Existing field | Disposition |
| --- | --- |
| `GitHubAccount.access_token` | Null in the audited cutover operation; identity login uses the separate social-identity record |
| `GitHubAccount.refresh_token` and `token_expires_at` | Null in the audited cutover operation |
| `GitHubAccount.raw_profile_data` | Purge; retain only allowlisted identity columns such as `github_id`, `username`, `avatar_url`, and `profile_url` when still needed for identity/display |
| `SkillProfileGeneration.selected_repositories` | Replace legacy private names/URLs with minimal immutable repository IDs or redacted attribution markers needed for audit |
| `SkillProfileGeneration.evidence_snapshot` | Purge raw private content, names, URLs, commit/file details, and derived excerpts; retain only a public-safe attribution/version marker and decision linkage |
| `SkillProfile.evidence_summary` | Purge or rewrite when it contains private identifiers/content; retain only an allowlisted public-safe reviewed summary |
| `SkillProfile.evidence_sources` | Remove private names, URLs, content, and raw provider details; retain minimal reviewed provenance that cannot identify a private repository |
| `SkillProfileReviewDecision` and approved `SkillProfile` decision fields | Retain as durable business/audit decisions |

Fixtures must classify each JSON key before cleanup. Unknown keys fail closed and
are removed rather than presumed safe.

## Decision 10: Separate disconnect from uninstall

**Decision**: Local Share-k disconnect disables one installation link and all
reads through it while preserving GitHub login identity. GitHub uninstall is a
separate provider-managed action linked from the profile.

**Rationale**: Organization installations may be managed outside the current
Share-k user's authority. A local disconnect must not unexpectedly uninstall an
organization-owned app.

**Alternatives considered**:

- Automatically uninstall: rejected as overly destructive for shared
  organization governance.
- Require GitHub-only uninstall: rejected because Share-k needs an immediate
  local revocation control.

## Decision 11: Bound provider retries

**Decision**: Retry idempotent provider reads at most three times with
exponential backoff and jitter, honoring `Retry-After` or rate-limit reset
headers. Do not blindly retry single-use authorization-code exchange.

**Rationale**: This satisfies integration resilience without duplicate callback
consumption or unbounded request amplification.

**Alternatives considered**:

- Retry every request uniformly: rejected because authorization codes are
  single-use and callback outcomes require explicit restart behavior.
- Never retry: rejected because transient read failures would create avoidable
  user-visible failures.

## Decision 12: Authorize with live provider revalidation

**Decision**: Refresh the encrypted member authorization when needed and
revalidate the user's link and current repository membership on
every repository-picker refresh, generation start, and worker evidence-read
boundary. `last_verified_at` is audit metadata, not an authorization cache TTL.
Mint an installation token on demand only after validation succeeds.

**Rationale**: This defines “current” without an arbitrary freshness threshold
and closes the interval between consent and queued processing. Webhooks provide
prompt revocation, while live checks protect against missed or delayed events.

**Alternatives considered**:

- Accept a recently verified database timestamp: rejected because “recently” is
  ambiguous and can authorize access after revocation.
- Webhooks alone: rejected because delivery can be delayed or fail.

## Decision 13: Project evidence through explicit audience allowlists

**Decision**: Define separate mappings for the owning contributor's generation
detail, bounded admin review, the authorized skill-profiling AI request, and
other-user/public approved-skill output. Only the first three may contain bounded
private evidence; public output contains no private repository ID/name/URL/content
or identifying derived detail.

**Rationale**: Current `SkillProfileSummaryService` returns persisted
`evidence_summary` and `evidence_sources` directly. Test-only redaction would not
satisfy the constitution; the transformation must be an owning service/DTO rule.

**Alternatives considered**:

- Treat approved evidence summaries as automatically public-safe: rejected; AI
  text and evidence IDs can contain private repository names.
- Frontend filtering: rejected because public visibility is backend-enforced.

## Brownfield OAuth consumer and private-field inventory

This inventory is a planning prerequisite, not an implementation discovery task.

| Current consumer/data | Current authorization/data shape | Cutover disposition |
| --- | --- | --- |
| `GET/POST /github/oauth/callback` and browser repository callback | Stores encrypted broad OAuth credential and allowlisted raw profile `{id, login, name, avatar_url, html_url}` | Retire repository callback at cutover; keep separate identity callback/link |
| `GET /github/repositories` | Broad token -> `/user/repos`, then language reads | Replace with user-scoped installation-link picker |
| README/description/statistics/contribution/commit-signal GitHub routes | Client `fullName` plus broad token | Require link + immutable repository ID or retire compatibility route |
| Skill generation | `selected_repositories[{fullName}]`; broad-token evidence | Migrate to link ID, repository IDs, consent, and bounded snapshots |
| `GitHubAccount` credential/profile fields | `access_token`, `refresh_token`, `token_expires_at`, `raw_profile_data` | Credentials null at cutover; profile JSON removed by day 30; typed identity columns retained only if needed |
| `AuthProviderAccount.raw_profile_data` | Identity-only social-login snapshot owned by `identity`; no repository credential | Retain only the existing allowlisted identity fields needed for login/profile display; never treat it as repository evidence or purge it with `GitHubAccount` |
| `SkillProfileGeneration.selected_repositories` | Private `fullName` values | Owner/admin snapshot only; public-safe marker after cleanup |
| `SkillProfileGeneration.evidence_snapshot` | Repository metadata, README excerpt, statistics, contribution and commit signals | Authorized owner/admin/audit only before cleanup; raw private detail removed at day 30 |
| `SkillProfile.evidence_summary` | AI text, potentially identifying | Store/rewrite a separately validated public-safe summary before public projection |
| `SkillProfile.evidence_sources.evidenceIds` | Current form `github:owner/repo` | Replace private name-derived IDs with opaque evidence IDs; never expose in public DTOs |
| Public project import | Anonymous public-repository fetch; no broad user token | Preserve independently; do not force private-installation authorization into public import |
| Contributor GitHub status | Current account existence, already supports disconnected result | Evolve to installation-link summaries; do not reimplement missing-account handling |
| Legacy `DELETE /github/account` | Deletes repository `GitHubAccount` row | Retire/compatibly remap repository disconnect without deleting social identity |

Unknown keys in any legacy JSON fixture fail closed. The implementation tasks may
extend this table when a concrete current field is found, but may not defer the
initial classification or presume an unknown field is safe.

## GitHub App endpoint-permission matrix

Official GitHub endpoint documentation confirms that the intended permission set
is sufficient for the current evidence operations:

| Current operation | GitHub endpoint | Required repository permission |
| --- | --- | --- |
| Installation repository listing | `GET /installation/repositories` | None beyond a valid installation token |
| Member-access repository listing | `GET /user/installations/{id}/repositories` | `Metadata: read` |
| Repository metadata/description | `GET /repos/{owner}/{repo}` | `Metadata: read` |
| Languages | `GET /repos/{owner}/{repo}/languages` | `Metadata: read` |
| Contributor statistics | `GET /repos/{owner}/{repo}/stats/contributors` | `Metadata: read` |
| Commit activity | `GET /repos/{owner}/{repo}/stats/commit_activity` | `Metadata: read` |
| README | `GET /repos/{owner}/{repo}/readme` | `Contents: read` |
| Recent commits | `GET /repos/{owner}/{repo}/commits` | `Contents: read` |

No current Feature 1 evidence operation requires write, organization, pull-request,
administration, or broad OAuth scope. Public project import continues to use the
same endpoints anonymously for public repositories.

## Primary References

- [GitHub App registration settings](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration)
- [Sharing a GitHub App and installation state](https://docs.github.com/en/apps/sharing-github-apps/sharing-your-github-app)
- [Generating a GitHub App user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Refreshing GitHub App user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [GitHub App installation endpoints](https://docs.github.com/en/rest/apps/installations)
- [Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [Repository metadata and languages](https://docs.github.com/en/rest/repos/repos)
- [Repository README/content](https://docs.github.com/en/rest/repos/contents)
- [Repository statistics](https://docs.github.com/en/rest/metrics/statistics)
- [Repository commits](https://docs.github.com/en/rest/commits/commits)
- [GitHub App webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
