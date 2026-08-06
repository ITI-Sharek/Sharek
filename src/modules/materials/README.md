# Materials Module

Safe Materials: versioned documents attached to a Project or a Contribution
Request, stored privately and released only to authorized readers.

## The rule that shapes everything here

**Upload is storage consent, not AI-processing consent.** Nothing in this
module extracts, embeds, retrieves, or calls a provider. AI processing is a
separate, entitlement-checked action over an explicit Analysis Set of exact
Material Versions, and it lives outside this module by design.

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

Scanning runs on a queue rather than the request path, and a reaper releases
versions stranded mid-scan — without it, a job lost to a crash leaves a file
its owner can neither use nor diagnose.

## Cross-module boundary

Project and Assignment facts are read through exported `ProjectsService`
capabilities. This module never reads another module's tables directly.
