# ShareK Current Slice Issue Manifest

**Status:** Proposed for human approval
**Stage:** Stage 5 — First Vertical Slice Issue Manifest
**Observed:** 2026-07-17
**Repository baseline:** `318559259cf9989a165f9224761b296ff1824d40`
**Default branch:** `master`

This manifest proposes the first product backlog only. It does not create
GitHub Issues, mutate the GitHub Project, assign people, commit, or push.

## Authority and current-state basis

Canonical sources:

- `docs/product-spec.md`
- `docs/architecture.md`
- `docs/api-contracts.md`
- `docs/delivery-plan.md`
- `docs/decision-log.md`
- `docs/test-strategy.md`

Repository evidence:

- `docs/audits/codebase-gap-report.md`
- `docs/audits/team-execution-manifest.md`
- current code under `backend/`, `frontend/`, and `ai/`
- merged CI foundation on `master`

Historical notes:

- The Stage 2 audit was written before the pnpm workspace, CI foundation, and
  in-repository `ai/` folder were merged. Its stale command/setup blockers are
  not repeated as current blockers here.
- The next approved product priority after S0 CI is Slice 1 from
  `docs/delivery-plan.md`: foundation identity, least-privilege GitHub evidence,
  and public profile access.

## Milestone proposal

**Milestone:** `MVP S1 — Auth and Public Profile Foundation`

**Goal:** A user can authenticate safely without a permanent owner/contributor
account split, connect GitHub with least-privilege public-evidence boundaries,
and expose a privacy-safe logged-out public profile route.

**Completion evidence:**

- registration no longer requires a product role;
- `ADMIN` remains the only account-level privileged role;
- email verification is distinct from admin/profile trust and gates only
  sensitive actions;
- refresh-token transport is secure and coordinated with the frontend;
- new GitHub consent and evidence collection do not request or use private
  repository access for public inference;
- `GET /api/v1/profiles/:username` works without an access token and returns no
  private fields;
- frontend route, backend contract, migration, security, and CI checks pass.

## Parent issue proposal

**Title:** `[S1] Auth and Public Profile Foundation`

**Type:** Parent / coordination issue, not an implementation assignment

**User value:** A contributor can create one account, authenticate safely, and
share a public profile without ShareK exposing private GitHub data or forcing a
permanent owner/contributor identity.

**Outcome:** ShareK has a safe identity and public-profile foundation for the
task/application/evidence loop.

**Scope:**

- contextual capability groundwork;
- auth/session transport hardening;
- email-verification separation from profile/admin trust;
- least-privilege GitHub public-evidence containment;
- privacy-safe versioned public profile API;
- frontend auth shell and logged-out public profile route;
- integrated verification and demo proof.

**Non-goals:**

