# ShareK Team Execution Manifest

**Status:** Audit-derived execution handoff

**Observed:** 2026-07-17

**Repository snapshot:** `4af57faa88e8a5a89dc4aed0dda7e99cb8a55070`

**Authority:** Supporting material only; requirements and sequencing remain owned
by the canonical documents.

This manifest translates verified repository gaps into assignable work. It does
not create GitHub Issues, approve open decisions, or claim team capacity. Role
placeholders are used because DX-001 remains open.

## 1. Reproducible commands

Run commands from the repository root unless the command changes directory.
Do not run both package managers in one workspace.

### Installation

```bash
cd frontend && pnpm install --frozen-lockfile
cd backend && npm ci
```

There is no root install command because no root package manifest exists. There
is no AI-service install command because no FastAPI/Python source or manifest is
present in this workspace (`CANNOT_VERIFY`).

### Frontend gates

Current repository state:

```bash
cd frontend && pnpm test
```

That command is exact but intentionally fails with `Error: no test specified`.
No current frontend lint, type-check, or build script exists, and no `tsconfig.json`,
lint config, or test-runner config is present. Therefore the current commands are:

| Gate | Current exact command | Current result |
|---|---|---|
| Lint | None | `NOT_AVAILABLE` |
| Type-check | None | `NOT_AVAILABLE` |
| Test | `cd frontend && pnpm test` | Placeholder failure |
| Build | None | `NOT_AVAILABLE` |

The frontend-foundation issue must add these stable scripts, after which CI and
developers use exactly:

```bash
cd frontend && pnpm lint
cd frontend && pnpm typecheck
cd frontend && pnpm test
cd frontend && pnpm build
```

### Backend gates

```bash
cd backend && npm run lint
cd backend && npx tsc --noEmit
cd backend && npm test -- --runInBand
cd backend && npm run check:architecture
cd backend && npm run build
cd backend && npx prisma validate
```

`npm run check:architecture` was executed during the audit and failed because
`backend/scripts/check-architecture.mjs` requires retired backend-local
documentation paths and the former module tracker. Backend dependencies were not
installed during this read-only audit, so the other gates were inspected but not
executed.

### AI-service gates

No exact lint or test command can be truthfully provided. The workspace contains
no `pyproject.toml`, requirements file, Python lockfile, FastAPI source, or AI test
directory. Record both gates as:

```text
AI lint: CANNOT_VERIFY — service repository/manifest missing
AI test: CANNOT_VERIFY — service repository/manifest missing
```

Once the authoritative repository is located, its own pinned manifest must supply
the commands; do not invent `ruff`, `pytest`, `uv`, or Poetry usage here.

## 2. Current CI gaps

1. `.github/workflows/backend-ci.yml` runs `npm ci` from the monorepo root, where
   no `package.json` exists; all following backend steps are consequently unreachable.
2. The workflow does not set `working-directory: backend` or use the backend lockfile explicitly.
3. Backend CI omits `npx tsc --noEmit` and `npx prisma validate`.
4. The architecture checker is independently broken by obsolete path assertions.
5. No frontend install, lint, type-check, test, or build job exists.
6. No AI-service checkout/install/lint/test/contract job exists.
7. No PostgreSQL or Redis service exercises migrations, Prisma integration, queue retries, or concurrency constraints.
8. No API contract, complete-loop E2E, accessibility, dependency audit, secret scan, container build, or Compose smoke test exists.
9. No branch-protection evidence was available, so required-check enforcement is `CANNOT_VERIFY`.

## 3. Recommended delivery sequence

| Order | Vertical slice | Outcome | Primary dependencies |
|---|---|---|---|
| 1 | Foundation and least-privilege identity | One account authenticates safely, GitHub public evidence is least-privilege, the public profile is logged-out accessible, and CI is trustworthy. | FastAPI repository location; role-migration compatibility; cookie/CSRF coordination |
| 2 | Project and task publication | An authorized owner publishes a repository-free or permission-verified repository-backed project and one task. | Slice 1 contextual identity; SEC-001 permission checks |
| 3 | Application and owner decision | Every valid application reaches the owner; accept/reject creates at most one primary assignment and correct scoped access. | Slice 2 project/task states; assignment migration |
| 4 | Individual delivery evidence and owner review | The assigned contributor submits versioned attributable evidence and the owner approves, rejects, or requests changes without rewriting GitHub facts. | Slice 3 assignment; OQ-001 for files; closed-without-merge decision |

AI skill inference security remediation runs inside Slice 1. Full AI inference
completion can continue in parallel with Slices 2–4. Advisory application fit
starts only after the Slice 3 application contract exists and cannot block it.

## 4. Parent issue — Slice 1

### `[PARENT] Foundation, contextual identity, least-privilege GitHub, and public profile`

**Requirement/decision IDs:** SEC-002, SEC-001, API-001, AD-001, AI-001,
Product Spec §4.1 and §6, Delivery Plan Slice 1.

**Outcome:** A single account can authenticate without a permanent owner/contributor
type, email verification protects sensitive actions, GitHub inference uses public
least-privilege evidence, a logged-out viewer can open the versioned public profile,
and every workspace has a meaningful CI gate.

