# Internal Contract: Projects to GitHub and Identity

**Consumer**: `projects` module  
**Providers**: `github` module (SK-107) and `identity` module  
**Transport**: In-process exported NestJS services and explicit DTOs, not HTTP

This contract describes the module boundary required by SK-112. It is not a
NestJS class design and does not authorize Projects to read GitHub- or
Identity-owned tables.

## Boundary Rules

- Caller identity comes from the authenticated ShareK session and is passed to
  exported services by server code, never copied from a public request field.
- `github` alone chooses provider credentials, decrypts any existing credential,
  mints App/installation tokens, calls GitHub, and writes GitHub-owned state.
- `identity` alone reads/writes authenticated provider identity associations.
- No result contains tokens, App private keys, installation IDs, raw permissions,
  raw provider responses, provider request IDs, or internal exception text.
- A persisted GitHub selection/installation observation is not sufficient by
  itself for a private read or publication. GitHub revalidates current access.
- Provider access is read-only. No contract method mutates a repository.
- SK-112 may adapt to these exported operations but does not create or own
  installation, selection, credential, token, OAuth/App setup, webhook, or
  reconciliation persistence. Private and organization/shared acceptance paths
  remain blocked until SK-107 implements and contract-tests them.

## Repository Reference Resolution

### Operation

`resolveRepositoryEvidence(input)`

### Trusted Input

| Field | Type | Notes |
|---|---|---|
| `actorUserId` | UUID | Derived from session by Projects |
| `repositoryReference` | string | GitHub URL or `owner/name`; treated only as a locator |
| `purpose` | enum | `preview`, `draft_confirmation`, or `refresh` |
| `expectedProviderRepositoryId` | string optional | Stale/change check, not authority |
| `deadlineAt` | timestamp | Projects request budget propagated to GitHub |

### Success Result

| Group | Fields |
|---|---|
| Identity | provider=`github`, numeric `providerRepositoryId`, canonical `fullName`, canonical `repositoryUrl`, numeric `ownerProviderId`, display `ownerLogin`, `ownerType`=`user|organization` |
| Source facts | visibility, archived/disabled/fork facts, default branch, provider update/push markers, provider version/ETag when available, fetchedAt |
| Imported areas | repository name/description, languages, topics, deterministic technology defaults, allowlisted statistics, permitted README content |
| Evidence state | completeness=`complete|partial`, per-area status, safe unavailable-area codes, uncertainty, provenance/normalization version, redaction scope |
| Read authorization | `public_read` or `github_app_selection`; safe authorization and selection status; authorizationCheckedAt; opaque `authorizationEvidenceRef` |

For public sources, no GitHub account connection is required for preview/draft.
An App credential used only for transport quota never becomes caller control
evidence. For private sources, success requires an active installation, current
repository access, and explicit ShareK selection for the acting user.

### Safe Failure Result/Error

| Condition | Safe code | Retry behavior |
|---|---|---|
| malformed/unsupported reference | `GITHUB_REPOSITORY_REFERENCE_INVALID` | non-retryable until corrected |
| missing, private-unselected, deleted, or inaccessible during preview | `GITHUB_SOURCE_NOT_AVAILABLE` | uniform 404; no existence detail |
| known owned Project lost private access | `PROJECT_SOURCE_AUTHORIZATION_REQUIRED` | reconnect/select, then retry with new command key |
| rate limit | `GITHUB_RATE_LIMITED` | retry only at sanitized `retryAfter` |
| overall deadline | `GITHUB_PROVIDER_TIMEOUT` | retryable |
| provider/network 5xx | `GITHUB_PROVIDER_UNAVAILABLE` | retryable |
| malformed required provider payload | `GITHUB_PROVIDER_INVALID_RESPONSE` | retryable/configuration investigation |
| optional metadata unavailable/pending | success with `partial` and per-area safe codes | refresh later |

Raw 403/404 distinctions, scopes, installation/account identities, provider
bodies, headers, and request IDs stay internal.

The preview caller sets `deadlineAt` from the validated configured overall
budget, which defaults to and may never exceed 8,000 ms. Every underlying call
uses the lesser of the remaining overall budget and the validated per-call
timeout. No optional read or retry extends that absolute deadline.

