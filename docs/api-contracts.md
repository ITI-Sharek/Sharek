# API Contracts

## Public API Direction

The frontend calls the NestJS backend only.

```text
Next.js frontend -> NestJS backend -> database/GitHub/FastAPI AI service
```

The frontend should not call model providers or the FastAPI AI service directly.

## REST Guidelines

- Use stable request and response DTOs.
- Validate every request.
- Return domain-safe responses, not raw Prisma rows.
- Use pagination for lists.
- Use explicit status values.
- Return useful error codes and safe error messages.

## Core API Areas

Expected API groups:

```text
/auth
/users
/github
/projects
/contribution-tasks
/applications
/skill-profiles
/admin
/deliveries
/reputation
/contributors/profiles
/health
```

Exact route naming can evolve, but ownership must stay aligned with modules.

## Identity And Session Contracts

Implemented identity endpoints:

```text
POST /auth/register
GET /auth/username-availability
POST /auth/verify-email
POST /auth/verify-email/resend
POST /auth/login
POST /auth/forgot-password
POST /auth/reset-password
GET /auth/google/start
GET /auth/google/callback
POST /auth/google/callback
GET /auth/github/start
GET /auth/github/callback
POST /auth/github/callback
POST /auth/refresh
POST /auth/logout
GET /auth/me
PATCH /auth/users/:id/role
```

Registration supports these public roles:

```text
owner
contributor
```

`admin` is reserved for role assignment by an authenticated admin.

Email/password registration creates a `pending` user, sends a 6-digit email OTP,
and returns the user plus `emailVerificationRequired: true` and
`verificationExpiresAt`. It does not return tokens until email verification is
complete.

`POST /auth/register` requires:

```json
{
  "email": "owner@example.com",
  "password": "Password123!",
  "username": "sharek-owner",
  "firstName": "Sharek",
  "lastName": "Owner",
  "role": "owner",
  "preferredLanguage": "en"
}
```

The `username` value is stored on `User.username`, must be unique, cannot be a
reserved platform name, and must be a lowercase URL-safe value matching:

```text
^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$
```

`GET /auth/username-availability?username=sharek-owner` returns:

```json
{
  "available": false,
  "suggestion": "sharek-owner-1",
  "reason": "taken"
}
```

`reason` is `invalid_format`, `reserved`, `taken`, or `null`. `suggestion` is
only returned when the name is taken and a deterministic free suffix is found.
GitHub direct auth signup does not require a username field; for new GitHub
users the backend tries to assign the normalized GitHub login when it is valid
and free, otherwise the user can set a profile username later.

`POST /auth/verify-email` accepts:

```json
{
  "email": "owner@example.com",
  "code": "123456"
}
```

If the latest unconsumed OTP is valid and unexpired, the backend activates the
user and returns the normal auth session object: user plus access and refresh
tokens. `POST /auth/verify-email/resend` accepts `{ "email": "..." }`, creates a
new OTP, and sends it again when the account is still pending.

