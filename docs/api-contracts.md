# ShareK — API Contracts

**Status:** APPROVED — current routes and target contracts are marked separately
**Date:** 2026-07-18
**Depends on:** `decision-log.md`, `product-spec.md`, `architecture.md`

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

**Confirmed gap:** `POST /auth/register` currently requires `"role": "owner" | "contributor"` as a field on the request, persisted directly to `User.role` (a fixed enum). Target: no product-role field in the registration payload — `OWNER`/`CONTRIBUTOR`/`APPLICANT` are contextual capabilities (`architecture.md` §11), and account-level role administration is limited to `ADMIN`.

**Current behavior, not an admin gate:** registration creates a `pending`-status user and sends an email OTP. The status currently represents email verification, not admin portfolio approval. Target persistence must preserve SEC-002 while keeping email verification, contextual capabilities, and profile trust separate.

**Confirmed gap:** `POST /auth/refresh` reads `refreshToken` from the request body (`RefreshSessionRequest` DTO), not the proposed httpOnly-cookie transport in ADR-005.

`GET /auth/me` / `POST /auth/login` response fields: `id, email, username, firstName, lastName, avatarUrl, role, status, preferredLanguage, createdAt, updatedAt, lastLoginAt` — drop `role` once FR-07 lands.

Username rule (real, keep): lowercase, URL-safe, `^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$`. `GET /auth/username-availability` returns `{ available, suggestion, reason }` where `reason` is `invalid_format | reserved | taken | null`.

## 3. Public contributor profile — current authenticated shape, target public contract

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

**Target gaps:** `roleLabel` must not imply a fixed product role. `skills[]` must expose evidence source, human-review status, verification tier, and evidence mappings independently. The profile must expose source-explained trust signals and visible external projects; it must not reduce trust to one `verified` boolean. `reputationSummary` needs per-dimension breakdown and sample size. `contributionHistory[]` needs evidence references, GitHub source state, attribution, and verification tier.

Errors (current behavior): `401` bad/missing/expired token, `403` owner/admin calling `ensure` or suspended/deactivated contributor, `404` unknown/hidden profile, `409` username conflict, `422` invalid username/profile data, `400` malformed request. **Target gap:** `GET /api/v1/profiles/:username` must be usable without authentication; the class-level guard/current-user dependency on the current route must be removed from the public contract (`decision-log.md` API-001).

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

**Confirmed gap:** contributor accounts currently receive `CONTRIBUTOR_OAUTH_SCOPE = 'read:user user:email repo'`; the owner/admin default is `'read:user user:email public_repo'`. Selected private-repository evidence is approved under SEC-003, but the broad `repo` scope still exposes write capability and every private repository without selected-repository consent. The target contract requests narrow read-only access, records selection/consent/visibility, and rejects analysis outside that selection. This document does not claim that behavior is implemented.

Repository list response (real, keep): `{ items, page, perPage, hasNextPage }`, `perPage` default `12` / cap `50`. Focused evidence endpoints take `?fullName=owner/repository`, return normalized README/description/stats/contribution-activity/commit-signals, each with an `unavailableReason` fallback instead of failing the whole import.

Target selected-evidence endpoints (not implemented):

```text
GET    /github/evidence-repositories
POST   /github/evidence-selections
GET    /github/evidence-selections
DELETE /github/evidence-selections/:selectionId
```

Selection input uses stable GitHub repository IDs and an intended visibility for
derived claims; it never accepts a raw client assertion that a repository is
authorized. The server verifies the linked GitHub identity, granted read
permission, repository visibility, and current selection before collection or AI
analysis. Disconnect/revocation prevents future access and starts the approved
retention/deletion workflow.

## 5. Skill profiling — `IMPLEMENTED`, gaps around eligibility language

Real endpoints (`backend/src/modules/skill-profiles/`):

```text
POST /skill-profiles/me/generations
GET  /skill-profiles/me/generations/:generationId
```

Request: `{ repositories: [{ fullName: "owner/repository" }] }` — 1 to 10 items, each must appear in the connected account's own `GET /user/repos`. Current code may expose public or private repositories under the broad token; it does not implement SEC-003 selected-private consent. Status lifecycle (real): `queued -> collecting_evidence -> analyzing -> pending_review | needs_more_evidence | failed`.

**Target rules:** the existing `pending_review`/`needs_more_evidence` values describe the generation job lifecycle only. They must not gate participation. The target skill representation keeps `AI_INFERRED` as the evidence source and records human review separately; admin review does not overwrite the evidence source. AI inference is required in MVP, uses authorized public or explicitly selected private evidence, exposes confidence, uncertainty, freshness, evidence visibility, and references, and supports contributor dispute (`decision-log.md` AI-001, AI-004, DM-003, DM-004, SEC-003).

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

The target AI contract also supports permission-filtered RAG metadata and one
bounded agentic workflow. RAG responses identify retrieved evidence document IDs,
source revisions/freshness, visibility class, retrieval policy/version, and
scores. Private raw content is never returned to public consumers. Tool calls and
retrieval cannot create final business transitions.

## 7. Target contribution-loop API — `PROPOSED`