## Publication Control Verification

### Identity Lookup

Projects calls the exported Identity provider-account query with the acting user
and provider `github`. The result is either:

- `{ providerAccountId, linked: true }`, using immutable numeric GitHub ID; or
- `{ linked: false }`.

The service returns no raw profile, OAuth token, or Identity persistence object.
The lookup must reflect current persisted linking; request input cannot supply or
override the provider account ID.

### GitHub Control Operation

`verifyPublicationControl(input)`

| Field | Type | Notes |
|---|---|---|
| `actorUserId` | UUID | Persisted Project owner from session |
| `providerRepositoryId` | string | From current Project source association |
| `expectedOwnerProviderId` / `expectedOwnerType` | string/enum | Stale-source checks |
| `personalProviderAccountId` | string optional | Trusted result of Identity lookup, never request data |
| `deadlineAt` | timestamp | Bounded current check |

### Policy

1. Re-resolve the repository by numeric ID/current canonical provider data.
2. If visibility is public, owner type is `user`, and the trusted personal
   provider account ID equals the current numeric repository-owner ID, return
   `personal_identity_match`.
3. Otherwise require current App installation authority plus a persisted,
   explicit ShareK selection for this actor and repository. Mint/use a
   repository-scoped installation token and re-read the repository before
   returning `github_app_selection`.
4. A collaborator/organization membership visible through OAuth is never enough.
5. A rename updates attribution; a transfer/owner-ID change invalidates the old
   personal match and requires the policy to run against the new owner.

### Success Result

| Field | Type | Disclosure |
|---|---|---|
| `allowed` | literal `true` | Internal |
| `method` | `personal_identity_match|github_app_selection` | Stored in transition audit; owner response may use a friendly status |
| `checkedAt` | timestamp | Owner/audit |
| `authorizationVersion` | opaque string | Internal audit only |
| `authorizationEvidenceRef` | opaque string | Internal audit only; not an installation ID |
| `currentSourceIdentity` | normalized identity fields | Used to detect transfer/visibility change |

### Failure Result

Return a typed denial with a safe reason and recovery action; do not throw a raw
provider error as business evidence.

| Reason | Projects mapping |
|---|---|
| GitHub identity absent/mismatch for personal public source | `PROJECT_REPOSITORY_CONTROL_REQUIRED`, reconnect matching identity |
| App not installed/associated | `PROJECT_REPOSITORY_CONTROL_REQUIRED`, install/associate App |
| Repository not explicitly selected | `PROJECT_REPOSITORY_CONTROL_REQUIRED`, select repository |
| Installation suspended/deleted or repository removed | `PROJECT_SOURCE_AUTHORIZATION_REQUIRED`, reauthorize/reselect |
| Provider timeout/rate/outage | provider-safe retryable errors; Project remains draft |

## Private Snapshot Disclosure Check

`verifyPrivateEvidenceRead(input)` verifies current access before Projects
returns cached private snapshot content in an owner response. Input is acting
owner plus numeric repository ID. Success returns safe authorization/selection
status; failure causes Projects to omit cached source content and return only
owner-controlled values plus recovery status. Project ownership alone never
restores repository access.

## Source Invalidation Notification

SK-107 emits or exposes an idempotent typed invalidation after it recognizes a
revocation, repository unselection, ownership transfer, deletion, visibility
change, or equivalent source/control change. The Projects consumer receives
only:

| Field | Type | Rule |
|---|---|---|
| `provider` | literal `github` | Routing only |
| `providerRepositoryId` | numeric string | Normalized identity; no installation ID |
| `reason` | approved safe enum | No provider message/body |
| `recognizedAt` | timestamp | Ordering/idempotency input |
| `invalidationVersion` | opaque string | Deduplication/ordering only |

Projects updates only its own safe source/disclosure state. A recognized event
marks affected evidence stale immediately, stops later source use, and withholds
affected public repository attribution/content. It does not archive or
unpublish the Project. Duplicate or older events are no-ops. GitHub retains
webhook signature, delivery, retry, installation, and reconciliation ownership.