- project/task publishing;
- applications, assignments, delivery evidence, blind reviews, reputation events;
- automatic or strict AI application rejection;
- file upload/storage/scanning;
- production deployment;
- assigning human owners.

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P1 High`
- Size: `XL` for tracking only; must remain split into sub-issues before
  assignment
- Area: `Cross-cutting`
- Slice: `S1 Auth and Public Profile`
- Risk: `Security`

**Parent acceptance criteria:**

- All must-have sub-issues below are closed.
- No sub-issue exceeds two working days.
- No AI output owns a business transition.
- Every dependency and migration note is recorded on the closed sub-issues.
- The demo proof can be repeated from a clean checkout using documented commands.

## Ordered sub-issues

### S1-01 — Remove fixed product role from registration and preserve admin access

**Classification:** Must-have

**Primary owner placeholder:** Backend A

**Suggested Project fields:**

- Status: `Ready`
- Priority: `P0 Critical`
- Size: `M`
- Area: `Backend`
- Slice: `S1 Auth and Public Profile`
- Risk: `Data Migration`

**Requirement or decision IDs:** SEC-002, Product Spec §§2–4.1,
Architecture §§8, 11, 16, API Contracts §2.

**Dependencies:** None.

**Expected files or modules:**

- `backend/prisma/schema.prisma`
- new forward-only Prisma migration
- `backend/src/modules/identity/dto/register.request.ts`
- `backend/src/modules/identity/services/auth.service.ts`
- `backend/src/modules/identity/mappers/auth-user.mapper.ts`
- shared auth guards/decorators under `backend/src/shared/auth/`
- focused identity tests under `backend/src/modules/identity/` and `backend/test/`

**Current behavior:** Registration requires `owner | contributor`, persists it
on `User.role`, and several guards read that fixed account role.

**Expected behavior:** Registration accepts no product-role field. Existing
users migrate without losing account access. `ADMIN` remains the only
account-level privileged role. Owner/contributor/applicant capabilities are
derived later from scoped project/task/application/assignment relationships.

**Acceptance criteria:**

- Register request validation rejects or ignores submitted product-role values
  according to a documented compatibility choice.
- Login and `GET /auth/me` no longer present a misleading product role.
- Existing `admin` users keep admin capability after migration.
- Existing owner/contributor rows are mapped to a safe compatibility state
  without granting global owner or contributor authority.
- No historical migration is edited.
- Tests cover registration, social onboarding, admin preservation, and forbidden
  privilege escalation.

**Test commands:**

- `pnpm --filter ./backend lint`
- `pnpm --filter ./backend exec tsc --noEmit`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=src`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=test`
- `pnpm --filter ./backend exec prisma validate`
- `pnpm --filter ./backend build`

**Authorization implications:** Reduces accidental global authorization from
account role. Must preserve admin-only routes.

**Data or migration implications:** Requires a forward-safe migration and test
fixtures for existing owner/contributor/admin rows.

**API impact:** Breaking or compatibility-managed change to registration and
auth-user response shape.

**Frontend impact:** Frontend must stop asking the user to choose owner versus
contributor during account creation.

**Documentation impact:** Update operations/API examples in the implementation
PR if examples still show product-role registration.

**Demo proof:** Register a new account without role, verify email, log in, and
show the returned user has no fixed owner/contributor product role.

### S1-02 — Add contextual capability guardrail for sensitive actions

**Classification:** Must-have

**Primary owner placeholder:** Backend B

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P0 Critical`
- Size: `M`
- Area: `Backend`
- Slice: `S1 Auth and Public Profile`
- Risk: `Security`

**Requirement or decision IDs:** SEC-002, Product Spec §§3–4.1,
Architecture §§8, 10, 11, Test Strategy §3.

**Dependencies:** S1-01.

**Expected files or modules:**

- `backend/src/shared/auth/`
- `backend/src/modules/identity/`
- `backend/src/modules/projects/`
- `backend/src/modules/contribution-tasks/`
- `backend/src/modules/applications/`
- authorization-focused backend specs

**Current behavior:** Some sensitive behavior is still coupled to fixed account
roles and user status.

**Expected behavior:** Publish/apply/private-workspace access is expressed
through capability checks that can later use project ownership, active
application status, and accepted assignments. Terminal applications must not
grant access.

**Acceptance criteria:**

- A shared capability API exists for owner, applicant, assigned contributor, and
  admin checks.
- Email verification can be required independently from capability.
- Terminal application statuses are denied in tests, even if placeholder modules
  are still scaffold-only.
- Existing routes that cannot be fully migrated yet are explicitly guarded or
  disabled rather than relying on old owner/contributor account roles.
- The implementation does not invent task/application product features beyond
  authorization scaffolding needed for S1.

**Test commands:**

- `pnpm --filter ./backend lint`
- `pnpm --filter ./backend exec tsc --noEmit`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=src`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=test`
- `pnpm --filter ./backend check:architecture`
- `pnpm --filter ./backend build`

**Authorization implications:** Establishes the replacement for fixed product
roles and blocks terminal-state access.

**Data or migration implications:** Should avoid new persistent workflow tables
unless unavoidable; any persistence change needs Prisma validation.

**API impact:** May change forbidden responses where old account roles granted
access.

**Frontend impact:** Frontend should consume capability/permission flags rather
than account-role strings.

**Documentation impact:** Update backend workflow guidance if new capability
helpers are introduced.

**Demo proof:** Show a verified user can authenticate while sensitive actions
remain gated by capability and email verification.

### S1-03 — Move refresh sessions to httpOnly cookie transport with CSRF-safe behavior

**Classification:** Must-have

