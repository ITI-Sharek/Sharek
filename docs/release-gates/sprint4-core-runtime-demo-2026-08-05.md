# Sprint 4 Core Runtime Demo — 2026-08-05

## Result

**PASS.** A real NestJS process on `http://127.0.0.1:4000`, PostgreSQL 16
with pgvector on `127.0.0.1:5432`, and Redis on `127.0.0.1:6379` completed the
sequential Sprint 4 core workflow. The database began from a clean container;
all 30 committed migrations deployed before the demo. Queues were disabled so
the run exercised synchronous HTTP behavior without background-worker races.

The run used the seeded actor identifiers `owner@sharek.local` and
`contributor@sharek.local`. Credentials, bearer tokens, database identifiers,
idempotency keys, and raw UUIDs are intentionally absent from this evidence.
Logical aliases below identify records created during the run.

Reviewed cross-repository revisions:

- Backend: B11 PR #69 working revision containing this evidence.
- Frontend: `fa870f79878a742fc3c25c691dbd078a11cd90a8` on `master`.
- AI: `1fa196a13aeb6cc5477e48017b7d15a7b6aa46c1` on `main`.

## Sanitized HTTP Transcript

| Step | HTTP | Verified result |
| --- | ---: | --- |
| Owner login | 201 | Authenticated; credentials and token redacted |
| Contributor login | 201 | Authenticated; credentials and token redacted |
| Create `request-accept` draft | 201 | `status=draft` |
| Publish `request-accept` | 200 | `status=published` |
| Discover `request-accept` publicly | 200 | Published request is public |
| Submit `application-accept` | 201 | Immediate `PENDING_OWNER_REVIEW` |
| Owner lists `application-accept` | 200 | Application present immediately |
| Request optional Advisory Fit | 202 | `NOT_STARTED_NO_ASSESSABLE_EVIDENCE`; non-blocking |
| Read Advisory Fit | 200 | Terminal no-evidence state persisted |
| Accept `application-accept` | 200 | `ACCEPTED` despite optional no-evidence assessment |
| Create and publish `request-decline` | 201 / 200 | Draft then published |
| Submit `application-decline` | 201 | Immediate `PENDING_OWNER_REVIEW` |
| Decline `application-decline` | 200 | `DECLINED_BY_OWNER` without requesting Advisory Fit |
| Submit `proposal-1` | 201 | `PENDING`, immutable version 1 |
| Owner requests revision | 201 | Append-only revision requested |
| Contributor submits version 2 | 201 | `currentVersion=2` |
| Owner accepts `proposal-1` | 200 | `ACCEPTED`; resulting `attributed-request` is `DRAFT` |
| Owner completes `attributed-request` contract | 200 | Owner-controlled draft remains `draft` |
| Publish `attributed-request` | 200 | `status=published` |
| Read `attributed-request` publicly | 200 | Attribution present; no Assignment or selection priority |

The reproducible runner is
`scripts/run-sprint4-core-runtime-demo.mjs`. Its successful output contained
`result=PASS` and 22 sanitized entries, including fixture setup and both login
entries. It fails immediately on any unexpected HTTP status or contract state.

## Cleanup

The runner is idempotent. It removes the fixture Project and everything the run
created — contribution requests, applications, owner decisions, the assignment,
the assessment request, proposals and their versions, the append-only audit rows
and the emitted notifications — from a `finally` block, so teardown also runs
when the sequence fails partway. Seeded users, auth sessions and any
pre-existing data are out of scope by construction: every delete is keyed off
the fixture Project.

Pass `--keep-data` (or set `SHAREK_DEMO_KEEP_DATA=1`) to preserve the fixture
for inspection after a failed run. Preserved runs still count toward the
proposer's daily submission limit, so they accumulate.

## Runtime Defect Found And Closed

The first real Proposal submission exposed a Prisma `P2010`: PostgreSQL
`pg_advisory_xact_lock` returns `void`, which Prisma cannot deserialize from
`$queryRaw`. The lock result is now cast to `text`, preserving the transaction
lock while returning a supported scalar. The focused Proposal service suite
passes 26/26 and asserts that the advisory-lock query keeps the supported cast.
The complete HTTP sequence above passed after that correction.

## Evidence Boundary

This proves the local real-process workflow and persistence transitions at the
reviewed code revisions. It does not claim live external AI-provider
availability: the no-evidence Advisory Fit path intentionally terminates before
a provider call, and the owner decision remains human and non-gated.
