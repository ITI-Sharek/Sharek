# HTTP API Contract: GitHub Project Draft and Publication

**Feature**: SK-112  
**Owner base resource**: `/projects`  
**Public base resource**: `/public/projects`  
**Error envelope**: existing ShareK `{ statusCode, code, message, metadata? }`

This contract is the planned target, not current implemented behavior. JSON
examples show allowlisted fields; dates are ISO-8601 strings.

## Shared Rules

- Ordinary owner interactions require an active authenticated OWNER or
  CONTRIBUTOR. ADMIN has no ordinary private-draft access.
- The backend derives actor and owner from the session. Request/query/header
  data never accepts `userId`, `ownerId`, `role`, or Admin privilege.
- Unknown and non-owned private Project IDs both return `404 PROJECT_NOT_FOUND`.
- Every side-effecting request requires `Idempotency-Key`, 8-128 printable
  non-whitespace characters. The raw key is not persisted.
- Mutable Project commands require integer `expectedRevision >= 1`.
- Same idempotency key and request fingerprint replays the original status/body
  with `Idempotency-Replayed: true`; reuse with different input returns 409.
- Request DTOs use the existing global whitelist and reject extra properties.
- Public and owner responses use separate DTOs/mappers. No route returns a raw
  Prisma record or raw GitHub response.
- Public routes use a separate `/public/projects` namespace. No public dynamic
  route exists under `/projects/:projectId`, so `/projects/me` cannot be parsed
  as a public identifier regardless of controller registration order.

## Shared Safe Source Types

### Source attribution

```json
{
  "provider": "github",
  "repositoryId": "123456",
  "fullName": "sharek/example",
  "repositoryUrl": "https://github.com/sharek/example",
  "visibility": "public",
  "ownerType": "organization",
  "defaultBranch": "main",
  "sourceVersion": "provider-version-or-null",
  "sourceUpdatedAt": "2026-07-21T10:00:00.000Z",
  "fetchedAt": "2026-07-21T10:00:02.000Z"
}
```

Owner/preview attribution may include the fields above. It never includes
installation ID, App target ID, permissions, tokens, scopes, provider request
IDs, or raw owner/provider objects.

### Source status

```json
{
  "syncStatus": "partial",
  "authorizationStatus": "authorized",
  "selectionStatus": "selected",
  "lastAttemptAt": "2026-07-21T10:00:00.000Z",
  "lastRequiredReadAt": "2026-07-21T10:00:02.000Z",
  "freshUntil": "2026-07-21T10:15:02.000Z",
  "isStale": false,
  "invalidationReason": null,
  "lastSuccessfulRefreshAt": "2026-07-21T10:00:02.000Z",
  "unavailableAreas": ["statistics"],
  "recoveryAction": null
}
```

Allowed safe statuses are defined in `data-model.md`. Internal errors and
provider identifiers are never substituted for `unavailableAreas`.

## 1. Preview GitHub Repository

`POST /projects/github/preview`

Authentication: active OWNER or CONTRIBUTOR. No idempotency key; no Project,
source, snapshot, audit, or receipt write.

Request:

```json
{
  "repositoryReference": "https://github.com/sharek/example"
}
```

Validation: 1-500 characters; supported GitHub URL or `owner/name`; no query,
fragment, extra path, credential, or alternate host.

Success `200`:

```json
{
  "previewFingerprint": "sha256-of-normalized-review-input",
  "source": {
    "provider": "github",
    "repositoryId": "123456",
    "fullName": "sharek/example",
    "repositoryUrl": "https://github.com/sharek/example",
    "visibility": "public",
    "ownerType": "organization",
    "defaultBranch": "main",
    "sourceVersion": "etag-or-update-marker",
    "sourceUpdatedAt": "2026-07-21T10:00:00.000Z",
    "fetchedAt": "2026-07-21T10:00:02.000Z"
  },
  "imported": {
    "repositoryName": "example",
    "description": "Provider description",
    "languages": { "TypeScript": 12000 },
    "topics": ["nestjs"],
    "technologies": ["TypeScript", "NestJS"],
    "statistics": { "stars": 5, "forks": 1 },
    "readmeContent": "# Example"
  },
  "ownerDefaults": {
    "title": "example",
    "description": "Provider description",
    "tags": ["nestjs"],
    "technologies": ["TypeScript", "NestJS"]
  },
  "evidence": {
    "completeness": "complete",
    "fieldStatus": {
      "languages": "updated",
      "readme": "updated",
      "statistics": "updated"
    },
    "unavailableAreas": [],
    "authorizationStatus": "public_read",
    "selectionStatus": "not_required"
  }
}
```

