# Data Model: Optional GitHub Skill Profiling

## Ownership

- `github` owns installation, installation repository, OAuth/install state, and
  webhook delivery records.
- `skill-profiles` owns generation consent and immutable evidence snapshots.
- `identity` continues to own social-provider login links.
- No module writes another module's records directly.

## GitHubAppInstallation

Represents one provider-owned GitHub App installation. It is stored once even
when multiple Share-k users link the same organization installation.

| Field | Purpose |
| --- | --- |
| `id` | Internal UUID |
| `installation_id` | Immutable GitHub installation ID stored as a string |
| `account_id` | GitHub user/organization numeric ID |
| `account_login` | Display login snapshot |
| `account_type` | `user` or `organization` |
| `repository_selection` | Must be `selected` for Feature 1 |
| `permissions` | Allowlisted permission snapshot |
| `status` | `active`, `suspended`, `deleted`, or `verification_failed` |
| `installed_at` | Provider installation time |
| `last_verified_at` | Last successful provider verification |
| `suspended_at` / `deleted_at` | Revocation timestamps |
| timestamps | Created/updated audit times |

Constraints:

- `installation_id` is globally unique.
- One organization installation may have multiple independently verified user
  links; provider lifecycle and repository membership remain canonical here.
- Only `active` installations may mint credentials.
- Permissions must not exceed configured read-only Metadata/Contents access.

## GitHubAppInstallationLink

Represents one Share-k user's independently verified access to a provider
installation.

| Field | Purpose |
| --- | --- |
| `id` | Internal UUID exposed as the user-scoped installation link ID |
| `installation_id` | Owning internal provider-installation UUID |
| `user_id` | Authenticated Share-k user |
| `github_user_id` | Provider user ID independently verified by the member token |
| `github_login` | Allowlisted display snapshot for this authorization |
| `encrypted_user_token` / `user_token_expires_at` | Expiring member credential used only for current-access verification |
| `encrypted_refresh_token` / `refresh_token_expires_at` | Rotating credential used only to refresh member authorization |
| `status` | `active`, `disconnected`, `reauthorization_required`, or `revoked` |

Invariant: `github_user_id` must equal the immutable GitHub provider account ID
owned by the link's Share-k user in `AuthProviderAccount`. The backend verifies
this at authorization callback, protected completion, and every later repository
read; the login snapshot is never used for equality or authorization.
| `last_verified_at` | Audit time of the latest live GitHub access verification |
| `linked_at` / `disconnected_at` / `revoked_at` | User-link lifecycle timestamps |
| timestamps | Created/updated audit times |

Constraints:

- Unique on provider installation plus Share-k user.
- A user may link multiple installations, and an organization installation may
  link multiple users.
- Picker refresh, generation start, and worker evidence reads require live
  provider revalidation; `last_verified_at` never authorizes by age alone.
- Member credentials are encrypted with the existing GitHub token-encryption
  boundary, rotated transactionally, never exposed outside `github`, and never
  used to read evidence.
- Disconnect changes only this link and does not disconnect other users or
  uninstall the provider installation.

## GitHubAppRepository

Current mutable repository membership for an installation, keyed by an immutable
provider repository ID.

| Field | Purpose |
| --- | --- |
| `id` | Internal UUID |
| `installation_id` | Owning internal provider-installation UUID |
| `github_repository_id` | Immutable GitHub repository ID as a string |
| `full_name` | Current owner/name display and request value |
| `visibility` | Public/private/internal snapshot |
| `default_branch` | Evidence lookup metadata |
| `selected_at` | First verified selection time |
| `last_verified_at` | Latest provider confirmation |
| `removed_at` | Time access was removed |

Constraints:

- Unique on installation plus GitHub repository ID.
- Active picker results require `removed_at = null` and an active installation.
- Renames update `full_name`; authorization relies on immutable IDs.

## GitHubAppLinkState

Short-lived, single-use connection attempt binding installation/authorization
completion to an authenticated Share-k user.

Fields include UUID, user ID, flow type (`install_and_authorize` or
`authorize_existing_installation`), optional target installation UUID, hashed
state, expiry, callback-consumed time, completion-consumed time, verified GitHub
user metadata, allowlisted accessible-installation candidates, short-lived
encrypted pending user/refresh credentials, and safe failure metadata. Raw state
and authorization code are never persisted. The callback exchanges the code
immediately; it never forwards the code or provider token to the frontend. The
protected completion moves the pending credentials to exactly one verified link
and clears them from the attempt.

