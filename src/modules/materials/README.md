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

## Cross-module boundary

Project and Assignment facts are read through exported `ProjectsService`
capabilities. This module never reads another module's tables directly.
