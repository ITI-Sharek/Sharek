# ShareK — API Contracts

**Status:** mixed — marked per section
**Date:** 2026-07-17
**Depends on:** `prd.md`, `architecture.md`, `data-model-and-erd.md`, `frontend-spec.md` §6
**Supersedes:** this file's previous version

No URL version prefix (`/v1/...`) — none of the real, implemented routes below use one, and inventing one here would contradict running code. If versioning is needed later, that's a separate, explicit decision, not something to retrofit into this doc.

---

## 0. Direction

```text
Frontend (frontend/**) -> NestJS backend (backend/**) -> database / GitHub / AiPort
```

The frontend never calls a model provider or an AI service directly (unchanged principle) — but there is no separate FastAPI hop anymore in the target architecture (ADR-003). The current code still has one; see `architecture.md` §1/§3.

## 1. Conventions

- Stable request/response DTOs — never raw Prisma rows.
- Every request validated.
- Pagination shape (already real, keep as-is): `{ items, page, perPage, hasNextPage }`, `page` starts at `1`.
- Standard error envelope (target — not yet consistently implemented):

```json
{
  "code": "APPLICATION_NOT_ALLOWED",
  "message": "You cannot apply to this task.",
  "details": { "reason": "TASK_CLOSED" },
  "correlationId": "req_123"
}
```

## 2. Identity and session — `IMPLEMENTED`, with one confirmed gap

Real, working endpoints (`backend/src/modules/identity/`):

```text
POST /auth/register
GET  /auth/username-availability
POST /auth/verify-email
POST /auth/verify-email/resend
POST /auth/login
POST /auth/forgot-password
POST /auth/reset-password
GET  /auth/google/start
GET  /auth/google/callback
POST /auth/google/callback
GET  /auth/github/start
GET  /auth/github/callback
POST /auth/github/callback
POST /auth/refresh
POST /auth/logout
GET  /auth/me
PATCH /auth/users/:id/role
```

**Confirmed gap (FR-07):** `POST /auth/register` currently requires `"role": "owner" | "contributor"` as a field on the request, persisted directly to `User.role` (a fixed enum). Target: no `role` field in the registration payload at all — `OWNER`/`CONTRIBUTOR`/`APPLICANT` are derived per-project (`data-model-and-erd.md` §1), and `PATCH /auth/users/:id/role` continues to exist only for the one real account-level role, `ADMIN`.

**Not a gap — corrected from an earlier pass this session:** registration creates a `pending`-status user and sends an email OTP; `pending` here is the **email-verification** state (contributors get a deliberate carve-out to use profile/skill-generation flows before verifying), not an admin-approval gate — nothing in `SkillProfile.status` blocks anything today (`applications` has no code yet). This is compatible with FR-16 as-is.

**Confirmed gap (FR-03):** `POST /auth/refresh` reads `refreshToken` from the request body (`RefreshSessionRequest` DTO), not an httpOnly cookie. Target transport per `prd.md` FR-03 / ADR-005.

`GET /auth/me` / `POST /auth/login` response fields: `id, email, username, firstName, lastName, avatarUrl, role, status, preferredLanguage, createdAt, updatedAt, lastLoginAt` — drop `role` once FR-07 lands.

Username rule (real, keep): lowercase, URL-safe, `^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$`. `GET /auth/username-availability` returns `{ available, suggestion, reason }` where `reason` is `invalid_format | reserved | taken | null`.

## 3. Public contributor profile — `IMPLEMENTED` (shape), gaps against FR-18/42

Real endpoints (`backend/src/modules/contributor-profiles/`, `skill-profiles/`):

```text
POST /contributors/profiles/me/ensure
GET  /contributors/profiles/:username
```

Current response shape:

```json
{
  "username": "jane-doe",
  "displayName": "Jane Doe",
  "avatarUrl": null,
  "roleLabel": "Contributor",
  "bio": null,
  "skills": [],
  "availability": null,
  "githubStatus": { "connected": false, "username": null },
  "reputationSummary": { "rating": null, "reviewsCount": 0 },
  "contributionHistory": [],
  "completionPrompts": ["add_bio", "generate_skills", "connect_github"],
  "viewerRelationship": "owner"
}
```

**Gaps against the target (`frontend-spec.md` §2, `prd.md` FR-18/42):** `roleLabel` should go away with FR-07 (no fixed role to label). `skills[]` needs the full evidence-state field (`SELF_DECLARED|AI_INFERRED|CONTRIBUTION_DEMONSTRATED|ADMIN_REVIEWED`, not just approval status). `reputationSummary` needs per-dimension breakdown with sample size and the n=3 raw-reviews-below-threshold rule (FR-42) — currently just `{ rating, reviewsCount }`. `contributionHistory[]` needs evidence links + `prState` per item (FR-34).

Errors (real, keep): `401` bad/missing/expired token, `403` owner/admin calling `ensure` or suspended/deactivated contributor, `404` unknown/hidden profile, `409` username conflict, `422` invalid username/profile data, `400` malformed request.

## 4. GitHub integration — `IMPLEMENTED`, one correction to make to the old doc, not the code

Real endpoints (`backend/src/modules/github/`):