## GitHubWebhookDelivery

Idempotency and operational record for a signed GitHub App webhook.

Fields include delivery ID, event/action, installation ID, received/processed
times, status, retry count, and safe error code. The raw provider payload is not
retained unless a bounded redacted audit requirement is approved.

`installation` and `installation_repositories` update canonical provider state.
The mandatory `github_app_authorization` revocation identifies a provider user
and disables that user's matching links without changing other members' links or
the canonical organization installation.

## GitHubEvidenceCutover

Singleton GitHub-owned operational state for the one authoritative production
cutover.

| Field | Purpose |
| --- | --- |
| `id` | Stable singleton key |
| `cutover_at` | Durable production cutover timestamp; null before cutover |
| `executed_by` | Audited operator/service identity |
| `legacy_credentials_purged_at` | Completion time for cutover credential purge |
| `provider_revocation_succeeded_count` / `provider_revocation_failed_count` | Safe aggregate outcome; failures require manual provider action |
| `legacy_evidence_cleanup_due_at` | Exactly `cutover_at + 30 days` |
| `legacy_evidence_cleaned_at` | Idempotent evidence-cleanup completion time |
| `last_error_code` | Safe operational failure code |

The database record is the only cutover clock. Environment configuration may
enable the capability before cutover but cannot supply or override this timestamp.

## SkillProfileGeneration Changes

Add immutable consent/authorization snapshot fields to the existing generation:

- user-scoped installation-link ID plus immutable provider-installation snapshot;
- consent version and `consented_at`;
- selected GitHub repository IDs plus full-name snapshots;
- authorization verification timestamp;
- revocation/authorization failure code when processing cannot proceed.

The `skill-profiles` module records these values. It asks the exported GitHub
service to validate selections and return a bounded evidence snapshot; it never
reads GitHub persistence or credentials directly.

## Evidence Projections

- **Owner generation detail**: own selected repository IDs/names plus bounded
  evidence and uncertainty; never credentials or raw provider payloads.
- **Admin review**: minimum private identifiers/evidence needed for the decision,
  through an explicit admin DTO.
- **Authorized skill-profile AI request**: only the selected, currently authorized
  bounded evidence required by the versioned AI contract.
- **Other-user/public output**: approved skill fields and non-identifying
  attribution only; no private repository name, URL, ID, content, or derived detail.

## State Transitions

```text
link state: issued -> consumed
                   -> expired
                   -> rejected

installation: active -> suspended -> active
             active -> deleted
             verification_failed -> active (after verified relink)

user link: active -> disconnected
           active -> revoked
           active -> reauthorization_required -> active (after verified reauth)

repository: selected -> removed
            removed -> selected (after provider re-add and verification)

generation: queued -> processing -> completed
           queued/processing -> needs_more_evidence
           queued/processing -> failed
```

Before `queued -> processing`, repository authorization is revalidated. A
suspended/deleted installation or removed repository causes a safe terminal or
retryable generation outcome before another private provider read.

## Migration Sequence

1. Before implementation, inventory every legacy credential consumer and every
   private/unknown field or JSON key, and approve the retain/redact/purge allowlist.
2. Add installation/user-link/link-state/repository/webhook/cutover tables and
   nullable generation consent snapshot fields; make legacy credential columns
   nullable without deleting data.
3. Deploy dual-capability code but keep current behavior behind a capability flag.
4. Require GitHub App installations for new generation requests and backfill no
   consent automatically.
5. In one audited cutover operation, use a database transaction to persist
   `cutover_at` and stop new legacy reads. Attempt provider revocation per stored
   credential, record safe outcomes, purge each local credential regardless, and
   expose failures for manual provider revocation. Raw legacy private evidence
   becomes non-authorizing/non-reusable.
6. After 30 days, run idempotent module-owned cleanup using the field-level
   allowlist in `research.md`: redact or purge
   private JSON/string evidence, retain approved skills/admin decisions/minimal
   safe attribution, and transition unresolved legacy candidates to
   `needs_more_evidence`. Cleanup is controlled-clock service/operations work,
   not one large schema migration.
