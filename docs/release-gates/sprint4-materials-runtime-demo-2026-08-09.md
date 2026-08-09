# Sprint 4 Materials Runtime Verification — 2026-08-09

## Result

**PASS.** A real NestJS process on `http://127.0.0.1:4000`, PostgreSQL 16
with pgvector, Redis, and the enabled Material scan worker completed the
Materials access workflow. The runner created a disposable published Project,
published Contribution Request, and accepted Assignment using seeded local
actors. It removed the fixture and purged its Material content after the run.

Credentials, bearer tokens, database identifiers, idempotency keys, and raw
UUIDs are intentionally absent from this record.

## Sanitized HTTP Evidence

| Area | Verified result |
| --- | --- |
| Upload boundary | Project and Request uploads returned `QUARANTINED`; upload has no AI dependency or processing path. |
| Scan release | Clean Markdown versions reached `READY` through the Redis worker. |
| Public Project Material | A contributor listed and downloaded a ready version within a published Project. |
| Immutable replacement | A replacement produced version 2 while version 1 remained available and downloadable. |
| Restricted Project Material | A contributor was denied before a grant, then read/downloaded after a live grant and Assignment were present. |
| Revocation | Revoking the grant denied both fresh reads and redemption of a token issued before revocation. |
| Assignment Material | The active Request assignee could list and download it; an unrelated authenticated actor received the same not-found boundary. |
| Unsafe content | The EICAR test fixture reached `REJECTED` with `MATERIAL_SCAN_INFECTED` and could not mint a download token. |
| Deletion and purge | Deletion immediately denied access and old-token redemption; the owner listing retained only non-content metadata and all versions reported `purgedAt`. |

The reproducible runner is
[`scripts/run-sprint4-materials-runtime-demo.mjs`](../../scripts/run-sprint4-materials-runtime-demo.mjs).
Run it against the local Docker stack with:

```bash
DATABASE_URL='postgresql://sharek:sharek@localhost:5432/sharek?schema=public' \
SHAREK_DEMO_PASSWORD='Admin@1234' \
npm run test:release-gate:s4-materials
```

The successful run recorded 26 sanitized entries and returned
`{"result":"PASS"}`. The runner uses the deterministic scanner stub for the
safe local gate; production malware-scanner availability remains an operational
deployment concern.

## Sprint Scope Decision

TASK-4-10, the safe Materials upload/access foundation, is verified and can be
closed for Sprint 4. This evidence does **not** claim TASK-4-11: document
extraction, embeddings, retrieval, or AI Draft Suggestions are not implemented
in the current backend. That analysis slice remains deferred as one intact
follow-up under the existing consent, entitlement, and purpose-isolation
contract.