```text
GET    /github/oauth/start
GET    /github/oauth/callback
POST   /github/oauth/callback
GET    /auth/github/callback/repository
GET    /github/account
GET    /github/repositories
GET    /github/readme
GET    /github/repository/description
GET    /github/repository/statistics
GET    /github/repository/contribution-activity
GET    /github/repository/commit-signals
DELETE /github/account
POST   /projects/import/github
```

**Correction (to the previous version of this doc, not to the code):** the old version of this file claimed contributor OAuth requests the broad `repo` scope (read+write, including private repos) — that was simply inaccurate. The actual default scope, confirmed in `github-oauth.service.ts`, is `'read:user user:email public_repo'` — public repositories only, no private-repo access, matching `prd.md` NFR-04 ("public repositories only in MVP"). `public_repo` is technically write-capable on public repos (GitHub doesn't offer a narrower read-only granularity for this use case), which is marginally broader than FR-02's "no repository write scope" ideal — worth knowing, not worth blocking on.

Repository list response (real, keep): `{ items, page, perPage, hasNextPage }`, `perPage` default `12` / cap `50`. Focused evidence endpoints take `?fullName=owner/repository`, return normalized README/description/stats/contribution-activity/commit-signals, each with an `unavailableReason` fallback instead of failing the whole import.

## 5. Skill profiling — `IMPLEMENTED`, gaps around eligibility language

Real endpoints (`backend/src/modules/skill-profiles/`):

```text
POST /skill-profiles/me/generations
GET  /skill-profiles/me/generations/:generationId
```

Request: `{ repositories: [{ fullName: "owner/repository" }] }` — 1 to 10 items, each must appear in the connected account's own `GET /user/repos` (rejects arbitrary public repos). Status lifecycle (real): `queued -> collecting_evidence -> analyzing -> pending_review | needs_more_evidence | failed`.

**Language correction needed, behavior is fine:** the old doc said "pending generated skills... must not qualify a contributor for application eligibility until an admin approves them" — phrased as if this is enforced. It isn't currently enforced anywhere (`applications` is unbuilt), and per FR-16 it never should be as an eligibility *block* — admin review only relabels the skill's evidence state (`AI_INFERRED -> ADMIN_REVIEWED`). Keep `pending_review`/`needs_more_evidence` exactly as they are (they describe the generation job's own lifecycle, which is fine), just don't describe them as an eligibility gate anywhere.

## 6. AI integration — target replaces the current section entirely

Current code (`ai` module) integrates a separate FastAPI service (`FastApiSkillProfileClient`, `AI_SERVICE_URL`). Target, per `architecture.md` §3 / ADR-003:

```text
Owning service (skill-profiles | applications)
  -> deterministic checks
  -> AiPort.generateSkillProfile() | AiPort.generateApplicationFitAnalysis()
  -> structured result (+ promptVersion, modelVersion, confidence, evidenceRefs)
  -> owning service validates + persists AiOutput + updates its own entity
```

No FastAPI endpoints, no `AI_SERVICE_URL`/`AI_SERVICE_AUTH_TOKEN`, no internal-bearer-token contract between two repos — it's all one process. Failure handling is unchanged in spirit: never silently approve on a low-confidence or malformed result; retry only when safe; route to the normal manual/owner-review path (which, because AI is advisory everywhere, is just the default path anyway) — store the failure as an `AiOutput` with no result, not as a business-state change.

## 7. Core loop — `PROPOSED`, none of this exists in code yet

Everything below is net-new, matching `applications` having no service/controller and no `reviews`/`notifications` module existing at all (`architecture.md` §2).

```text
POST   /projects
GET    /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
POST   /projects/:projectId/publish

POST   /projects/:projectId/tasks
GET    /projects/:projectId/tasks
GET    /tasks/:taskId
PATCH  /tasks/:taskId
POST   /tasks/:taskId/comments
GET    /tasks/:taskId/comments

POST   /tasks/:taskId/applications
GET    /tasks/:taskId/applications
POST   /applications/:applicationId/withdraw
POST   /applications/:applicationId/accept
POST   /applications/:applicationId/reject

POST   /applications/:applicationId/evidence
PATCH  /evidence/:evidenceId
POST   /evidence/:evidenceId/review        # DeliveryReview: approve | request-changes | reject

POST   /evidence/:evidenceId/reviews       # bilateral Review, one per direction
GET    /evidence/:evidenceId/reviews

GET    /users/:username/reputation

GET    /notifications
POST   /notifications/:id/read

POST   /flags                              # contest an evidence/review/skill item (FR-45)
GET    /admin/flags
POST   /admin/flags/:id/resolve
POST   /admin/users/:id/ban
```

Response shapes for the three records `frontend-spec.md` §6 renders directly (`ContributionEvidence`, `Review`, `UserSkill`) must match `data-model-and-erd.md` §2 field-for-field — not restated here to avoid drift between two documents describing the same shape.

## 8. Contract change rules

- Breaking changes require explicit frontend coordination (cross-repo integration contract, `CLAUDE.md`).
- DTO changes must be reflected here or in generated OpenAPI — this doc or the OpenAPI spec, not both silently diverging.
- Contract drift is caught by integration/contract tests (`test-strategy.md`, pending).