**Parent acceptance criteria:**

- Registration and social login no longer assign owner/contributor account identity; existing users and sessions migrate safely and admin access is preserved.
- Publishing/applying/private-workspace authorization derives from verification and scoped relationships, with terminal applications granting no access.
- New GitHub consent does not request `repo`; private repositories cannot be selected, snapshotted, sent to AI, or publicly projected.
- Existing broad tokens and stored private snapshots have an approved revoke/reauthorize/remediation path with audit evidence.
- `GET /api/v1/profiles/:username` is logged-out accessible and privacy-safe, while authenticated self-management remains separate.
- Frontend and backend install/lint/type-check/test/build gates run in CI; architecture and Prisma checks pass.
- The bounded FastAPI repository and pinned contract are identified, or the parent remains blocked rather than claiming AI verification.

The parent is a coordination container, not an `L` assignment. Assign the following
sub-issues separately.

### FND-01 — Repair monorepo CI and architecture checks

- **Size:** `S` — up to one day
- **Owner:** DevOps A with Backend A review
- **Dependencies:** None; first merge target
- **Parallelization:** Can run immediately in parallel with FND-07. Other issues may develop in parallel but should rebase onto its gates before merge.
- **Expected files touched:** `.github/workflows/backend-ci.yml`, `backend/scripts/check-architecture.mjs`, `backend/package.json`; frontend/AI jobs are added only when their commands exist.
- **Acceptance criteria:** Backend CI uses `backend/`; npm install is lockfile-clean; architecture rules target current monorepo docs without restoring retired trackers; lint, no-emit type-check, tests, build, and Prisma validation are required; a frontend job is ready to consume FND-06 scripts.
- **Required tests:** Architecture-check fixture/regression cases for thin controllers, forbidden layer folders, and cross-module private imports; workflow syntax validation; clean-install CI run.

### FND-02 — Migrate fixed account roles to contextual capabilities

- **Size:** `M` — one to two days
- **Owner:** Backend A
- **Dependencies:** FND-01 gates; canonical SEC-002/ADR-015 behavior
- **Parallelization:** Can run alongside FND-04 and FND-05. It blocks final FND-03 authorization integration and FND-06 authenticated navigation.
- **Expected files touched:** `backend/prisma/schema.prisma`, a new `backend/prisma/migrations/<timestamp>_contextual_capabilities/migration.sql`, identity registration/auth DTOs and mappers, shared auth guards/decorators, project/profile role reads, focused specs.
- **Acceptance criteria:** Registration accepts no product role; admin remains the only account privilege; existing owner/contributor rows receive a documented non-privileged compatibility state; APIs stop exposing a misleading role; no destructive migration edits applied history.
- **Required tests:** Migration deploy against representative owner/contributor/admin rows; registration/social-login DTO tests; admin preservation; existing-session compatibility; forbidden escalation; one user can own A and contribute to B once scoped records exist.

### FND-03 — Separate email verification from lifecycle and secure refresh transport

- **Size:** `M` — one to two days
- **Owner:** Backend B with Frontend A coordination
- **Dependencies:** FND-02 persistence/API shape; explicit cookie/CSRF compatibility decision before transport cutover
- **Parallelization:** Backend tests and cookie design can start beside FND-02, but final integration must follow it and land atomically with the FND-06 client change.
- **Expected files touched:** identity session/verification services and DTOs, session controller, access guard, environment/CORS configuration, frontend auth client/state, backend and frontend auth tests.
- **Acceptance criteria:** Email verification independently gates publish/apply/private workspace actions; public browsing remains available; refresh rotation/revocation survives the transport change; cookie attributes and CSRF behavior are explicit; no refresh token enters frontend persistent storage.
- **Required tests:** Verified/unverified/suspended/deactivated matrices; refresh rotation, replay, expiry, logout, cookie flags, CSRF case, CORS credentials, social verified-email and missing-email flows.

### FND-04 — Enforce least-privilege public GitHub evidence

- **Size:** `M` — one to two days
- **Owner:** Backend B with AI A security review
- **Dependencies:** FastAPI data contract from FND-07 for end-to-end verification; remediation policy approval for already persisted private snapshots
- **Parallelization:** Can run alongside FND-02 and FND-05. Token/data cleanup must finish before AI generation is re-enabled for affected users.
- **Expected files touched:** GitHub OAuth/service/client/evidence code and DTOs, skill-profile evidence collector, Prisma scope/consent metadata plus a new migration if required, OAuth/evidence/AI contract tests.
- **Acceptance criteria:** New connection requests only approved minimal scopes; server-side filters reject private repositories even for old broad tokens; AI payloads contain public evidence only; granted scope and sync freshness are auditable; broad tokens are revoked/reauthorized and impermissible snapshots handled under policy.
- **Required tests:** OAuth URL scope, old-token private repo filtering, explicit private selection rejection, public evidence success, deleted/inaccessible repository fallback, public projection non-leak, token encryption/rotation regression.

### FND-05 — Add privacy-safe versioned public profile API