## SK-107 Persistence Expectations

The exact Prisma model names belong to SK-107, but its approved capability must
represent:

- installation identity/target and active, suspended, deleted state;
- authenticated ShareK-user association to an installation;
- provider repository availability to that installation;
- explicit ShareK user selection even when provider installation mode is `all`;
- selection/revocation timestamps and last live verification;
- single-use hashed setup/OAuth state with short expiry;
- deduplicated webhook delivery GUID and reconciliation status;
- expiring App user identity authorization when SK-107 uses it;
- encrypted long-lived credentials only where unavoidable, with decryption
  private to GitHub; installation access tokens remain transient.

The GitHub App requests only Metadata: read and Contents: read. It subscribes
only to events required to invalidate/reconcile installation and repository
state. Installation callbacks are correlated with single-use state and the
installation is verified through authenticated GitHub App-user APIs; a callback
`installation_id` is never trusted alone.

## Timeout, Rate Limit, and Retry Contract

- `GITHUB_API_URL`, `GITHUB_API_OVERALL_TIMEOUT_MS`, and
  `GITHUB_API_REQUEST_TIMEOUT_MS` are validated by the shared environment
  schema, documented in `.env.example`, and injected into the client through
  `ConfigService`; the client contains no hardcoded API base URL.
- Overall Projects provider budget: at most 8 seconds (default 8 seconds);
  individual GitHub call: no greater than the overall budget (default 4
  seconds); optional metadata concurrency: maximum 2.
- Every fetch, including README and optional evidence, carries an abort signal
  bounded by both the per-call timeout and remaining overall deadline.
- Essential repository identity is fetched before optional areas.
- GitHub statistics `202`, `204`, or repository-empty cases become partial
  evidence and are not polled synchronously.
- One synchronous remint/retry is allowed after 401 only for an internally
  minted cached token. No immediate retry for 429, timeout, or 5xx.
- GitHub parses provider rate/deprecation/permission diagnostics internally and
  emits safe retryability and retry-after metadata only.
- Background webhook/reconciliation retries are bounded, exponential, jittered,
  and idempotent; they cannot create/publish/archive a Project.

## Revocation and Reconciliation

- Installation deletion/suspension and repository removal invalidate cached
  credentials, authoritative access, and related selections immediately in the
  GitHub-owned state.
- User authorization revocation invalidates that user's identity/App association
  but is not treated as an installation uninstall.
- Webhook HMAC is verified over the raw request body with constant-time compare;
  delivery GUID is unique/deduplicated; processing is queued after prompt 2xx.
- Webhooks accelerate invalidation but do not replace a live check before private
  read or publication because deliveries may fail or arrive out of order.
- A periodic reconciliation writes only GitHub-owned tables and exposes changed
  safe status through the exported service. It never mutates a Project directly.
- Reconciliation of legacy Projects-owned source aliases is a separate Projects
  transaction supplied with normalized GitHub output; it is not performed by a
  Prisma migration and does not move GitHub-owned persistence into SK-112.

## Contract Tests Required Before SK-112 Private Acceptance

- public preview works without identity/repository OAuth and produces no
  caller-control proof;
- private preview fails without active App + explicit selection and succeeds
  only with both;
- an installation configured for `all` still requires explicit ShareK selection;
- callback installation ID spoofing is rejected;
- personal control compares numeric IDs and survives login rename;
- organization/shared and non-owner-user repositories require App selection;
- repository transfer invalidates prior personal control;
- suspension, deletion, unselection, token expiry, webhook replay/out-of-order,
  and missed-webhook live checks revoke correctly;
- provider token/permission/installation/raw-error fields never cross the
  exported DTO boundary;
- 401 remint, 429 retry-after, timeout, 5xx, malformed payload, and partial
  metadata follow the safe contract.
- configured API URL is used, invalid URL/deadline combinations fail startup
  validation, and every call/preview stops within its injected absolute budget;
- duplicate/out-of-order invalidation notifications are idempotent and expose
  no webhook or installation internals.

The Admin owner-summary and contribution/application workspace contracts are
defined separately in `project-summary-module-contracts.md`.
