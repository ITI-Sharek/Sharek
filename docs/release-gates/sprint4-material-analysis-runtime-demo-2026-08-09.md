# Sprint 4 Material Analysis Runtime Verification — 2026-08-09

## Result

**PASS.** A real NestJS process, PostgreSQL 16 with pgvector, Redis, the
Materials scan worker, and the authenticated FastAPI AI service completed the
TASK-4-11 flow against a disposable Project fixture. The fixture was cleaned
after the run.

Credentials, bearer tokens, database identifiers, idempotency keys, raw UUIDs,
and embedding values are intentionally absent from this record.

## Sanitized HTTP Evidence

| Area | Verified result |
| --- | --- |
| Ready source | Owner upload was quarantined, reached `READY`, and remained owner-scoped. |
| Constraints | Server returned configurable document/character limits and supported analysis MIME types. |
| Run lifecycle | Explicit owner start returned a queue-backed `REQUESTED`/`RUNNING` lifecycle. |
| AI contract | Authenticated FastAPI analysis completed with strict provenance validation. |
| Persistence | Private Draft Suggestions and pgvector-backed analysis chunks were persisted. |
| Review | An owner explicitly rejected a suggestion; no business row changed automatically. |
| Adoption | An owner adopted a Project suggestion through the owning Project service with revision checking. |
| Source cleanup | Deleting the source removed vector chunks while retaining suggestion audit and marking source provenance removed. |

The reproducible runner is
[`scripts/run-sprint4-material-analysis-runtime-demo.mjs`](../../scripts/run-sprint4-material-analysis-runtime-demo.mjs).
Run it against the local Docker stack with:

```bash
DATABASE_URL='postgresql://sharek:sharek@localhost:5432/sharek?schema=public' \
SHAREK_DEMO_PASSWORD='Admin@1234' \
npm run test:release-gate:s4-material-analysis
```

The successful run returned `{"result":"PASS"}` with eight sanitized
analysis entries. The local AI provider was configured for OpenRouter and the
run exercised both draft generation and embedding persistence.

## Scope Decision

TASK-4-11 is implemented and runtime-verified as the owner-authorized,
version-fixed, entitlement-configurable, queue-backed, draft-only Materials
analysis path. Upload remains storage consent only. Project and Contribution
Request facts are still mutated only through their owning services after an
explicit owner adoption command.
