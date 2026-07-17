# ShareK — API Contracts

**Status:** mixed — marked per section
**Date:** 2026-07-17
**Depends on:** `decision-log.md`, `prd.md`, `architecture.md`, `data-model-and-erd.md`, `frontend-spec.md` §6
**Supersedes:** this file's previous version

The real, implemented routes below do not use a `/v1` URL segment. The human-approved target public-profile contract is `GET /api/v1/profiles/:username` (`decision-log.md` API-001); reconciling that target with the current unversioned route is explicit implementation work, not an implemented claim.

---

## 0. Direction

```text
Frontend (frontend/**) -> NestJS backend (backend/**) -> database / GitHub / bounded FastAPI AI service
```

The frontend never calls a model provider or AI service directly. NestJS owns authorization and business state and may call the bounded FastAPI service for approved AI workloads (`decision-log.md` AD-001); see `architecture.md` §1/§3.

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

**Gaps against the target (`frontend-spec.md` §2, `prd.md` FR-18/42, `decision-log.md` DM-002–004):** `roleLabel` should go away with FR-07 (no fixed role to label). `skills[]` must expose evidence source and human-review status independently. The profile must expose source-explained trust signals and visible external projects with their verification tier; it must not reduce trust to one `verified` boolean. `reputationSummary` needs per-dimension breakdown with sample size and the n=3 raw-reviews-below-threshold rule (FR-42) — currently just `{ rating, reviewsCount }`. `contributionHistory[]` needs evidence links + `prState` and verification tier per item (FR-34).

Errors (current behavior): `401` bad/missing/expired token, `403` owner/admin calling `ensure` or suspended/deactivated contributor, `404` unknown/hidden profile, `409` username conflict, `422` invalid username/profile data, `400` malformed request. **Target gap:** the approved public profile route must be usable without authentication; the class-level guard/current-user dependency on the current `GET /contributors/profiles/:username` route must not be carried into that public contract (`decision-log.md` API-001).

## 4. GitHub integration — `IMPLEMENTED`, with an MVP scope gap

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

**Confirmed gap:** contributor accounts currently receive `CONTRIBUTOR_OAUTH_SCOPE = 'read:user user:email repo'`; the owner/admin default is `'read:user user:email public_repo'`. The contributor scope includes private-repository access and repository write capability, which conflicts with the approved public-evidence-only AI inference boundary and least-privilege requirement. OAuth scope reduction and any resulting repository-selection behavior are implementation work; this document does not claim they are already fixed.

Repository list response (real, keep): `{ items, page, perPage, hasNextPage }`, `perPage` default `12` / cap `50`. Focused evidence endpoints take `?fullName=owner/repository`, return normalized README/description/stats/contribution-activity/commit-signals, each with an `unavailableReason` fallback instead of failing the whole import.

## 5. Skill profiling — `IMPLEMENTED`, gaps around eligibility language

Real endpoints (`backend/src/modules/skill-profiles/`):

```text
POST /skill-profiles/me/generations
GET  /skill-profiles/me/generations/:generationId
```

Request: `{ repositories: [{ fullName: "owner/repository" }] }` — 1 to 10 items, each must appear in the connected account's own `GET /user/repos` (rejects arbitrary public repos). Status lifecycle (real): `queued -> collecting_evidence -> analyzing -> pending_review | needs_more_evidence | failed`.

**Target rules:** the existing `pending_review`/`needs_more_evidence` values describe the generation job lifecycle only. They must not gate participation. The target skill representation keeps `AI_INFERRED` as the evidence source and records human review separately; admin review does not overwrite the evidence source (`decision-log.md` DM-003/DM-004). AI inference is required in MVP, uses public evidence only, exposes confidence and evidence references, and supports contributor dispute (`decision-log.md` AI-001).

## 6. AI integration — approved boundary and target behavior

Current code (`ai` module) integrates the separate FastAPI service through `FastApiSkillProfileClient` and `AI_SERVICE_URL`. That separate service remains the approved bounded AI deployment per `decision-log.md` AD-001:

```text
Owning service (skill-profiles | applications)
  -> deterministic checks
  -> bounded FastAPI skill-inference | application-fit operation
  -> structured result (+ promptVersion, modelVersion, confidence, evidenceRefs)
  -> owning service validates + persists AiOutput + updates its own entity
```

FastAPI returns analysis, confidence, and evidence references; NestJS validates and persists the result and alone owns business state. Every otherwise valid application reaches the owner even when AI fails, is low-confidence, or reports poor fit. AI must never hide or automatically reject an MVP application. Exact new FastAPI endpoints and DTOs remain implementation-contract work; none are invented here.

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

Response shapes for records rendered directly by the frontend must eventually be consolidated with the domain model. Until then, `decision-log.md` DM-001–004 controls the required separation of evidence source, review status, verification tier, skill claims, and profile trust signals; an older single-enum or single-boolean shape is not authoritative.

## 8. Contract change rules

- Breaking changes require explicit frontend coordination (cross-repo integration contract, `CLAUDE.md`).
- DTO changes must be reflected here or in generated OpenAPI — this doc or the OpenAPI spec, not both silently diverging.
- Contract drift is caught by integration/contract tests (`test-strategy.md`, pending).
