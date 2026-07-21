# Validation Quickstart: GitHub Project Draft and Publication

Use this guide after SK-107 and SK-112 implementation. It validates the approved
workflow; it does not contain implementation code or frontend steps.

## Prerequisites

- Node.js 22 and repository dependencies installed
- Active branch `feature/sk-112-github-project-publication`; stop if the branch
  is `main` and do not switch branches automatically
- Docker Compose services for PostgreSQL 16/pgvector and Redis
- `.env`/`.env.local` based on `.env.example`
- SK-107 GitHub App configuration available for private and
  organization/shared scenarios
- Two active ordinary users (one OWNER, one CONTRIBUTOR), one active Admin, and
  a second non-owner user
- Test repositories covering public personal, public organization/shared, and
  explicitly selected private visibility

Do not use broad `repo` or `public_repo` OAuth as the SK-107 acceptance fixture.
Provider secrets and private repository material must not appear in fixtures,
snapshots, logs, or committed files.

## Start and Validate the Stack

```bash
git branch --show-current
npm ci
docker compose up -d postgres redis
npx prisma validate
npx prisma migrate status
npm run build
```

Expected: the first command reports the feature branch, schema validates, all
forward migrations are applied, and the backend builds without accessing
GitHub. Startup validation accepts the documented defaults for
`GITHUB_API_URL`, `GITHUB_API_OVERALL_TIMEOUT_MS=8000`, and
`GITHUB_API_REQUEST_TIMEOUT_MS=4000`; it rejects malformed/insecure production
URLs, an overall value above 8000, and a per-call value above the overall value.

## Focused Automated Verification

Run the implemented focused suites first (paths are the planned targets and may
be adjusted by `tasks.md` only when repository structure proves a better exact
location):

```bash
npm test -- --runInBand src/modules/projects
npm test -- --runInBand src/modules/github
npm test -- --runInBand src/shared/config/env.validation.spec.ts
npm test -- --runInBand src/modules/contribution-tasks
npm test -- --runInBand src/modules/applications
npm test -- --runInBand src/modules/identity
npm test -- --runInBand test/github-project-publication.e2e-spec.ts
npm test -- --runInBand test/project-public-visibility.e2e-spec.ts
```

Run PostgreSQL-backed integration/migration coverage separately; the existing
in-memory GitHub onboarding E2E cannot prove transactions, partial indexes, or
publication races.

Expected focused proof:

- preview performs no Project/source/snapshot/audit/receipt write;
- the GitHub client uses the injected base URL and aborts every required and
  optional provider call within the configured per-call and eight-second
  overall ceilings;
- OWNER and CONTRIBUTOR can create a draft; pending, suspended, deactivated,
  and ordinary Admin actors cannot;
- ownership comes from the authenticated actor and non-owner access is a safe
  404;
- same creation key produces one draft while different keys can intentionally
  produce multiple drafts for the same source;
- edits cannot change source identity and explicit null/empty values are tracked
  as manual overrides;
- successful, partial, failed, timed-out, rate-limited, and revoked refreshes
  preserve manual values and the last valid snapshot;
- stale revisions lose deterministically without a partial write;
- personal public control uses numeric GitHub IDs; organization/shared and
  private control use current App authorization plus explicit selection;
- simultaneous publication creates one published Project and one winning audit;
  the losing Project remains a valid draft;
- retrying publish does not duplicate transition/audit/downstream intent;
- only `draft -> published -> archived` succeeds;
- public list/detail/count behavior excludes draft and archived Projects and
  redacts all private source evidence;
- Projects obtains contribution-task, application, and Admin owner summaries
  only through the exported typed readers and has no direct-table fallback;
- `/projects/me` always reaches the authenticated owner route, while public
  reads exist only at `/public/projects`.

## Migration Validation

Use a disposable PostgreSQL database with fixtures representing:

- legacy draft and published Projects;
- an archived Project;
- repository IDs present and absent;
- renamed URLs sharing a provider repository ID;
- owner values that may have originated from source or manual review.

Validate the expand/backfill/diagnostic migration first, perform the separate
reconciliation operation, then validate the constraints migration. Neither
migration may call GitHub or any network service.

Validate:

1. Migration performs no network request.
2. Row counts, owners, status, `published_at`, and owner presentation survive.
3. Existing owner presentation is conservatively marked manual.
4. Legacy snapshots/source-state and migration audit records are present.
5. The old global URL uniqueness constraint is gone.
6. Multiple draft rows may reference one source.
7. Numeric-ID and normalized-URL aliases map to one canonical source; a URL
   fallback cannot become a second public claim for the same numeric repository.