**Primary owner placeholder:** Backend C

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P0 Critical`
- Size: `M`
- Area: `Backend`
- Slice: `S1 Auth and Public Profile`
- Risk: `Security`

**Requirement or decision IDs:** Product Spec §4.1, API Contracts §2,
ADR-005, Test Strategy §5.

**Dependencies:** S1-01.

**Expected files or modules:**

- `backend/src/modules/identity/controllers/session.controller.ts`
- `backend/src/modules/identity/dto/refresh-session.request.ts`
- `backend/src/modules/identity/services/session.service.ts`
- backend CORS/config validation
- identity session tests
- frontend auth client integration points coordinated with S1-07

**Current behavior:** Refresh tokens are sent in JSON and accepted from the
request body.

**Expected behavior:** Refresh token rotation/revocation uses an httpOnly cookie
with explicit SameSite/Secure/Path/Max-Age behavior and CSRF-safe refresh/logout
semantics. Access tokens are not persisted in frontend storage.

**Acceptance criteria:**

- Login/social callback sets the refresh cookie.
- Refresh rotates the session and refresh cookie.
- Logout revokes the session and clears the cookie.
- Replay, expiry, revoked-session, CSRF, and CORS credential cases are tested.
- Any compatibility period for body refresh tokens is explicit and time-boxed.
- No refresh token is returned to frontend JavaScript in the target flow.

**Test commands:**

- `pnpm --filter ./backend lint`
- `pnpm --filter ./backend exec tsc --noEmit`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=src`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=test`
- `pnpm --filter ./backend build`

**Authorization implications:** Reduces XSS exposure but introduces CSRF/CORS
requirements that must be tested.

**Data or migration implications:** Existing session rows remain valid only if
the compatibility plan says so; otherwise the migration/revocation impact must
be documented.

**API impact:** Changes auth transport contract for login, refresh, and logout.

**Frontend impact:** Blocks final frontend auth shell integration in S1-07.

**Documentation impact:** Update local development and API exercise docs if
cookie-based auth changes manual testing.

**Demo proof:** Log in, refresh, and log out using cookies only, then prove a
replayed/old refresh token no longer works.

### S1-04 — Enforce least-privilege GitHub public-evidence containment

**Classification:** Must-have

**Primary owner placeholder:** Backend D

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P0 Critical`
- Size: `M`
- Area: `Backend`
- Slice: `S1 Auth and Public Profile`
- Risk: `External API`

**Requirement or decision IDs:** AI-001, SEC-001, Product Spec §§4.6 and 6,
Architecture §§5–6, API Contracts §4.

**Dependencies:** S1-01. Coordinates with S1-08 for FastAPI contract verification.

**Expected files or modules:**

- `backend/src/modules/github/controllers/github-oauth.controller.ts`
- `backend/src/modules/github/services/github-oauth.service.ts`
- `backend/src/modules/github/services/github-repository.service.ts`
- `backend/src/modules/github/services/github-evidence.service.ts`
- `backend/src/modules/github/integrations/github-api.client.ts`
- `backend/src/modules/skill-profiles/services/skill-profile-generation.service.ts`
- possible Prisma metadata migration for granted scopes/freshness
- GitHub and skill-profile tests using mocks

**Current behavior:** Contributor OAuth requests broad `repo` access; repository
listing can include private repositories; selected snapshots can feed private
content into skill-profile generation.

**Expected behavior:** New consent asks only for approved minimal public-evidence
scopes. Private repositories cannot be selected, snapshotted, sent to AI, or
projected publicly. Existing broad-token users have a documented reauthorization
or containment path.

**Acceptance criteria:**

- OAuth URL tests prove no contributor `repo` scope for public inference.
- Repository listing and evidence collection reject private repositories.
- AI payload tests prove only public evidence reaches the FastAPI client.
- Granted scope and evidence freshness are recorded or explicitly documented if
  deferred.
- Existing broad tokens/snapshots are addressed by a safe remediation plan.
- No live GitHub API is required by ordinary tests.

**Test commands:**

- `pnpm --filter ./backend lint`
- `pnpm --filter ./backend exec tsc --noEmit`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=src`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=test`
- `pnpm --filter ./backend build`

**Authorization implications:** Prevents private repository data exposure and
keeps public inference within approved evidence boundaries.

**Data or migration implications:** May require metadata columns and cleanup of
impermissible cached evidence.

**API impact:** GitHub repository list and selection behavior may change for
users who previously saw private repositories.

**Frontend impact:** GitHub connection UI must explain public-only evidence and
reauthorization where required.

**Documentation impact:** Update GitHub consent and local API testing docs.

**Demo proof:** Connect GitHub through the new consent flow, show only public
evidence is selectable, and prove a mocked private repo is rejected.

### S1-05 — Add privacy-safe versioned public profile API

**Classification:** Must-have