Partial optional data still returns 200 with `completeness: partial`, per-area
status, and safe unavailable areas. Required identity failure returns an error
and no trusted fingerprint. The server creates one absolute provider deadline
from validated configuration, never later than eight seconds after provider
work starts. All GitHub calls stop within that budget, and ShareK returns this
allowlisted success or a safe actionable failure within ten seconds, excluding
transport outside ShareK.

## 2. Create Confirmed Draft

`POST /projects`

Authentication: active OWNER or CONTRIBUTOR. Requires `Idempotency-Key`.
Always creates a private `draft`; no `status` field is accepted.

Request:

```json
{
  "source": {
    "provider": "github",
    "repositoryReference": "sharek/example",
    "previewFingerprint": "fingerprint-returned-by-preview"
  },
  "project": {
    "title": "ShareK Example",
    "description": "Reviewed owner copy",
    "tags": ["collaboration"],
    "technologies": ["TypeScript", "NestJS"],
    "category": "web",
    "difficulty": "intermediate"
  }
}
```

All `project` fields are optional at draft creation. If omitted, source defaults
populate title/description/tags/technologies and their manual flags remain false.
If supplied, the matching manual flag is true. Category/difficulty are always
owner-controlled. A changed fingerprint returns 409 and requires preview again.

Success `201`: `ProjectOwnerView` below, with `status: draft`, `revision: 1`,
and `publishedAt`/`archivedAt` null.

Different idempotency keys intentionally allow multiple private drafts for the
same canonical repository. The same key cannot create two drafts.

## 3. List My Projects

`GET /projects/me?cursor=<opaque>&limit=20`

Authentication: active OWNER or CONTRIBUTOR. Existing dashboard fields and
quota remain, with bounded pagination added. `limit` defaults to 20, maximum 50.

Success `200`:

```json
{
  "projects": [
    {
      "id": "uuid",
      "title": "ShareK Example",
      "slug": "example",
      "status": "draft",
      "revision": 3,
      "openRequestsCount": 0,
      "pendingApplicationsCount": 0,
      "lastActivityLabel": "today"
    }
  ],
  "quota": { "used": 0, "monthlyLimit": 20 },
  "pageInfo": { "nextCursor": null, "hasNextPage": false }
}
```

The current contribution-request/application aggregate is preserved but not
copied into source/public queries. Projects loads only Project-owned rows and
composes the counts from the typed exported ContributionTasks and Applications
readers in `project-summary-module-contracts.md`; it does not traverse their
Prisma relations directly.

## 4. Get Owner Project View

`GET /projects/me/:projectId`

Authentication: active OWNER or CONTRIBUTOR and persisted owner match.

Success `200` (`ProjectOwnerView`):

```json
{
  "id": "uuid",
  "status": "draft",
  "revision": 3,
  "project": {
    "title": "ShareK Example",
    "description": "Reviewed owner copy",
    "tags": ["collaboration"],
    "technologies": ["TypeScript", "NestJS"],
    "category": "web",
    "difficulty": "intermediate",
    "manualOverrides": ["title", "description", "tags", "technologies"]
  },
  "source": {
    "attribution": {},
    "latestSnapshot": {
      "evidenceId": "uuid",
      "description": "Provider description",
      "languages": { "TypeScript": 12000 },
      "topics": ["nestjs"],
      "technologies": ["TypeScript", "NestJS"],
      "statistics": { "stars": 5, "forks": 1 },
      "readmeContent": "# Example",
      "completeness": "complete",
      "fieldStatus": {},
      "uncertainty": []
    },
    "status": {}
  },
  "publishedAt": null,
  "archivedAt": null,
  "createdAt": "2026-07-21T10:01:00.000Z",
  "updatedAt": "2026-07-21T10:01:00.000Z"
}
```

The `{}` attribution/status placeholders use the shared shapes above. Before
including cached private snapshot content, the backend verifies current private
read authority. If authority is revoked or cannot be safely confirmed, it omits
`latestSnapshot` content and returns only owner-controlled values plus a safe
authorization/recovery status.

## 5. Edit Owner-Controlled Fields

`PATCH /projects/me/:projectId`

Authentication: active persisted owner. Requires `Idempotency-Key`.

