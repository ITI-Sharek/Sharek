# Materials Module

Safe Materials: versioned documents attached to a Project or a Contribution
Request, stored privately and released only to authorized readers.

## The rule that shapes everything here

**Upload is storage consent, not AI-processing consent.** Upload and version
reads never extract, embed, retrieve, or call a provider. The separate
Material-analysis routes in this module own Analysis Set/Run authorization and
persistence, and call the structured AI service only after an owner explicitly
starts a Run.

## Model

- **Material** — identity and ownership scope. Belongs to exactly one of a
  Project or a Contribution Request; a database check constraint enforces that,
  because visibility resolution is undefined for a row attached to both or
  neither.
- **MaterialVersion** — immutable. A replacement is a new version, never an
  edit. Carries the scan state and the storage key.
- **MaterialGrant** — an explicit, revocable grant for `restricted_project`
  visibility. Revoked grants are retained, not deleted, so history stays
  auditable.
- **MaterialAudit** — append-only, and deliberately survives version purge:
  deletion removes content, not the record that content existed.
- **MaterialAnalysisSet/Version** — an owner-selected, version-fixed scope;
  creating it stores metadata only.
- **MaterialAnalysisRun** — one explicit execution over one Set. Raw bytes are
  read only while the Run is starting and are never persisted in analysis rows.
- **MaterialDraftSuggestion** — private, provenance-carrying output. It is not
  a Project or Contribution Request mutation and remains pending owner review.

## Visibility

Three fixed classes, server-enforced, never inferred from role:

| Class | Who can read |
|---|---|
| `public` | any authenticated user who can see the Project |
| `restricted_project` | holders of a live `MaterialGrant`, who must be current active Project assignees |
| `assignment` | the owner before an Assignment exists; owner plus assignee afterwards |

## Storage

Raw bytes go through the `MaterialStorage` port, never a client directly. The
local-filesystem adapter writes outside the repository and is never served
statically, so the only route to bytes is an authorized, non-quarantined
download. Replacing it with S3 or MinIO is an adapter swap.

Storage keys are generated, never derived from user input: a filename-derived
key would let `../` escape the root. The adapter asserts containment anyway.

## Scan lifecycle

A new version is created `quarantined` and is **not downloadable in any state
except `ready`**:

```
quarantined -> scanning -> ready
                        -> rejected
```

Scanning runs on a queue rather than the request path, and every transition is
a conditional claim: a duplicate delivery and the reaper can be acting on the
same version at the same instant, and the claim is what makes one of them lose.

Detection itself is behind the `MalwareScanner` port, with a deterministic stub
bound to it. Everything around the stub is real — the state machine, the queue,
the retry budget, the reaper, and the rule that nothing is downloadable before
a clean verdict — so swapping in ClamAV is a provider change and nothing else.
The stub reports the EICAR test file as infected and everything else as clean,
and `MATERIAL_SCANNER_STUB_MODE` forces a verdict when an operator needs to
reproduce one.

A scanner that cannot answer never produces a verdict; it throws, the version
is released to `quarantined`, and the job is retried. An unreachable scanner
must never be mistaken for one that said "clean".

### When a scan never finishes

Two shapes strand a version, and both leave a file its owner can neither use
nor diagnose: stuck in `scanning` because a worker died holding the claim, or
sitting `quarantined` with nothing queued against it. The reaper sweeps both on
`updated_at`, re-queues them, and — after `MATERIAL_SCAN_MAX_ATTEMPTS`, counted
from the `scan_started` audit rows — gives up.

Giving up leaves the version `quarantined` with `scan_error_code` set to
`MATERIAL_SCAN_ABANDONED`, not `rejected`. It was never cleared, so it stays
undownloadable either way; but `rejected` would tell the owner their file is
malware, when what actually happened is that we failed to check it.

## Listing

`GET /projects/:id/materials` and `GET /contribution-requests/:id/materials`
are filtered **in the query**, not by fetching everything and discarding rows
afterwards. A list that briefly holds Materials the caller cannot see is one
refactor away from returning them, and the count alone already leaks how many
private documents a Project holds. A Contribution Request listing is a
composed view: it returns both Materials attached to that Request and
Materials attached to its Project. Each disjunct in that query mirrors one
visibility class; the access service stays the authority for any single
Material.