Projects have partial current endpoints, but the complete target workflow below is not implemented. Applications, tasks, delivery review, and admin are scaffolds; reviews and notifications are absent (`architecture.md` §3).

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
POST   /projects/:projectId/discussions
GET    /projects/:projectId/discussions
POST   /discussions/:discussionId/messages
GET    /discussions/:discussionId/messages

POST   /tasks/:taskId/applications
GET    /tasks/:taskId/applications
POST   /applications/:applicationId/withdraw
POST   /applications/:applicationId/accept
POST   /applications/:applicationId/reject

POST   /assignments/:assignmentId/evidence-submissions
GET    /evidence-submissions/:submissionId
POST   /evidence-submissions/:submissionId/review
POST   /evidence-submissions/:submissionId/resubmit

POST   /review-windows/:windowId/reviews
GET    /review-windows/:windowId/reviews

GET    /api/v1/profiles/:username

GET    /notifications
POST   /notifications/:id/read

POST   /projects/:projectId/direct-message-threads
GET    /projects/:projectId/direct-message-threads
POST   /direct-message-threads/:threadId/messages
GET    /direct-message-threads/:threadId/messages

POST   /flags                              # contest evidence/review/AI/skill subject
GET    /admin/flags
POST   /admin/flags/:id/resolve
POST   /admin/users/:id/ban
```

Every application-create response is accepted for owner delivery before optional AI completion. Application fit is attached asynchronously; no AI state changes visibility or submission validity.

Response shapes must follow `architecture.md` §§9–14. Evidence source, review status, verification tier, skill claims, and profile trust signals are separate; an older single enum or boolean is not authoritative.

## 8. Realtime collaboration contract — `PROPOSED`

The authenticated WebSocket endpoint is `/realtime`. The handshake uses the
approved session/access-token transport; the server rechecks current membership
and suspension state on connection, subscription, and send.

Client subscriptions are requests, not authority. NestJS resolves permitted
rooms from server-side project, task, assignment, and thread relationships.

Server events:

```text
discussion.message.created
direct_message.created
notification.created
thread.access_revoked
```

Client commands:

```text
discussion.subscribe
discussion.message.send
direct_message.subscribe
direct_message.send
notifications.subscribe
```

Successful sends are acknowledged only after the owning service persists the
record. Event envelopes include `eventId`, `occurredAt`, `correlationId`, subject
IDs, and a resumable cursor. Clients recover missed events through the HTTP
history/notification endpoints. WebSocket events never accept/reject
applications, approve evidence, publish reviews, or change reputation.

Rejected, withdrawn, expired, suspended, or otherwise unauthorized users receive
a generic forbidden/error event and cannot infer private room existence.

## 9. External-project evidence API — `PROPOSED`

```text
POST   /me/external-projects
GET    /me/external-projects
GET    /me/external-projects/:submissionId
PATCH  /me/external-projects/:submissionId
POST   /me/external-projects/:submissionId/submit
POST   /me/external-projects/:submissionId/withdraw
POST   /me/external-projects/:submissionId/resubmit

GET    /admin/external-projects?status=PENDING_REVIEW
GET    /admin/external-projects/:submissionId
POST   /admin/external-projects/:submissionId/review-actions
```

Create/update fields are `title`, `description`, `images`, `demoLink`, optional
`githubUrl`, `technologies`, `claimedRole`, `contributionDescription`,
`projectPeriod`, optional supporting files/URLs, and `visibility`. File transport
is not implementation-ready until OQ-001 is resolved.

Admin review action is one of `APPROVE`, `REJECT`, `REQUEST_CHANGES`, or `FLAG`
and requires notes where policy demands. The response exposes the approved
submission status vocabulary, version, `submittedAt`, `reviewStartedAt`,
`reviewedAt`, `reviewedBy`, and append-only action history.

Public profile projection exposes only policy-visible approved evidence, with a
source label and verification tier. It never returns a global `verified` field.

## 10. AI output contract — `PROPOSED`

Both required AI features return an auditable envelope:

```json
{
  "status": "completed",
  "summary": "Evidence-linked advisory text",
  "confidence": 0.74,
  "uncertainties": ["No recent TypeScript diff was accessible"],
  "evidence": [
    {
      "sourceType": "PUBLIC_PULL_REQUEST",
      "sourceUrl": "https://github.com/example/repo/pull/1",
      "repository": "example/repo",
      "visibility": "PUBLIC",
      "observedAt": "2026-07-17T00:00:00Z"
    }
  ],
  "modelVersion": "recorded-at-runtime",
  "promptVersion": "recorded-at-runtime"
}
```

Skill inference also returns normalized skill claims. Application fit also
returns matching evidence and missing/uncertain requirements. Failure returns a
non-blocking unavailable state; it never returns an authoritative accept/reject
transition.

For private evidence, public responses omit `sourceUrl`, repository identity, raw
content, and identifying excerpts. A contributor-approved derived public claim
uses `visibility: PRIVATE_DERIVED` and explains that its source is not publicly
inspectable.

## 11. Contract change rules

- Breaking changes require explicit frontend coordination.
- DTO changes must be reflected here or in generated OpenAPI — this doc or the OpenAPI spec, not both silently diverging.
- Contract drift is caught by integration/contract tests (`test-strategy.md`, pending).