Email OTP delivery uses SMTP settings. Gmail can be used by setting
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`,
`SMTP_PASS` to a Google App Password, and `EMAIL_FROM`. In non-production local
development without SMTP config, the backend logs the OTP for manual testing.

Login returns opaque access and refresh tokens only for active users. Access
tokens are sent to protected routes using:

```text
Authorization: Bearer <accessToken>
```

Refresh rotates the stored session tokens. Logout revokes the current session.
The backend stores only token hashes.

`POST /auth/login` and `GET /auth/me` return a public user DTO with:

```text
id, email, username, firstName, lastName, avatarUrl, role, status,
preferredLanguage, createdAt, updatedAt, lastLoginAt
```

Contributor usernames are stable URL-safe values matching:

```text
^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$
```

Active users can authenticate normally. Pending contributors can authenticate
for the contributor profile redirect flow. Suspended and deactivated users are
blocked from session use.

## Contributor Profile Redirect Contracts

Implemented contributor profile endpoints:

```text
POST /contributors/profiles/me/ensure
GET /contributors/profiles/:username
```

Both endpoints require:

```text
Authorization: Bearer <accessToken>
```

`POST /contributors/profiles/me/ensure` is idempotent. Active and pending
contributors receive a public contributor profile response. Owner/admin users
and suspended/deactivated contributors receive 403.

`GET /contributors/profiles/:username` loads only canonical usernames matching
the username pattern. Unknown, suspended, or deactivated contributor profiles
return 404.

Contributor profile response shape:

```json
{
  "username": "jane-doe",
  "displayName": "Jane Doe",
  "avatarUrl": null,
  "roleLabel": "Contributor",
  "bio": null,
  "skills": [],
  "availability": null,
  "githubStatus": {
    "connected": false,
    "username": null
  },
  "reputationSummary": {
    "rating": null,
    "reviewsCount": 0
  },
  "contributionHistory": [],
  "completionPrompts": ["add_bio", "generate_skills", "connect_github"],
  "viewerRelationship": "owner"
}
```

Profile owners receive all generated skills, including pending or rejected
skills. Other authenticated viewers receive approved skills only and an empty
`completionPrompts` array.

Protected error outcomes:

```text
401 invalid credentials or invalid/missing/expired/revoked token
403 owner/admin ensure attempt or suspended/deactivated contributor ensure
404 unknown profile username or hidden suspended/deactivated contributor
409 unresolved username/profile uniqueness conflict
422 valid request with invalid username/profile source data
400 malformed request syntax, shape, or malformed username route parameter
```

Profile responses must not include password hashes, access/refresh tokens,
token hashes, private session fields, OAuth credentials, or internal security
metadata.

Google and GitHub social auth are direct signup/signin flows. The frontend calls
`GET /auth/{provider}/start?role=owner|contributor`, redirects the browser to
`authorizationUrl`, then completes with the provider `code` and Share-k `state`
through `GET` or `POST /auth/{provider}/callback`.

The `role` query parameter is used only when the backend must create a new
Share-k user. Existing users keep their saved role. Social auth links by
provider account first, then by verified email. GitHub social auth is identity
only and requests the minimal GitHub `read:user user:email` scope. It must not
request private repository access or mark the repository-evidence connection as
complete. Contributors grant repository access later through
`GET /github/oauth/start` during onboarding/profile setup.

## GitHub Connection Contracts

Implemented GitHub connection endpoints:

```text
GET /github/oauth/start
GET /github/oauth/callback
POST /github/oauth/callback
GET /auth/github/callback/repository
GET /github/account
GET /github/repositories
GET /github/readme
GET /github/repository/description
GET /github/repository/statistics
GET /github/repository/contribution-activity
GET /github/repository/commit-signals
DELETE /github/account
GET /projects/me
POST /projects/import/github
```

`GET /github/oauth/start` requires an authenticated Share-k user. It stores a
short-lived OAuth state and returns the GitHub authorization URL. Browser flows
use `GET /auth/github/callback/repository` as the GitHub redirect URI; that
endpoint forwards the browser to the frontend `/auth/callback` page so the SPA
can complete the connection with `POST /github/oauth/callback`. Contributor
OAuth requests the GitHub `repo` scope so Share-k can read public and private
repository evidence after explicit GitHub consent. Owner/admin OAuth keeps the
lighter `public_repo` scope for the project-import shortcut.

The callback validates the stored state, exchanges the GitHub code, fetches the
GitHub profile, and stores the linked account. GitHub access tokens are never
returned in API responses. Stored GitHub access and refresh tokens are encrypted
at rest with AES-256-GCM.

`GET /github/repositories?page=1&perPage=12` requires an authenticated user
with a connected GitHub account. It returns normalized repository metadata
fetched through the encrypted server-side GitHub token. For contributors this
can include public and private repositories because their OAuth connection uses
the GitHub `repo` scope. Owner project import does not require this endpoint.

Repository list responses are paginated:

```json
{
  "items": [],
  "page": 1,
  "perPage": 12,
  "hasNextPage": false
}
```

`page` starts at `1`. `perPage` defaults to `12` and is capped at `50`.
`hasNextPage` is detected by asking GitHub for one extra repository.

The repository list is intentionally lightweight for picker screens. It includes
repository identity, owner, description, URL, visibility flags, default branch,
primary language, language byte counts, stars, forks, open issues, watchers,
topics, `pushedAt`, and `updatedAt`.

The focused repository evidence endpoints require a connected GitHub account and
the query parameter `fullName=owner/repository`:

```text
GET /github/readme?fullName=owner/repository
GET /github/repository/description?fullName=owner/repository
GET /github/repository/statistics?fullName=owner/repository
GET /github/repository/contribution-activity?fullName=owner/repository
GET /github/repository/commit-signals?fullName=owner/repository&author=optional
```

They return normalized README, description, repository statistics,
contribution-activity, or recent-commit signal views using the encrypted
server-side GitHub token. Missing `fullName` returns
`GITHUB_REPOSITORY_FULL_NAME_REQUIRED`.

`GET /projects/me` requires an authenticated `owner` or `admin` and returns the
current user's owner-project dashboard data:

```json
{
  "projects": [
    {
      "id": "project-id",
      "title": "sharek-api",
      "slug": "sharek-api",
      "status": "draft",
      "openRequestsCount": 0,
      "pendingApplicationsCount": 0,
      "lastActivityLabel": "اليوم"
    }
  ],
  "quota": {
    "used": 0,
    "monthlyLimit": 20
  }
}
```

The response includes all projects owned by the authenticated owner, including
drafts. It is an owner workspace endpoint, not contributor discovery. Contributor
discovery must continue to filter on published projects only.

`POST /projects/import/github` requires an authenticated `owner` or `admin`
and accepts:

```json
{
  "fullName": "owner/repository",
  "status": "draft"
}
```

or:

```json
{
  "repoUrl": "https://github.com/owner/repository",
  "status": "published",
  "title": "Reviewed project title",
  "description": "Owner-reviewed project description",
  "tags": ["nestjs", "api"],
  "technologies": ["TypeScript", "PostgreSQL"],
  "category": "web",
  "difficulty": "intermediate"
}
```

`status` is optional and may be `draft` or `published`. New imports default to
`draft`, so the project remains hidden until the owner explicitly confirms
publication. `title`, `description`, `tags`, `technologies`, `category`, and
`difficulty` are optional owner-reviewed overrides. If an override is omitted,
the backend uses the GitHub-fetched value where available. Published saves
require `category` and `difficulty`; missing values return
`PROJECT_PUBLICATION_METADATA_REQUIRED`.

Owner GitHub connection is not required for project import. The endpoint uses
GitHub's public repository API, so private owner repositories are intentionally
outside the MVP import path.

The response is a project created or refreshed from GitHub metadata. The backend
stores the GitHub repo URL, GitHub repo ID, language breakdown, topics,
technologies, repository statistics, README content snapshot, contribution
activity, and recent commit signals where GitHub exposes them. Published
responses include `status: "published"` and `publishedAt`; draft responses use
`status: "draft"` and `publishedAt: null`. This is the handoff point for later
repository ingestion/background jobs and FastAPI AI evidence generation.

Normalized GitHub evidence currently contains:

```json
{
  "repository": {
    "fullName": "owner/repository",
    "description": "Repository description",
    "languages": {
      "TypeScript": 1000
    },
    "topics": ["nestjs"],
    "stars": 5,
    "forks": 1
  },
  "readmeContent": "# Project README",
  "contributionActivity": {
    "totalContributors": 3,
    "totalCommits": 42,
    "lastYearCommitCount": 20,
    "unavailableReason": null
  },
  "commitSignals": {
    "recentCommitCount": 30,
    "authors": ["owner-login"],
    "unavailableReason": null
  }
}
```

`contributionActivity` and `commitSignals` are optional evidence areas. If
GitHub returns pending, empty, missing, or unavailable stats, the backend keeps
the import usable and records an `unavailableReason` instead of failing the
project import.

## Skill Profile Contracts

Implemented contributor skill profile generation endpoints:

```text
POST /skill-profiles/me/generations
GET /skill-profiles/me/generations/:generationId
```

Both endpoints require an authenticated contributor. Pending contributors may
use these endpoints during onboarding. Owner/admin users and suspended or
deactivated contributors cannot start generation.

`POST /skill-profiles/me/generations` accepts selected repositories from the
existing GitHub repository picker:

```json
{
  "repositories": [
    { "fullName": "owner/repository" }
  ]
}
```

Rules:

- `repositories` must contain at least one item.
- At most 10 repositories can be selected for one generation.
- `fullName` must use `owner/repository` format.
- Every selection must appear in GitHub's authenticated `GET /user/repos`
  result for the connected account. Supplying an arbitrary public repository
  name is rejected.
- Repository evidence records commits/additions attributable to the exact
  connected GitHub login. Repository-wide activity is not treated as personal
  authorship.

The endpoint creates a durable generation record and enqueues a BullMQ job. The
initial response is shaped like:

```json
{
  "generationId": "generation-uuid",
  "status": "queued",
  "progress": {
    "selectedRepositoryCount": 1,
    "snapshottedRepositoryCount": 0
  },
  "failureReason": null,
  "selectedRepositories": [
    { "fullName": "owner/repository" }
  ],
  "skills": [],
  "fraudSignals": [],
  "evidenceQuality": null,
  "provider": null,
  "model": null,
  "promptVersion": null,
  "schemaVersion": null,
  "serviceVersion": null,
  "createdAt": "2026-07-14T00:00:00.000Z",
  "updatedAt": "2026-07-14T00:00:00.000Z",
  "completedAt": null
}
```

`GET /skill-profiles/me/generations/:generationId` returns the same shape with
current status. Status values are:

```text
queued
collecting_evidence
analyzing
pending_review
needs_more_evidence
failed
```

`needs_more_evidence` is terminal. It means Share-k could not establish enough
contributor-authored evidence to create reviewable skill candidates. The
frontend should ask the contributor to select repositories with clearer code
contributions; it must not present this state as pending admin approval.

When generation succeeds, generated skill candidates are stored as
`SkillProfile.status = pending` and appear in the response:

```json
{
  "skills": [
    {
      "id": "skill-profile-uuid",
      "name": "TypeScript",
      "proficiency": "intermediate",
      "confidence": 0.9,
      "status": "pending",
      "evidenceSummary": "Authored TypeScript API code."
    }
  ]
}
```

Pending generated skills are reviewable evidence only. They must not qualify a
contributor for application eligibility until an admin approves them.

## Admin Skill Review Contracts

Admin skill review endpoints require an authenticated active admin. The `admin`
module exposes the HTTP routes, and the exported `SkillProfilesReviewService`
from `skill-profiles` owns review transitions and database writes.

Implemented endpoints:

```text
GET /admin/skill-reviews/pending
POST /admin/skill-reviews/:skillProfileId/approve
POST /admin/skill-reviews/:skillProfileId/reject
PATCH /admin/skill-reviews/:skillProfileId/proficiency
```

`GET /admin/skill-reviews/pending?page=1&limit=20` returns only pending
AI-generated skills. `page` must be at least `1`; `limit` must be between `1`
and `100`.

Response shape:

```json
{
  "items": [
    {
      "skillProfileId": "skill-profile-uuid",
      "contributorId": "user-uuid",
      "contributorName": "Sharek Contributor",
      "contributorUsername": "sharek-contributor",
      "generationId": "generation-uuid",
      "skillName": "TypeScript",
      "proficiencyLevel": "intermediate",
      "confidence": 0.91,
      "status": "pending",
      "evidenceSummary": "Authored TypeScript services.",
      "evidenceSources": {
        "evidenceIds": ["github:owner/repository"]
      },
      "createdAt": "2026-07-19T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1
}
```

`POST /admin/skill-reviews/:skillProfileId/approve` approves a pending skill.
The body may include an adjusted proficiency and optional notes:

```json
{
  "proficiency": "advanced",
  "notes": "Evidence supports the advanced label."
}
```

`POST /admin/skill-reviews/:skillProfileId/reject` rejects a pending skill.
`notes` are required:

```json
{
  "notes": "Evidence is too weak for this skill claim."
}
```

`PATCH /admin/skill-reviews/:skillProfileId/proficiency` adjusts a pending
skill's proficiency without approving it:

```json
{
  "proficiency": "intermediate",
  "notes": "Adjusted before final approval."
}
```

Each approve, reject, or adjustment action appends a
`SkillProfileReviewDecision` audit row and updates the latest review fields on
`SkillProfile`. Already reviewed or superseded skill rows return a conflict.
Pending, rejected, disputed, and superseded skills are excluded from
eligibility-oriented skill reads; downstream eligibility code must use the
approved-only summary reader.

Approve and reject outcomes also coordinate post-review side effects:

- approving a pending contributor skill activates the contributor account when
  needed through the exported identity service;
- approving or rejecting a skill stores a contributor notification through the
  exported notifications service;
- stored notifications are emitted in real time to connected user sockets when
  possible;
- proficiency-only adjustments keep the skill pending and do not trigger final
  activation or final-outcome notification side effects.

Review action responses include `notification.deliveredRealtime`. `true` means
at least one authenticated socket for that recipient was connected when the row
was created. `false` does not mean notification failure; the notification row is
still stored and can be read by a future inbox endpoint.

## Real-Time Notification Socket Contract

The notifications module exposes a Socket.IO namespace:

```text
/notifications
```

Clients authenticate during connection with the same opaque access token used by
HTTP APIs:

```ts
io(`${API_URL}/notifications`, {
  auth: {
    token: accessToken,
  },
});
```

`auth.token` may be either the raw access token or `Bearer <token>`. The gateway
also accepts an `Authorization: Bearer <token>` header for non-browser clients.
Active users and pending contributors may connect. Invalid, expired, revoked,
suspended, and deactivated sessions receive:

```json
{
  "code": "NOTIFICATIONS_SOCKET_UNAUTHORIZED",
  "message": "Invalid or expired session"
}
```

and the socket is disconnected.

When a notification is persisted for the connected user, the socket receives:

```text
notification.created
```

Payload:

```json
{
  "notificationId": "notification-uuid",
  "userId": "user-uuid",
  "type": "skill_review",
  "title": "Skill profile approved",
  "message": "Your TypeScript skill was approved. Your contributor account is now active.",
  "metadata": {
    "skillProfileId": "skill-profile-uuid",
    "skillName": "TypeScript",
    "approved": true,
    "activated": true
  },
  "isRead": false,
  "readAt": null,
  "createdAt": "2026-07-19T00:00:00.000Z"
}
```

The gateway joins each socket to a server-side room derived from its own user ID
and emits only to that room.

## AI Service Contracts

AI implementation lives in a separate FastAPI AI repository. The NestJS backend
calls that service through `AiService` and integration clients and owns all business decisions,
database writes, and user-facing API responses.

Expected NestJS service contracts:

```text
AiService
  -> skill profile generation client
  -> eligibility client
  -> skill gap client
  -> embedding client
```

Expected FastAPI service endpoints:

```text
POST /skill-profiles/generate
POST /eligibility/analyze
POST /skill-gap/generate
POST /embeddings/generate
GET /health
```

`POST /skill-profiles/generate` receives backend-selected repository evidence
capsules, not a raw GitHub username for the AI service to crawl on its own.
The response must include generated skill candidates with evidence IDs plus
provider, model, prompt version, schema version, and service version metadata.
Every evidence ID must exactly match a capsule from the request. The NestJS
adapter rejects unknown IDs, malformed recommendation/evidence-quality values,
or oversized audit metadata.

Weak but valid evidence returns `needs_more_evidence`. Provider timeouts,
unavailable services, and malformed model output are service failures so the
BullMQ worker retries them before recording a safe `failed` state.

All skill-profile AI routes require `Authorization: Bearer <internal-token>`.
`AI_SERVICE_AUTH_TOKEN` must contain the same long random value in NestJS and
FastAPI. Keep FastAPI on an internal network; only `/health` is public.

The exact FastAPI route names may evolve, but the request/response schemas must
be documented and versioned across both repositories before implementation.

AI service output must be structured. Example eligibility result:

```json
{
  "recommendation": "manual_review",
  "confidence": 0.68,
  "matchedSkillIds": ["skill_123"],
  "missingSkills": ["Docker"],
  "evidenceIds": ["evidence_123", "evidence_456"],
  "provider": "openai",
  "model": "gpt-4.1-mini",
  "promptVersion": "eligibility-v1",
  "schemaVersion": "eligibility-result-v1",
  "serviceVersion": "ai-service-0.1.0",
  "reasonSummary": "Backend evidence is strong, but Docker evidence is weak."
}
```

Allowed recommendations:

```text
eligible
rejected
manual_review
```

The backend may override or transform recommendations according to policy.

The FastAPI service must not update Share-k business state directly. It returns
recommendations and evidence metadata; the NestJS backend decides what to store
and which workflow transition is allowed.

## Failure Handling

If the FastAPI AI service times out, returns invalid JSON, returns low
confidence, or cannot cite evidence:

- Do not silently approve.
- Retry only when safe.
- Route to manual review when the decision affects eligibility.
- Store an audit record.
- Return a clear user-safe message.

## Contract Change Rules

- Breaking API changes require frontend coordination.
- AI service output schema changes require backend and FastAPI contract tests.
- DTO changes must be reflected in docs or generated OpenAPI.
- Contract drift should be caught by integration or contract tests.