**Primary owner placeholder:** Backend E

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P1 High`
- Size: `M`
- Area: `Backend`
- Slice: `S1 Auth and Public Profile`
- Risk: `Security`

**Requirement or decision IDs:** API-001, Product Spec §§4.1 and 4.9,
Architecture §§12–14, API Contracts §3.

**Dependencies:** S1-01 for removal of misleading fixed role labels.

**Expected files or modules:**

- `backend/src/modules/contributor-profiles/contributor-profiles.controller.ts`
- `backend/src/modules/contributor-profiles/contributor-profiles.service.ts`
- `backend/src/modules/contributor-profiles/dto/contributor-profile.dto.ts`
- `backend/src/modules/contributor-profiles/utils/contributor-profile.presenter.ts`
- public profile contract/e2e tests

**Current behavior:** `GET /contributors/profiles/:username` is authenticated
and returns authenticated-viewer data such as completion prompts.

**Expected behavior:** `GET /api/v1/profiles/:username` is available without an
access token and returns a guest-safe projection. Authenticated self-management
remains separate.

**Acceptance criteria:**

- Logged-out public profile endpoint succeeds for visible profiles.
- Hidden, unknown, malformed, and suspended/deactivated cases return safe errors.
- Response excludes completion prompts, private evidence, private GitHub data,
  internal status fields, and misleading global verified booleans.
- Trust/evidence fields are structured so future labels can be added without
  collapsing evidence source, review status, verification tier, and skill claims.
- Existing route compatibility is explicitly retained or deprecated with tests.

**Test commands:**

- `pnpm --filter ./backend lint`
- `pnpm --filter ./backend exec tsc --noEmit`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=src`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=test`
- `pnpm --filter ./backend build`

**Authorization implications:** Public read is intentionally unauthenticated;
self-management remains authenticated.

**Data or migration implications:** No required migration unless projection
needs visibility fields not already persisted.

**API impact:** Adds the target versioned public route.

**Frontend impact:** Unblocks S1-07 public profile route.

**Documentation impact:** Update API examples for logged-out public profile.

**Demo proof:** Fetch `/api/v1/profiles/:username` with no token and show private
fields are absent.

### S1-06 — Update frontend onboarding to match contextual identity

**Classification:** Must-have

**Primary owner placeholder:** Frontend A

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P1 High`
- Size: `S`
- Area: `Frontend`
- Slice: `S1 Auth and Public Profile`
- Risk: `Normal`

**Requirement or decision IDs:** Product Spec §§2–4.1, SEC-002,
API Contracts §2.

**Dependencies:** S1-01 API contract.

**Expected files or modules:**

- `frontend/src/routes/**`
- frontend auth/onboarding API client modules
- frontend route/component tests

**Current behavior:** The frontend is still minimal and must not introduce a new
owner/contributor account choice.

**Expected behavior:** Account creation and session state align with the backend
contextual-capability model.

**Acceptance criteria:**

- No registration UI asks for a permanent owner/contributor role.
- Client-side DTOs match the backend registration response.
- Session state stores capabilities/permissions, not account product roles.
- Loading, validation, and server-error states are covered.

**Test commands:**

- `pnpm --filter ./frontend lint`
- `pnpm --filter ./frontend typecheck`
- `pnpm --filter ./frontend test`
- `pnpm --filter ./frontend build`

**Authorization implications:** Prevents frontend from reintroducing fixed
product roles.

**Data or migration implications:** None.

**API impact:** Consumes the S1-01 auth contract.

**Frontend impact:** Creates the first real auth/onboarding client boundary.

**Documentation impact:** Update frontend workflow notes if new env/config is
required.

**Demo proof:** Show registration UI and network payload with no product-role
field.

### S1-07 — Build frontend auth shell and logged-out public profile route

**Classification:** Must-have