8. The publication-readiness query blocks every new publication while any
   published legacy source is unresolved or conflicting, without changing the
   attempted draft.
9. The partial unique index rejects a second published row for one source after
   readiness succeeds.
10. Dirty published collisions stop with diagnostics or use the approved
   rollback-forward repair; no row is silently archived/deleted.
11. Legacy columns remain available for the planned verified cutover.

See `data-model.md` for exact invariants.

## Contract Scenario Sequence

Use the request/response definitions in `contracts/http-api.md`.

### A. Public preview and draft

1. Preview an allowed public personal repository as OWNER.
2. Confirm database counts are unchanged.
3. Create with the returned fingerprint and an idempotency key.
4. Confirm status `draft`, revision 1, owner derived from the token.
5. Replay with the same key and body; confirm the same response and one row.
6. Repeat with a new key; confirm an intentional second private draft is allowed.

### B. Contributor account mode

Repeat A as an active CONTRIBUTOR without changing role. Then attempt with a
pending contributor, suspended/deactivated user, and Admin. Confirm only the
active ordinary contributor succeeds.

### C. Review and refresh

1. Edit title/description/tags/technologies and record the new revision.
2. Attempt to edit repository ID/URL/visibility; confirm DTO rejection.
3. Change provider metadata in the GitHub fake and refresh.
4. Confirm source snapshot/freshness advances while manual fields remain.
5. Restore one field from source and confirm only that override clears.
6. Simulate optional failure; confirm partial state and retained-stale values.
7. Simulate timeout/rate limit/revocation; confirm the last snapshot and Project
   state/revision remain valid and internal provider details are absent.
8. Race an edit and refresh with the same expected revision; confirm one wins
   and the other receives `PROJECT_REVISION_CONFLICT`.
9. Advance an injected clock to one instant before and then exactly at 15
   minutes after the last required-data read; confirm fresh then stale.
10. Emit each typed SK-107 invalidation reason and confirm immediate stale state,
    stopped source use, idempotent duplicate handling, and no webhook/provider
    internals in Projects.

### D. Publication control

1. Public personal: link a GitHub identity whose numeric ID matches the current
   repository owner; publish succeeds after explicit confirmation.
2. Change only the GitHub login; numeric-ID match still succeeds.
3. Use a mismatched identity; Project remains draft with safe recovery guidance.
4. Public organization/shared: without App selection publication fails; active
   App plus explicit selection succeeds.
5. Private: preview/refresh/publish fails without App selection and succeeds with
   active scoped read access plus explicit selection.
6. Remove/suspend the installation or unselect the repository; later private
   evidence reads and publication checks fail safely without deleting owner data.

Private and organization/shared cases are blocked—not skipped or substituted
with broad OAuth—until SK-107's real installation, selection, revocation, and
contract-test capability is available.

### E. State, duplicate, and public privacy

1. Attempt publication before required title/category/difficulty/control; confirm
   422 and unchanged draft.
2. Publish a valid draft and confirm exactly one audit transition and unchanged
   behavior when indexing/AI is unavailable.
3. Concurrently publish two drafts for the same repository. Confirm one 200,
   one safe 409, one published row, and the loser still draft.
4. Query `/public/projects` list/detail for a draft, published row, and archived
   row. Confirm only the published row is returned, and confirm `/projects/me`
   still reaches the authenticated owner handler rather than a public detail
   handler.
5. For a private-backed published Project, confirm public source attribution is
   only `{provider, attributionStatus: withheld}` and no cached evidence leaks.
6. Archive the published Project; confirm it disappears publicly and cannot
   transition back to draft or republish.
7. Apply a known revocation/transfer/deletion/visibility invalidation to an
   already-published Project. Confirm it remains publicly listed with
   owner-controlled fields, its source is immediately reduced to the withheld
   attribution shape, and only explicit archive removes it.

## Full Quality Gates

```bash
npm run check:architecture
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npx prisma validate
npm run build
```

Expected: all commands pass. The final implementation review must also inspect
the SQL migration, public/owner DTO snapshots, provider-safe logs, module
READMEs, `docs/api-contracts.md`, `docs/database-plan.md`, `sharek-api.http`, and
the new tracker entry.

## Traceability Exit Check

Before implementation handoff, confirm test names or task evidence map to:

- SK-112 user stories 1-7 and FR-001-FR-023;
- SR-001-SR-010, DR-001-DR-007, PR-001-PR-006;
- VR-001-VR-005, IR-001-IR-009, TS-001-TS-005;
- SC-001-SC-010;
- SK-107 contract tests for App installation/selection and revocation.

Do not claim private or organization/shared completion with a mocked broad-OAuth
substitute or without PostgreSQL-backed concurrency proof.