- **Size:** `S` — up to one day
- **Owner:** Backend A
- **Dependencies:** API-001; compatibility choice documented in the issue; can initially project only evidence currently safe to publish
- **Parallelization:** Can run with FND-02/FND-04. FND-06 consumes its target contract.
- **Expected files touched:** contributor-profile controller/service/DTO/presenter/validators, application bootstrap prefix/version handling if needed, E2E/contract tests, active API examples.
- **Acceptance criteria:** Logged-out `GET /api/v1/profiles/:username` succeeds for visible profiles and excludes completion prompts/private data; hidden/unknown profiles return non-enumerating not-found behavior; self-management is authenticated separately; old route compatibility is deliberate and tested.
- **Required tests:** Guest success, malformed/unknown/hidden username, owner versus guest projection, no token required, no private evidence, response contract snapshot.

### FND-06 — Establish frontend gates, auth shell, and logged-out public profile

- **Size:** `M` — one to two days
- **Owner:** Frontend A
- **Dependencies:** FND-03 auth transport contract and FND-05 profile response; FND-01 CI job interface
- **Parallelization:** Tooling and guest UI can begin immediately; authenticated integration waits for FND-03/FND-05.
- **Expected files touched:** `frontend/package.json`, new TypeScript/lint/Vitest configs, router/root routes, auth API/state modules, public profile route/components, route/component tests.
- **Acceptance criteria:** The counter starter is removed; `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exist and pass; direct logged-out profile navigation works; loading/empty/error states and trust-label placeholders are accessible; tokens are never persisted in local/session storage.
- **Required tests:** Route loader guest success/404/error, keyboard and semantic rendering, private-field absence, auth refresh boundary, build/type generation, responsive smoke test.

### FND-07 — Locate and baseline the bounded FastAPI service

- **Size:** `XS` — less than half a day
- **Owner:** AI A
- **Dependencies:** Repository access from the team; no code dependency
- **Parallelization:** Immediate and independent; blocks truthful completion of FND-04 and the AI portion of the parent.
- **Expected files touched:** None in this monorepo unless an approved CI contract reference is later added; the external AI repository manifest/workflow may change in its own issue.
- **Acceptance criteria:** Record repository URL, pinned revision, owners, install/lint/test commands, `/skill-profiles/generate` schema/auth behavior, retention/redaction policy, and application-fit status. If unavailable, mark the parent dependency blocked.
- **Required tests:** Run the external repository’s native lint/test suite and one authenticated NestJS contract fixture; do not substitute a mock for repository verification.

## 5. Next three slices

### Slice 2 — Project and task publication

Split into `M` or smaller issues for repository-free project CRUD/publish,
GitHub permission verification/connection snapshots, task CRUD/public discovery,
and the one-primary-assignment database constraint. Backend project/task work can
run in parallel with frontend discovery/detail screens after DTOs are frozen.
Required evidence includes unauthorized repository-link rejection, successful
repository-free publication, connect-later history preservation, owner-only
mutation, public discovery, and migration concurrency tests.

Expected areas: `backend/src/modules/projects/`,
`backend/src/modules/contribution-tasks/`, Prisma schema/new migrations, GitHub
permission client, frontend project/task routes, and contract/integration tests.

### Slice 3 — Application and owner decision

Split into application create/withdraw, owner list/accept/reject, assignment and
active-status capability derivation, notifications/audit, and frontend applicant/
owner flows. Application persistence and assignment uniqueness precede owner UI;
notification consumers and frontend forms can then run in parallel. AI fit is not
a dependency for accepting the application.

Required evidence includes every valid application reaching the owner, duplicate
application/conflict handling, one active primary assignment under concurrency,
terminal statuses granting no access, verified-email gating, object-level owner
authorization, and notification idempotency.

### Slice 4 — Individual delivery evidence and owner review

Split into submission/version persistence, typed evidence/attribution, GitHub
validation snapshots, owner verdict/resubmission, audit history, and frontend
submission/review screens. URL/metadata evidence may proceed while images/files
remain explicitly blocked by OQ-001. Closed-without-merge behavior remains blocked
until its decision is approved.

Required evidence includes shared-PR contributor attribution, preserved prior
versions, changes-requested resubmission, repository-free evidence, authoritative
GitHub merge/close facts, visibly separate owner attestation, owner-only verdicts,
and accepted-outcome audit history.

## 6. Assignment and sizing rules

- `XS`: less than half a day.
- `S`: up to one day.
- `M`: one to two days.
- `L`: never assign; split it before scheduling.
- Role placeholders are not confirmed people or capacity. DX-001 must record actual developers, availability, and ownership before dates are promised.
- FND-01 and FND-07 start immediately in parallel. FND-02, FND-04, and FND-05 form the next parallel wave. FND-03 and authenticated FND-06 integration follow their contracts.
- Every issue identifies its canonical IDs, authorization impact, migration/API compatibility, tests, and gap-report evidence update before closure.
- Open decisions remain dependencies. Individual issue authors must not invent file storage, retention, fraud thresholds, AI quality thresholds, or closed-without-merge policy.