**Primary owner placeholder:** Frontend B

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P1 High`
- Size: `M`
- Area: `Frontend`
- Slice: `S1 Auth and Public Profile`
- Risk: `Security`

**Requirement or decision IDs:** API-001, Product Spec §§4.1 and 4.9,
Test Strategy §§2 and 5.

**Dependencies:** S1-03 and S1-05.

**Expected files or modules:**

- `frontend/src/router.tsx`
- `frontend/src/routes/__root.tsx`
- new public profile route under `frontend/src/routes/`
- frontend API/auth client modules
- route/component tests

**Current behavior:** Frontend has no real auth shell or public profile screen.

**Expected behavior:** A logged-out viewer can navigate directly to a public
profile route that consumes the real backend API. Auth refresh behavior uses the
cookie contract without persisting refresh tokens in browser storage.

**Acceptance criteria:**

- Direct logged-out public profile navigation works.
- Loading, empty, not-found, hidden, and API-error states are accessible.
- Public trust/evidence placeholders explain source labels without implying a
  global verified boolean.
- Auth shell uses cookie refresh and in-memory access-token handling.
- Tests cover route behavior and private-field absence.

**Test commands:**

- `pnpm --filter ./frontend lint`
- `pnpm --filter ./frontend typecheck`
- `pnpm --filter ./frontend test`
- `pnpm --filter ./frontend build`

**Authorization implications:** Public page must not require auth; authenticated
state must not leak private profile controls into guest projection.

**Data or migration implications:** None.

**API impact:** Consumes S1-03 and S1-05 contracts.

**Frontend impact:** Replaces the starter surface with a real vertical user path.

**Documentation impact:** Add or update local frontend verification notes.

**Demo proof:** Open a profile URL in a fresh browser session with no token and
show a profile/404 response without private controls.

### S1-08 — Verify in-repository FastAPI skill-profile contract and public-only boundary

**Classification:** Must-have

**Primary owner placeholder:** AI A

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P1 High`
- Size: `S`
- Area: `AI`
- Slice: `S1 Auth and Public Profile`
- Risk: `External API`

**Requirement or decision IDs:** AD-001, AI-001, Product Spec §6,
Architecture §§1 and 5, API Contracts §§6 and 9.

**Dependencies:** S1-04 for backend payload containment.

**Expected files or modules:**

- `ai/requirements.txt`
- `ai/src/sharek_agents/main.py`
- `ai/src/sharek_agents/agents/skill_profiling/`
- `backend/src/modules/ai/integrations/fastapi-skill-profile.client.ts`
- AI/backend contract fixtures

**Current behavior:** The FastAPI service now exists under `ai/`, and CI has an
AI verification job, but S1 still needs a product-level contract fixture proving
public-only input and advisory output shape.

**Expected behavior:** FastAPI accepts only the bounded skill-profile contract,
returns advisory evidence/confidence/uncertainty, and does not own any business
transition. Tests use fixtures/mocks and do not call paid model APIs.

**Acceptance criteria:**

- A pinned install path exists for CI/local verification.
- AI lint/compile or configured tests pass without model-provider secrets.
- Contract fixture proves public GitHub evidence input shape.
- Output includes confidence, uncertainty, evidence references, and version
  metadata where supported.
- Failure or malformed output is represented as non-blocking to NestJS.

**Test commands:**