An owner's own listing includes their **deleted** Materials, carrying
`deletedAt` and per-version `purgedAt`. The content is gone either way -- but
hiding the record too makes a successful deletion look like a failed request,
with nothing to confirm it happened. Every other read path refuses a deleted
Material outright.

`GET /material-upload-constraints` serves the allowlist and size ceiling from
the same configuration the validator reads. Without it a client can only learn
the limits by being rejected, and any number the frontend hardcodes instead
drifts the first time an operator raises the ceiling.

## Downloads

Bytes never leave through the route that decides access. Reading a Material and
downloading a version are separate calls:

1. `POST /materials/:id/versions/:version/download-token` -- checks that the
   reader may see the Material *and* that the version reached `ready`, then
   mints a short-lived signed token.
2. `GET /material-downloads?token=...` -- verifies the signature and expiry,
   then **resolves access again** from live grants and live Assignments.

That second path is not under `/materials/` on purpose: `/materials/downloads`
is matched by `/materials/:materialId` first, whose UUID pipe rejects the
request before the download handler is reached. Declaration order would paper
over it until someone reordered the methods.

The token names a subject and a target. It never carries the authorization
decision, because a token that said "allowed" would keep working after a
revocation -- and that window is the whole reason revocation exists. The
redemption route also stays behind the access guard and requires the caller to
*be* the token's subject, so a link pasted into a shared channel is not a copy
of the document.

The token is signed with its own secret, never the JWT access secret. Sharing
one would make a download link and a session token interchangeable inputs to
the same verifier, and the link is deliberately the far weaker of the two.

## Deletion

Two phases, because they fail differently:

1. **Access ends inside one transaction** -- `deleted_at` is stamped and every
   live grant is revoked. From that moment the Material is invisible to
   everyone, its owner included, and no already-issued link can redeem.
2. **Content is purged afterwards**, best-effort, with a sweep finishing
   whatever storage refused. A purge that half-fails leaves `purged_at` NULL,
   so the next sweep retries rather than stranding a version that is neither
   downloadable nor purgeable.

Bytes are deleted before the row is stamped. The reverse order can strand
content: a crash in between would mark a version purged while its bytes are
still on disk, and nothing would look at it again.

Audit rows survive. Deletion removes content, not the record that content
existed -- otherwise deleting a Material would also delete the evidence of who
uploaded it, who could read it, and when that ended.

## Cross-module boundary

Project and Assignment facts are read through exported `ProjectsService`
capabilities, and the explicit `PROJECT_MATERIAL_ANALYSIS` entitlement is read
through exported `SubscriptionsService` capabilities. This module never reads
another module's tables directly.

## Material analysis

The owner creates a version-fixed Analysis Set from ready Project Material
Versions through `POST /projects/:projectId/material-analysis/sets`, then
explicitly starts `POST /material-analysis/sets/:analysisSetId/runs`. Limits,
supported MIME types, and the optional minimum subscription plan are exposed by
`GET /projects/:projectId/material-analysis/constraints` and are enforced by
the backend. Access requires an explicit seeded, demo, or admin entitlement
when the subscription gate is enabled; plan rank alone is not sufficient. The
Run is queued; a worker performs the only byte read and calls
the bearer-authenticated FastAPI `/material-analysis/analyze` contract.

The AI service supports Markdown, DOCX, and text-based PDF extraction, treats
document text as untrusted data, chunks and retrieves only within the selected
Analysis Set, and returns allowlisted draft fields with exact source-version
provenance. Completed suggestions and pgvector-backed chunks are persisted
atomically. A stale Run is failed by the reaper.

Suggestions are private until an explicit owner command. Owners can reject a
suggestion, adopt a Project field through `ProjectPublicationService` with an
expected revision, or create a Contribution Request draft through
`ContributionTasksService` with owner-supplied dates. Deleting a source
Material removes its raw analysis chunks and marks retained suggestions as
source-removed. No upload, analysis, or AI response performs automatic business
mutation.
