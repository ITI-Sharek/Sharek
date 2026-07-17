# ShareK Team Execution Manifest

**Status:** Audit-derived execution handoff

**Observed:** 2026-07-17

**Repository snapshot:** `fd290a030756e510b82b5d87984b272bc9f128ef`

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
pnpm --dir frontend install --frozen-lockfile
pnpm --dir backend install --frozen-lockfile
```

There is no root install command because no root package manifest exists. There
is no AI-service install command because no FastAPI/Python source or manifest is
present in this workspace (`CANNOT_VERIFY`). Neither install was run in this
stage. The frontend lockfile must first be repaired because it contains two
concatenated YAML documents. pnpm is the human-confirmed package manager for all
JavaScript projects; the backend npm lockfile and npm-based Docker/CI commands
are migration residue and must be retired deliberately. After the root workspace
exists, the authoritative install becomes `pnpm install --frozen-lockfile` from
the repository root with one root lockfile.

### Frontend gates

Current repository state:

```bash
pnpm --dir frontend test
```

That command is exact but intentionally fails with `Error: no test specified`.
No current frontend lint, type-check, or build script exists, and no `tsconfig.json`,
lint config, or test-runner config is present. Therefore the current commands are:

| Gate | Current exact command | Current result |
|---|---|---|
| Lint | None | `NOT_AVAILABLE` |
| Type-check | None | `NOT_AVAILABLE` |
| Test | `pnpm --dir frontend test` | Placeholder failure |
| Build | None | `NOT_AVAILABLE` |

The frontend-foundation issue must add these stable scripts, after which CI and
developers use exactly:

```bash
pnpm --filter ./frontend lint
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
pnpm --filter ./frontend build
```

### Backend gates

```bash
pnpm --filter ./backend lint
pnpm --filter ./backend exec tsc --noEmit
pnpm --filter ./backend test -- --runInBand --testPathPattern=src
pnpm --filter ./backend test -- --runInBand --testPathPattern=test
pnpm --filter ./backend check:architecture
pnpm --filter ./backend build
pnpm --filter ./backend exec prisma validate
```

The first test command is the current unit boundary (`src/**/*spec.ts`); the
second is the current integration/E2E boundary (`test/**/*spec.ts`). The package
manifest does not provide named unit or integration scripts. These are the
approved target pnpm workspace commands; they are not runnable until the root
workspace exists. The results below were observed by invoking the same package
scripts through the repository's current npm-oriented backend setup.

| Gate | Result at this snapshot |
|---|---|
| Lint | `FAIL` — `eslint` is not installed locally |
| Type-check | `NOT_RUN` — backend dependencies and the root workspace are absent |
| Unit | `FAIL` — `jest` is not installed locally |
| Integration/E2E | `FAIL` — `jest` is not installed locally |
| Architecture | `FAIL` — 38 obsolete path/tracker assertions |
| Prisma validation | `NOT_RUN` — backend dependencies and the root workspace are absent |
| Build | `FAIL` — 235 TypeScript errors, primarily missing dependencies/generated Prisma client |

No backend gate succeeded. These results do not distinguish dependency setup
failure from latent source/test failures; rerun every gate after an approved
frozen install.

### AI-service gates

No exact lint, type-check, or test command can be truthfully provided. The workspace contains
no `pyproject.toml`, requirements file, Python lockfile, FastAPI source, or AI test
directory. Record all three gates as:

```text
AI lint: CANNOT_VERIFY — service repository/manifest missing
AI type-check: CANNOT_VERIFY — service repository/manifest missing
AI test: CANNOT_VERIFY — service repository/manifest missing
```

Once the authoritative repository is located, its own pinned manifest must supply
the commands; do not invent `ruff`, `pytest`, `uv`, or Poetry usage here.

## 2. Current CI gaps

1. `.github/workflows/backend-ci.yml` runs `npm ci` from the monorepo root, where
   no `package.json` exists; all following backend steps are consequently unreachable.
2. Push CI targets `main`, while the verified default branch is `master`.
3. The workflow does not set `working-directory: backend` or use the backend lockfile explicitly.
4. Backend CI omits `npx tsc --noEmit` and `npx prisma validate`.
5. The architecture checker is independently broken by obsolete path assertions.
6. No frontend install, lint, type-check, test, or build job exists.
7. No AI-service checkout/install/lint/type-check/test/contract job exists.
8. No PostgreSQL or Redis service exercises migrations, Prisma integration, queue retries, or concurrency constraints.
9. No API contract, complete-loop E2E, accessibility, dependency audit, secret scan, container build, or Compose smoke test exists.
10. No branch-protection evidence was available, so required-check enforcement is `CANNOT_VERIFY`.

## 3. Recommended delivery sequence

| Order | Vertical slice | Outcome | Primary dependencies |
|---|---|---|---|
| 1 | S0 Workflow and CI | Frozen installs and truthful frontend/backend/AI job outcomes feed one stable `ci-gate`; no product behavior changes. | Lockfile authority; FastAPI repository availability |
| 2 | S1 Auth and Public Profile | One account authenticates safely with contextual capability semantics and a logged-out profile contract. | S0 gates; role-migration compatibility; cookie/CSRF coordination |
| 3 | S2 GitHub and AI Skill Inference | GitHub public evidence is least-privilege and AI inference is auditable, disputable, and externally verifiable. | S0 gates; FastAPI repository; private-snapshot remediation policy |
| 4 | S3 Project Publishing | An authorized owner publishes a repository-free or permission-verified repository-backed project and one task. | S1 identity; SEC-001 permission checks |

S0 is the smallest safe first slice because every product slice otherwise lands
behind a broken or nonexistent gate. S1 identity/public-profile and S2 GitHub/AI
can proceed in parallel after S0, with shared auth/profile contracts coordinated.
Advisory application fit starts only after the application contract exists and
cannot block it.

## 4. Proposed task boundaries for S0–S2

The boundaries below map to the Project taxonomy as follows: FND-01 is S0;
FND-02, FND-03, FND-05, and FND-06 are S1; FND-04 and FND-07 are S2. The
coordination parent spans these foundation slices and is not itself assignable.

### Coordination parent — foundation, contextual identity, GitHub, and public profile

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

## 6. Assignment, collision, and sizing rules

Recommended assignee profiles:

- **S0 / FND-01:** DevOps-oriented engineer experienced with GitHub Actions,
  npm/pnpm reproducibility, NestJS/Prisma gates, and failure aggregation.
- **S1 backend:** NestJS/Prisma security engineer comfortable with auth-session
  compatibility, forward migrations, object authorization, and contract tests.
- **S1 frontend:** React/TanStack engineer experienced with accessible routing,
  auth transport, API-state boundaries, and Vitest-style component/route tests.
- **S2 GitHub:** Backend integration engineer experienced with OAuth scopes,
  token lifecycle, privacy containment, and GitHub API test doubles.
- **S2 AI:** Python/FastAPI engineer who can verify model contracts, evidence
  provenance, redaction, evaluation fixtures, and non-authoritative fallback.

File-collision risks:

- Only one owner at a time should change root/workspace CI, package manifests,
  or lockfiles; `.github/workflows/backend-ci.yml` must be replaced rather than
  left running beside an equivalent `ci.yml`.
- FND-02 and FND-03 both touch identity DTOs, session/auth services, guards, and
  Prisma; land the role/schema contract before final refresh/email integration.
- FND-03 and FND-06 share the auth transport contract and must coordinate the
  cookie/CORS/CSRF cutover.
- FND-04 and FND-07 share the NestJS–FastAPI evidence contract; freeze fixtures
  before parallel client/service implementation.
- FND-02, FND-04, and later project work may all require Prisma migrations;
  serialize schema integration and never edit applied migration files.

Unresolved blockers:

- DX-001 team capacity and named ownership are still open.
- The bounded FastAPI repository, pinned revision, and native commands are absent.
- Private GitHub token/snapshot remediation and retention policy are unapproved.
- Cookie/CSRF compatibility and cutover behavior require an explicit issue-level decision.
- OQ-001 blocks implementation of file/image evidence transport.
- The deployed Prisma migration state and branch-protection rules cannot be verified locally.
- Frontend lockfile repair and backend package-manager authority must precede trustworthy frozen installs.

### Human follow-up and recommended defaults

Human-provided direction on 2026-07-17:

- The target monorepo contains sibling `frontend/`, `backend/`, and `ai/`
  workspaces. The current external FastAPI repository will be moved under `ai/`.
- JavaScript commands should be invoked from the repository root through the
  pnpm workspace. The user's original `--workspace` wording maps to pnpm's
  `--filter` option instead of shell directory changes.

Repository consequences and recommended defaults:

1. Add a root `pnpm-workspace.yaml` covering `frontend`, `backend`, and the
   JavaScript package boundary if one later exists under `ai`; consolidate to one
   root `pnpm-lock.yaml`, remove the nested backend workspace file, and retire
   npm lock/install usage. Use commands such as `pnpm --filter ./frontend lint`
   and `pnpm --filter ./backend lint`. Python under `ai/` remains independently
   pinned and is invoked through its native tool after its real manifest is
   present. This is prerequisite workspace work, not authorized by the current
   CI-only file scope.
2. For existing broad GitHub authorizations, block private evidence ingestion,
   inventory affected accounts/snapshots, revoke broad OAuth tokens, reauthorize
   with the approved least privilege, and remove impermissible stored snapshots
   through an auditable retention action. Do not silently delete audit facts.
3. For refresh transport, keep access tokens in memory and use a rotated
   `HttpOnly`, `Secure`, host-only refresh cookie with explicit `SameSite` and
   path policy. Require a cookie-to-header CSRF token plus Origin/Fetch-Metadata
   validation for unsafe methods; `SameSite` alone is defense in depth.
4. For Prisma, validate the schema and deploy all migrations against a disposable
   PostgreSQL database in CI, then inspect an authorized deployed migration table
   before creating any forward corrective migration. Never edit applied SQL.
5. For external evidence files, default to private S3-compatible object storage,
   presigned uploads, allowlisted size/type limits, quarantine plus malware scan,
   authenticated downloads, audit metadata, and explicit retention/deletion.
   Until OQ-001 is approved, implement only metadata/URL paths and keep file
   acceptance blocked.
6. After `ci-gate` has run successfully at least once, protect `master` by
   requiring pull requests, one cross-owner approval, resolved conversations,
   dismissal of stale approvals, and the `ci-gate` status check. Keep force push
   and deletion disabled; do not configure a required check before GitHub has
   observed that check name.
7. DX-001 cannot be inferred. Human names, weekly availability, and ownership
   constraints remain required before scheduling or assigning work.

References for these operational recommendations: pnpm workspace documentation,
GitHub OAuth revocation and protected-branch documentation, and the OWASP CSRF
Prevention Cheat Sheet. They remain supporting recommendations and do not amend
canonical product decisions.

- `XS`: less than half a day.
- `S`: up to one day.
- `M`: one to two days.
- `L`: normally split before assignment.
- `XL`: always split before assignment.
- Role placeholders are not confirmed people or capacity. DX-001 must record actual developers, availability, and ownership before dates are promised.
- FND-01 and FND-07 start immediately in parallel. FND-02, FND-04, and FND-05 form the next parallel wave. FND-03 and authenticated FND-06 integration follow their contracts.
- Every issue identifies its canonical IDs, authorization impact, migration/API compatibility, tests, and gap-report evidence update before closure.
- Open decisions remain dependencies. Individual issue authors must not invent file storage, retention, fraud thresholds, AI quality thresholds, or closed-without-merge policy.