- `python -m pip install --requirement ai/requirements.txt`
- `python -m pylint --disable=all --enable=E,F ai/src/sharek_agents`
- `python -m compileall -q ai/src/sharek_agents`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=src/modules/ai`

**Authorization implications:** Confirms FastAPI is bounded and advisory only.

**Data or migration implications:** None expected.

**API impact:** Stabilizes the NestJS-to-FastAPI skill-profile contract.

**Frontend impact:** None in S1.

**Documentation impact:** Update AI operations notes if the command set changes.

**Demo proof:** Run a mocked contract fixture showing public-only input and
advisory output, with no live model call.

### S1-09 — Integrated S1 verification, documentation, and demo proof

**Classification:** Must-have

**Primary owner placeholder:** Cross-cutting A

**Suggested Project fields:**

- Status: `Backlog`
- Priority: `P1 High`
- Size: `S`
- Area: `Cross-cutting`
- Slice: `S1 Auth and Public Profile`
- Risk: `Architecture`

**Requirement or decision IDs:** Delivery Plan §2, Test Strategy §6.

**Dependencies:** S1-01 through S1-08.

**Expected files or modules:**

- `docs/audits/codebase-gap-report.md`
- relevant `docs/operations/**` files
- optional API examples or demo notes
- no product feature code unless a failing verification uncovers an issue that
  is fixed under its owning sub-issue

**Current behavior:** S1 completion evidence does not exist yet.

**Expected behavior:** The team can prove the full S1 path from clean checkout
through automated checks and a manual demo.

**Acceptance criteria:**

- Required backend, frontend, and AI verification commands are run and recorded.
- Public profile guest demo proof is recorded.
- Auth/cookie/GitHub public-evidence security notes are recorded.
- Codebase gap report is updated only for current evidence, not rewritten to hide
  earlier audit findings.
- Unresolved decisions and follow-up issues for S2 are listed.

**Test commands:**

- `pnpm install --frozen-lockfile`
- `pnpm --filter ./frontend lint`
- `pnpm --filter ./frontend typecheck`
- `pnpm --filter ./frontend test`
- `pnpm --filter ./frontend build`
- `pnpm --filter ./backend lint`
- `pnpm --filter ./backend exec tsc --noEmit`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=src`
- `pnpm --filter ./backend test -- --runInBand --testPathPattern=test`
- `pnpm --filter ./backend check:architecture`
- `pnpm --filter ./backend exec prisma validate`
- `pnpm --filter ./backend build`
- `python -m pylint --disable=all --enable=E,F ai/src/sharek_agents`
- `python -m compileall -q ai/src/sharek_agents`

**Authorization implications:** Confirms the slice does not leave role,
cookie, or public-profile bypasses untested.

**Data or migration implications:** Confirms migration evidence and rollback or
forward-only notes are available.

**API impact:** Confirms final S1 route/auth contracts.

**Frontend impact:** Confirms the first real user-visible vertical path.

**Documentation impact:** Updates operations and audit handoff docs.

**Demo proof:** From a clean checkout, run the S1 command set, register/log in,
refresh/logout, connect mocked/public GitHub evidence, and view a public profile
while logged out.

## Stretch or deferred work

These are not part of the must-have Stage 6 backlog unless a human explicitly
adds them to the approved manifest:

- visual polish beyond accessible, responsive public profile basics;
- full external-project evidence workflow;
- project/task publication;
- application fit analysis;
- reputation-event projection;
- live GitHub API integration tests;
- live paid model-provider tests;
- file upload, scanning, retention, or storage.

## Dependency and blocking relationships

```text
S1-01 fixed-role removal
  -> S1-02 contextual capability guardrail
  -> S1-06 frontend onboarding

S1-01
  -> S1-03 cookie refresh transport
  -> S1-07 frontend auth shell

S1-01
  -> S1-05 public profile API
  -> S1-07 frontend public profile route

S1-01
  -> S1-04 least-privilege GitHub containment
  -> S1-08 FastAPI public-only contract verification

S1-01..S1-08
  -> S1-09 integrated verification and demo proof
```

## Safe parallelization

Parallel group A — can begin first:

- S1-01 fixed-role removal
- S1-04 GitHub containment design/tests
- S1-05 public profile API design/tests
- S1-08 AI contract fixture preparation, excluding final backend payload proof

Parallel group B — begins after S1-01 API/persistence shape is stable:

- S1-02 contextual capability guardrail
- S1-03 cookie refresh transport
- S1-06 frontend onboarding

Parallel group C — begins after backend contracts are merged:

- S1-07 frontend auth shell and public profile route
- S1-08 final NestJS/FastAPI public-only contract verification

Final group:

- S1-09 integrated verification and documentation

Execution rule: one developer may own only one `In progress` implementation
issue at a time. Reviews should be cross-owned, especially for auth, GitHub, and
AI boundary changes.

## File-collision warnings

- S1-01, S1-02, and S1-03 all touch identity/auth files and should not be merged
  blindly in parallel.
- S1-04 and S1-08 both touch the NestJS AI/GitHub skill-profile boundary.
- S1-05 and S1-07 share the public profile DTO/route contract.
- S1-06 and S1-07 both touch frontend router/auth client structure.
- Any Prisma migration must be ordered and reviewed before another migration is
  created from a stale schema.

## Initial Project status recommendation

- `Ready`: S1-01 only.
- `Backlog`: S1-02 through S1-09 until their dependencies are satisfied.
- Do not set any issue to `In progress` in Stage 6.
- Do not assign humans until Stage 7 provides usernames, skills, availability,
  and ownership constraints.

## Unresolved blockers and decisions

1. **DX-001 capacity is still open.** The manifest uses owner placeholders only.
2. **Existing broad GitHub tokens/snapshots need a remediation decision.** S1-04
   must not silently ignore already persisted private-capable access.
3. **Refresh-token compatibility window must be chosen.** S1-03 must state
   whether body refresh tokens are rejected immediately or temporarily supported.
4. **Public profile versioning compatibility must be chosen.** S1-05 must state
   whether the old authenticated route remains during transition.
5. **AI tests must remain offline by default.** S1-08 must not require paid model
   provider secrets or live GitHub APIs in ordinary CI.