Request:

```json
{
  "expectedRevision": 3,
  "title": "New reviewed title",
  "description": null,
  "tags": [],
  "restoreFromSource": ["technologies"]
}
```

Allowed editable fields: title, description, tags, technologies, category, and
difficulty. `restoreFromSource` accepts title, description, tags, and
technologies. A field cannot be edited and restored in the same request. At
least one change/restore is required. Source identity and source evidence fields
are rejected by the DTO whitelist.

Success `200`: updated `ProjectOwnerView`, revision incremented once.

## 6. Refresh Source Metadata

`POST /projects/me/:projectId/source/refresh`

Authentication: active persisted owner. Requires `Idempotency-Key`.

Request:

```json
{ "expectedRevision": 3 }
```

Success `200`: updated `ProjectOwnerView`. A fully or partially adopted snapshot
increments revision once. Optional unavailable areas retain their last valid
values with `retained_stale` status. Required provider failure does not increment
revision or replace the current snapshot; the safe refresh attempt/status is
returned or mapped to the errors below.

## 7. Explicitly Publish

`POST /projects/me/:projectId/publish`

Authentication: active persisted owner. Requires `Idempotency-Key`.

Request:

```json
{ "expectedRevision": 4, "confirm": true }
```

Success `200`:

```json
{
  "projectId": "uuid",
  "status": "published",
  "revision": 5,
  "publishedAt": "2026-07-21T10:10:00.000Z",
  "transitionId": "uuid"
}
```

The command validates the approved field rules: non-empty valid title;
category and difficulty; all other supplied values within DTO limits; a current
trustworthy source snapshot; a verified numeric repository identity; current
identity, visibility, and publication control; the globally ready legacy-source
reconciliation gate; and the one-published-repository invariant. Publication
performs the live required-fact/control check even if the source is inside its
15-minute display freshness window. If stale or invalidated facts cannot be
revalidated, the draft, revision, current snapshot, and owner fields remain
unchanged and only a safe retry/recovery result is returned. Description, tag
count, technology count, README, AI, and indexing are not new mandatory
publication rules unless a later approved decision says so.

## 8. Archive a Published Project

`POST /projects/me/:projectId/archive`

Authentication: active persisted owner. Requires `Idempotency-Key`.

Request:

```json
{ "expectedRevision": 5, "confirm": true }
```

Success `200`:

```json
{
  "projectId": "uuid",
  "status": "archived",
  "revision": 6,
  "archivedAt": "2026-07-21T11:00:00.000Z",
  "transitionId": "uuid"
}
```

Archived Projects disappear from public reads. Direct `published -> draft` and
all archived reactivation/republish attempts return 409.

## 9. Public Published List

`GET /public/projects?cursor=<opaque>&limit=20`

Authentication: public. Limit defaults to 20, maximum 50. Ordering is
`publishedAt DESC, id DESC`; cursor is opaque. No search, filtering, semantic
discovery, ranking, recommendations, or indexing is added by this feature.

Success `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "ShareK Example",
      "description": "Reviewed owner copy",
      "tags": ["collaboration"],
      "technologies": ["TypeScript", "NestJS"],
      "category": "web",
      "difficulty": "intermediate",
      "publishedAt": "2026-07-21T10:10:00.000Z",
      "source": {
        "provider": "github",
        "attributionStatus": "public",
        "fullName": "sharek/example",
        "repositoryUrl": "https://github.com/sharek/example",
        "fetchedAt": "2026-07-21T10:00:02.000Z"
      }
    }
  ],
  "pageInfo": { "nextCursor": null, "hasNextPage": false }
}
```

For a private-backed published Project, `source` is exactly:

```json
{ "provider": "github", "attributionStatus": "withheld" }
```

The same withheld shape is returned immediately after a known revocation,
repository unselection, ownership transfer, deletion, visibility change, or
equivalent invalidation affects an already-published Project. The Project stays
in the list with owner-controlled presentation until explicit owner archive.

The query itself includes `status = published`; mapping is not the visibility
control. Draft/archived projects never contribute to the page or cursor.

## 10. Public Published Detail

`GET /public/projects/:projectId`

Authentication: public. Success `200` uses the same allowlisted public fields as
the list item and may add only separately approved public presentation fields.
Draft, archived, missing, and inaccessible IDs all return
`404 PROJECT_NOT_FOUND`.

Public responses never contain `revision`, owner email/private identity,
repository owner/provider IDs, private full name/URL/visibility, README,
languages/statistics snapshots, source failure/authorization/selection state,
evidence/proof IDs, installation details, or timestamps not explicitly listed.

## Retired Combined Route

`POST /projects/import/github` is not an authoritative target interaction. At
cutover it returns `410 PROJECT_IMPORT_ROUTE_RETIRED` for one documented
compatibility window with safe metadata naming the preview and draft-create
interactions. It never creates, refreshes, or publishes. It may be removed in a
later version after consumers migrate.

## Error Matrix

| HTTP | Code | Applies when | Safe metadata |
|---|---|---|---|
| 400 | `GITHUB_REPOSITORY_REFERENCE_INVALID` | malformed/unsupported locator | corrected format hint |
| 400 | `PROJECT_REQUEST_INVALID` | DTO/idempotency/revision/confirm validation | allowlisted field errors |
| 401 | existing auth error | missing/expired ShareK session | none |
| 403 | `PROJECT_ACCOUNT_NOT_ELIGIBLE` | pending/suspended/deactivated or ordinary Admin | recovery action if applicable |
| 404 | `GITHUB_SOURCE_NOT_AVAILABLE` | preview cannot safely disclose source | none |
| 404 | `PROJECT_NOT_FOUND` | missing/non-owned/private public lookup | none |
| 409 | `PROJECT_REVISION_CONFLICT` | expected revision stale | current revision only for verified owner |
| 409 | `PROJECT_IDEMPOTENCY_KEY_REUSED` | key reused with different request | operation only |
| 409 | `PROJECT_SOURCE_CHANGED_SINCE_PREVIEW` | confirmation fingerprint stale | preview-again action |
| 409 | `PROJECT_REPOSITORY_ALREADY_PUBLISHED` | another public claim won | only already-public Project ID/link |
| 409 | `PROJECT_STATE_TRANSITION_INVALID` | invalid source/target state | current state only for verified owner |
| 410 | `PROJECT_IMPORT_ROUTE_RETIRED` | legacy combined route | replacement interaction names |
| 422 | `PROJECT_PUBLICATION_INCOMPLETE` | approved required project fields missing/invalid | field codes |
| 422 | `PROJECT_REPOSITORY_CONTROL_REQUIRED` | identity/App selection proof absent | safe recovery action |
| 403 | `PROJECT_SOURCE_AUTHORIZATION_REQUIRED` | known owner's private source access revoked | safe reconnect/select action |
| 429 | `GITHUB_RATE_LIMITED` | provider rate limit | retryable, sanitized retryAfter |
| 503 | `PROJECT_PUBLICATION_RECONCILIATION_REQUIRED` | an existing published legacy source lacks stable numeric identity or has an alias conflict | retryable after operator reconciliation; no legacy row detail |
| 503 | `GITHUB_PROVIDER_UNAVAILABLE` | provider/network/configuration outage | retryable boolean |
| 502 | `GITHUB_PROVIDER_INVALID_RESPONSE` | malformed required provider payload | retryable boolean |
| 504 | `GITHUB_PROVIDER_TIMEOUT` | provider budget exceeded | retryable boolean |

No error includes raw GitHub body/message, token/scope/permission, installation
identity, stack trace, provider request ID, or private-repository existence
detail.

## Contract Acceptance Matrix

| Contract proof | Requirements |
|---|---|
| Preview returns 200/partial or safe error and performs zero Project writes | FR-001-FR-007, IR-001, SC-001-SC-002 |
| Create always returns a revision-1 draft owned from session | FR-008-FR-010, SR-001-SR-003 |
| Owner edit rejects source fields and preserves explicit null/empty overrides | FR-011, DR-003-DR-005 |
| Refresh reports area status, exact 15-minute freshness, invalidation, and preserves last snapshot/manual values | FR-012-FR-014, VR-004, IR-004-IR-009 |
| Publish requires confirm, state, completeness, live control revalidation, numeric reconciliation, revision, and idempotency | FR-015-FR-021, SR-004-SR-007 |
| Archive is the only withdrawal and archived cannot reactivate | SR-008-SR-009 |
| Public `/public/projects` list/detail select published, cannot capture `/projects/me`, and use private/invalidated-source redaction | FR-022-FR-023, PR-001-PR-006, TS-003-TS-004, SC-003, SC-006 |
| Retry/races return one deterministic result and no duplicate facts | IR-002-IR-004, SC-008 |
