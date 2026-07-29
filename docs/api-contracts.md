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
/contribution-proposals
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
PATCH /contributors/profiles/me
PUT /contributors/profiles/me/avatar
GET /contributors/profile-fields
GET /contributors/experience-levels
GET /contributors/profiles/:username
GET /contributors/profiles/:username/avatar
```

Both endpoints require:

```text
Authorization: Bearer <accessToken>
```

All endpoints above require the access token except the avatar image read and
`GET /contributors/experience-levels`, which are public. Experience levels are
public because registration step 3 collects a selection before an account or
session exists; profile-fields stays authenticated since it is only read from
the authenticated settings/registration-completion flow (looked up by key
after signup, not rendered pre-auth). `PATCH` accepts any subset of `bio`,
`availability`, `experienceLevelId`, `fieldIds`, and `declaredSkills`.
`experienceLevelId` must reference an active option returned by
`GET /contributors/experience-levels`; `fieldIds` must reference active options
returned by `GET /contributors/profile-fields`.

`PUT /contributors/profiles/me/avatar` accepts multipart field `file`; PNG,
JPEG, and WebP are validated by file signature and limited to 2 MB. An explicit
profile avatar takes precedence over OAuth provider avatars and remains in use
until the contributor uploads another image.

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
  "experienceLevel": null,
  "fields": [],
  "declaredSkills": [],
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
  "completionPrompts": ["add_bio", "add_experience", "add_fields", "generate_skills", "connect_github"],
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

Admin field catalog endpoints require an active admin. `POST
/admin/contributor-fields` creates a stable kebab-case key with Arabic and
English labels and optional sort order. `PATCH /admin/contributor-fields/:id`
updates labels, sort order, or active state. Deactivated fields stop appearing
in profile responses and as selectable options; catalog rows are retained so
the option can be reactivated without recreating its identity.

Admin experience-level catalog endpoints (`GET|POST /admin/experience-levels`,
`PATCH /admin/experience-levels/:levelId`) follow the identical contract and
require an active admin. The active catalog is exposed publicly through
`GET /contributors/experience-levels` and drives both the registration step-3
experience selector and the profile-settings experience dropdown.

`GET /admin/published-project-owners` requires an active admin and returns up to
10 owners ordered by latest publication. Each row contains `ownerId`,
`ownerName`, `ownerEmail`, `publishedProjectsCount`, `latestPublishedAt`, and
`latestProject` (`id`, `title`, and `githubRepoUrl`). The projects module owns
the query; the admin controller only exposes the protected route.

Google and GitHub social auth are direct signup/signin flows. The frontend calls
`GET /auth/{provider}/start?role=owner|contributor`, redirects the browser to
`authorizationUrl`, then completes with the provider `code` and Share-k `state`
through `GET` or `POST /auth/{provider}/callback`.

GitHub start responses include `prompt=select_account` in the provider
authorization URL for both social identity and repository-connection flows.
When the selected GitHub identity already belongs to another Sharek user, the
backend keeps returning `409 GITHUB_ACCOUNT_TAKEN`; the frontend explains the
conflict and offers to reopen the account picker without logging out the
currently authenticated Sharek user.

The `role` query parameter is used only when the backend must create a new
Share-k user. Existing users keep their saved role. GitHub sign-in resolves an
existing user only by GitHub's immutable numeric account ID, through either the
social-provider link or the exact repository-connected GitHub account. A
matching provider email does not authenticate or silently link a different
GitHub identity. An unrecognized GitHub identity whose verified email is
already registered returns `409 GITHUB_SIGN_IN_EMAIL_CONFLICT`. A historical
social link that disagrees with the user's repository-connected GitHub ID
returns `409 GITHUB_AUTH_ACCOUNT_MISMATCH`. Google retains verified-email
linking behavior. GitHub social auth is identity-only and requests the minimal
GitHub `read:user user:email` scope. It must not request private repository
access or mark the repository-evidence connection as complete. Contributors
grant repository access later through `GET /github/oauth/start` during
onboarding/profile setup.

## GitHub Connection Contracts

Implemented GitHub connection endpoints:

```text
GET /github/oauth/start
GET /github/oauth/callback
POST /github/oauth/callback
GET /auth/github/callback/repository
POST /auth/github/account/callback
DELETE /auth/github/account
GET /github/account
GET /github/repositories
GET /github/readme
GET /github/repository/description
GET /github/repository/statistics
GET /github/repository/contribution-activity
GET /github/repository/commit-signals
DELETE /github/account
GET /projects/discover
GET /projects/me
POST /projects/github/preview
POST /projects
GET|PATCH /projects/me/:projectId
POST /projects/me/:projectId/source/refresh
POST /projects/me/:projectId/publish
POST /projects/me/:projectId/archive
GET /public/projects
GET /public/projects/:projectSlug
```

`GET /github/oauth/start` requires an authenticated Share-k user. It stores a
short-lived OAuth state and returns the GitHub authorization URL. Browser flows
use `GET /auth/github/callback/repository` as the GitHub redirect URI; that
endpoint forwards the browser to the frontend `/auth/callback` page so the SPA
can complete the authenticated connection with `POST
/auth/github/account/callback`. That endpoint verifies the OAuth state belongs
to the authenticated user, rejects a GitHub ID owned by another Sharek user,
stores the repository connection, and replaces that user's stale GitHub social
provider link with the selected immutable GitHub ID. Contributor OAuth requests
the GitHub `repo` scope so Share-k can read public and private repository
evidence after explicit GitHub consent. Owner/admin OAuth keeps the lighter
`public_repo` scope for the project-import shortcut. The older `POST
/github/oauth/callback` remains available for compatibility but does not perform
identity-link reconciliation.

The callback validates the stored state, exchanges the GitHub code, fetches the
GitHub profile, and stores the linked account. GitHub access tokens are never
returned in API responses. Stored GitHub access and refresh tokens are encrypted
at rest with AES-256-GCM.

`DELETE /auth/github/account` is the unified authenticated disconnect route. It
removes both the GitHub repository connection and the identity-owned GitHub
provider link. It returns `409 GITHUB_DISCONNECT_WOULD_LOCK_ACCOUNT` when the
user has neither a password nor another social provider, preventing accidental
account lockout. `DELETE /github/account` remains the lower-level repository
connection removal route.

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

`GET /projects/discover` requires an authenticated `contributor`, `owner`, or
`admin` and returns the contributor discovery feed of published projects. It
accepts optional query parameters:

```text
GET /projects/discover?page=1&limit=12&technologies=TypeScript,NestJS&category=web&difficulty=intermediate&search=api
```

`page` (default 1) and `limit` (default 12, max 50) drive pagination.
`technologies` accepts a comma-separated list or repeated values and matches
projects whose technology stack contains any of them. `category` and
`difficulty` filter by the published enum values. `search` performs a
case-insensitive keyword match over project title and description. The response
only ever includes `status: "published"` projects; drafts and archived projects
are excluded:

```json
{
  "projects": [
    {
      "id": "project-id",
      "title": "sharek-api",
      "slug": "sharek-api",
      "description": "Backend service",
      "category": "web",
      "difficulty": "intermediate",
      "technologies": ["TypeScript", "PostgreSQL"],
      "tags": ["nestjs"],
      "languages": { "TypeScript": 1000 },
      "githubRepoUrl": "https://github.com/ITI-Sharek/sharek-api",
      "repoStatistics": { "stars": 5 },
      "publishedAt": "2026-07-20T00:00:00.000Z",
      "discoveryMetadata": {
        "source": "project",
        "sourceId": "project-id",
        "keywords": ["typescript", "postgresql", "nestjs", "web", "intermediate"],
        "semanticText": "sharek-api. Backend service. Technologies: TypeScript, PostgreSQL. Tags: nestjs. Category: web. Difficulty: intermediate"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 12, "total": 1, "totalPages": 1 },
  "appliedFilters": {
    "technologies": ["TypeScript", "NestJS"],
    "category": "web",
    "difficulty": "intermediate",
    "search": "api"
  }
}
```

`discoveryMetadata` mirrors the published-project metadata indexed into the RAG
store (TASK-2-05) and carries `source`/`sourceId` attribution so semantic
matches remain retrievable back to the project. Results are ordered by most
recently published first.

`GET /projects/me` requires an active authenticated `owner` or `contributor`
and returns the
current user's owner-project dashboard data:

```json
{
  "projects": [
    {
      "id": "project-id",
      "title": "sharek-api",
      "slug": "sharek-api",
      "status": "draft",
      "revision": 1,
      "openRequestsCount": 0,
      "pendingApplicationsCount": 0,
      "lastActivityLabel": "اليوم"
    }
  ],
  "quota": {
    "used": 0,
    "monthlyLimit": 10
  },
  "pageInfo": { "nextCursor": null, "hasNextPage": false }
}
```

The response includes all projects owned by the authenticated owner, including
drafts. It is an owner workspace endpoint, not contributor discovery. Contributor
discovery must continue to filter on published projects only. `quota.used`
counts Contribution Requests whose `published_at` falls in the current UTC
calendar month, including Requests later cancelled. `monthlyLimit` is the
caller's current owner entitlement: Bronze 10, Silver 20, Gold 30; no active
assignment defaults to Bronze.

The canonical publication workflow separates source inspection, persistence,
and public state:

```text
POST /projects/github/preview
POST /projects
GET|PATCH /projects/me/:projectId
POST /projects/me/:projectId/source/refresh
POST /projects/me/:projectId/publish
POST /projects/me/:projectId/archive
GET /public/projects
GET /public/projects/:projectSlug
```

Preview accepts `{ "repositoryReference": "owner/repository" }` and writes no
Project. Creating the confirmed draft requires `Idempotency-Key` and accepts the
preview fingerprint plus optional owner presentation fields; it never accepts
`ownerId` or `status` and always creates `draft`. PATCH/refresh/publish/archive
also require `Idempotency-Key`, and mutable commands require
`expectedRevision`.

```json
{
  "source": {
    "provider": "github",
    "repositoryReference": "owner/repository",
    "previewFingerprint": "64-character-sha256"
  },
  "project": {
    "title": "Reviewed project title",
    "category": "web",
    "difficulty": "intermediate"
  }
}
```

Publication requires a non-empty title, category, difficulty, current source
identity, and verified control. A personal repository matches the immutable
GitHub social identity; organization/shared control requires a live GitHub App
link and explicit repository selection. Public queries enforce
`status = published` in Prisma and redact private source attribution.

`POST /projects/import/github` is retained only as a safe compatibility error:
it returns `410 PROJECT_IMPORT_ROUTE_RETIRED`, names the preview/create
replacements, and performs no create, refresh, or publish write.

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

## Contribution Request Draft Contracts

Implemented private-draft endpoints:

```text
GET   /projects/:projectId/contribution-requests
POST  /projects/:projectId/contribution-requests
GET   /contribution-requests/:requestId
PATCH /contribution-requests/:requestId
POST  /contribution-requests/:requestId/discard
```

All endpoints require an authenticated active account. The backend derives the
owner from the bearer session. Only the owner of the referenced published
Project can create a draft, and only that owner can inspect, update, or discard
it. Unknown and other-owner resources use the same non-enumerating 404.

The Project-scoped GET is the canonical owner workspace read. It remains
available for an owned archived Project and returns every lifecycle bucket,
including empty buckets:

```json
{
  "projectId": "project-uuid",
  "totalCount": 2,
  "byStatus": {
    "draft": [{ "id": "request-uuid", "status": "draft" }],
    "published": [{ "id": "request-uuid", "status": "published" }],
    "assigned": [],
    "completed": [],
    "cancelled": [],
    "discarded": []
  }
}
```

Items use the full owner-safe `ContributionRequestDto` shape and are ordered by
most recently updated first within each group.

Create accepts:

```json
{
  "title": "Build a webhook delivery viewer",
  "description": "Implement the owner-facing viewer and focused tests.",
  "requiredRequirements": [
    { "text": "Deliver tested NestJS endpoints" }
  ],
  "preferredRequirements": [
    { "text": "Document REST Client examples" }
  ],
  "technologyTags": ["NestJS", "PostgreSQL"],
  "applicationsCloseTime": "2030-03-10T12:00:00.000Z",
  "targetCompletionDate": "2030-03-20",
  "difficulty": "intermediate",
  "reward": 150,
  "rewardCurrency": "USD"
}
```

Required and Preferred Requirements are distinct ordered collections; their
response `position` values are zero-based. Technology tags do not qualify as
Requirements. `targetCompletionDate`, `difficulty`, and the reward pair are
optional. If either reward field is supplied, both are required. Applications
Close Time must be future-dated, and Target Completion Date must be later.

Create, update, and discard accept an optional `Idempotency-Key` header (8-128
safe ASCII characters). Same-key/same-command retries return the current
request; same-key/different-command retries return
`CONTRIBUTION_REQUEST_IDEMPOTENCY_CONFLICT`.

`POST /contribution-requests/:requestId/discard` optionally accepts
`{ "reason": "..." }`. It returns 200. Repeated discard is successful and does
not create duplicate audit history. Discarded requests cannot be updated.

Stable domain errors include:

```text
CONTRIBUTION_REQUEST_OWNER_ACCESS_REQUIRED
CONTRIBUTION_REQUEST_PROJECT_NOT_FOUND
CONTRIBUTION_REQUEST_PROJECT_NOT_PUBLISHED
CONTRIBUTION_REQUEST_NOT_FOUND
CONTRIBUTION_REQUEST_UPDATE_EMPTY
CONTRIBUTION_REQUEST_DRAFT_NOT_EDITABLE
CONTRIBUTION_REQUEST_REQUIRED_REQUIREMENT_MISSING
CONTRIBUTION_REQUEST_REQUIREMENT_INPUT_INVALID
CONTRIBUTION_REQUEST_REQUIREMENT_DUPLICATE
CONTRIBUTION_REQUEST_CLOSE_TIME_REQUIRED
CONTRIBUTION_REQUEST_CLOSE_TIME_INVALID
CONTRIBUTION_REQUEST_DATE_ORDER_INVALID
CONTRIBUTION_REQUEST_REWARD_INVALID
CONTRIBUTION_REQUEST_CONCURRENT_MODIFICATION
CONTRIBUTION_REQUEST_IDEMPOTENCY_KEY_INVALID
CONTRIBUTION_REQUEST_IDEMPOTENCY_CONFLICT
```

## Contribution Request Public Lifecycle

Owner commands require an authenticated active `owner`, an owned published
Project, and an optional 8-128 character `Idempotency-Key`:

```text
POST /contribution-requests/:requestId/publish
POST /contribution-requests/:requestId/cancel
```

Publication is the only `draft -> published` path. It revalidates the complete
work contract and Applications Close Time, then enforces the current owner plan
against publications in the current UTC calendar month. Owners without a
current plan assignment use Bronze. Limits are Bronze 10, Silver 20, and Gold
30. Cancelled Requests still count in the month in which they were published.

Cancellation accepts optional `{ "reason": "..." }`, preserves the Request,
and atomically changes every `PENDING_OWNER_REVIEW` Application to
`REQUEST_CANCELLED`. Existing terminal Applications and all snapshots/audits
remain unchanged. Cancellation remains available to the owning owner after the
parent Project is archived, preventing pending Applications from being
stranded. The Request audit and all resulting Application audits share a
correlation ID; each child audit points to the Request audit as its cause and
retains the supplied reason.

Public, unauthenticated reads keep the compatible `/tasks` transport path:

```text
GET /tasks?q=webhook&technologies=NestJS,PostgreSQL&difficulty=intermediate&hasReward=true
GET /tasks/:requestId
```

Both reads expose only `published` Requests whose Applications Close Time is
strictly in the future and whose parent Project remains published. Draft,
discarded, cancelled, assigned, completed, closed, and Requests on archived
Projects never appear and public detail returns the same
`CONTRIBUTION_REQUEST_NOT_FOUND` response for all of them.

The feed returns:

```json
{
  "items": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "projectName": "Share-k Backend",
      "projectSlug": "share-k-backend",
      "title": "Build a webhook viewer",
      "technologyTags": ["NestJS", "PostgreSQL"],
      "difficulty": "intermediate",
      "applicationsCloseAt": "2030-03-10T12:00:00.000Z",
      "targetCompletionDate": "2030-03-20",
      "reward": { "amount": 150, "currency": "USD" }
    }
  ],
  "totalCount": 1,
  "technologyFacets": ["NestJS", "PostgreSQL"]
}
```

`q` searches Request title/description and Project title. `technologies` accepts
repeated or comma-separated values and matches any tag. `difficulty` accepts
`beginner`, `intermediate`, or `advanced`; `hasReward` is boolean. Detail adds
`description`, `status: "published"`, and ordered `requirements`, each with
`classification: "required" | "preferred"`.

Additional stable lifecycle errors are:

```text
CONTRIBUTION_REQUEST_DRAFT_NOT_PUBLISHABLE
CONTRIBUTION_REQUEST_LIMIT_REACHED
CONTRIBUTION_REQUEST_NOT_CANCELLABLE
```

## Skill Profile Contracts

Implemented contributor skill profile generation endpoints:

```text
POST /skill-profiles/me/generations
GET /skill-profiles/me/generations/latest
GET /skill-profiles/me/generations/:generationId
POST /skill-profiles/me/generations/:generationId/retry
```

Both endpoints require an authenticated contributor. Pending contributors may
use these endpoints during onboarding. Owner/admin users and suspended or
deactivated contributors cannot start generation.

`POST /skill-profiles/me/generations` accepts immutable repository IDs from an
owned GitHub App installation link plus current explicit consent:

```json
{
  "installationLinkId": "00000000-0000-4000-8000-000000000001",
  "repositoryIds": ["123456789"],
  "consent": {
    "accepted": true,
    "version": "github-skill-analysis-v1"
  }
}
```

The backend revalidates the member, installation link, and selected repository
IDs through GitHub before creating the durable generation. Display names are
server-derived snapshots and are not accepted as authorization input.

Rules:

- `repositoryIds` must contain at least one numeric GitHub repository ID.
- At most 10 repositories can be selected for one generation.
- Repository IDs must be unique and currently selected for the installation.
- Consent must be accepted with version `github-skill-analysis-v1`.
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
  "installationLinkId": "00000000-0000-4000-8000-000000000001",
  "selectedRepositories": [
    { "repositoryId": "123456789", "fullName": "owner/repository" }
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

`GET /skill-profiles/me/generations/latest` recovers the authenticated user's
newest generation after a reload. `GET
/skill-profiles/me/generations/:generationId` returns a known owned generation.
Both return the same shape with current status. A duplicate start returns
`SKILL_PROFILE_GENERATION_ALREADY_ACTIVE` with
`metadata.generationId` so polling can resume. Status values are:

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

## GitHub App repository evidence

Repository evidence is optional and is authorized separately from GitHub social
login. The GitHub App requests only Metadata read and Contents read for selected
repositories. Installation alone never creates a skill generation.

```text
POST   /github/app/installations/start
GET    /auth/github/app/callback
GET    /github/app/installations/attempts/:attemptId
POST   /github/app/installations/callback
GET    /github/app/installations
GET    /github/app/repositories?installationLinkId=<uuid>&page=1&perPage=30
DELETE /github/app/installations/:installationLinkId
POST   /webhooks/github/app
```

The browser callback exchanges the single-use provider code on the backend and
redirects with only `attemptId` or a stable error code. The authenticated
attempt endpoint returns safe provider installation candidates for that owned,
unexpired, unconsumed attempt. Protected completion accepts the opaque attempt
plus one candidate provider installation ID and revalidates access. Installation
and repository responses are allowlisted and never include credentials or raw
provider payloads.

Generation now requires an owned active installation link, immutable GitHub
repository IDs, and current explicit consent:

```json
{
  "installationLinkId": "00000000-0000-4000-8000-000000000001",
  "repositoryIds": ["123456789"],
  "consent": {
    "accepted": true,
    "version": "github-skill-analysis-v1"
  }
}
```

`POST /skill-profiles/me/generations/:generationId/retry` accepts a new
`consent` object and creates a new generation only when the owned prior
generation is `failed` or `needs_more_evidence`. Access is revalidated.
`GET /skill-profiles/me/generations/latest` provides reload recovery. A duplicate
start includes the active `generationId` in the error envelope metadata.

Stable errors include `GITHUB_APP_NOT_CONFIGURED`, `GITHUB_APP_STATE_INVALID`,
`GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED`,
`GITHUB_APP_REPOSITORY_NOT_SELECTED`,
`GITHUB_APP_WEBHOOK_SIGNATURE_INVALID`,
`SKILL_PROFILE_ANALYSIS_CONSENT_REQUIRED`, and
`SKILL_PROFILE_GENERATION_NOT_RETRYABLE`. After audited cutover, legacy private
repository OAuth routes fail with `GITHUB_REPOSITORY_OAUTH_MIGRATED`; anonymous
public-project import and identity-only GitHub login remain independent.

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

## Sprint 4 Applications (#50)

```http
POST /tasks/:taskId/applications
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "contributionApproach": "I will implement and test the NestJS workflow.",
  "proposedDeliveryDurationDays": 5,
  "idempotencyKey": "00000000-0000-4000-8000-000000000001"
}
```

Successful submission returns `201` with status `PENDING_OWNER_REVIEW`, fixed
Required/Preferred Requirement Snapshot, safe Evidence Summary, contributor
identity and profile context, and review timing. The Contribution Approach is
required and must contain 10 to 5000 characters. Evidence is limited to approved
skill summaries whose underlying repository evidence was collected under the
contributor’s explicit repository-selection consent; submission does not
authorize new evidence access. The submission transaction revalidates and locks
the active GitHub App link, installation, selected repositories, consent, and
matching generation before fixing the snapshot. Revoked or unverifiable legacy
evidence is omitted. The parent Project must also still be published.
Submission performs no AI or attempt-quota work.

```http
GET  /tasks/:taskId/applications
GET  /applications/:applicationId
POST /applications/:applicationId/withdraw
Idempotency-Key: 00000000-0000-4000-8000-000000000002
```

Owner reads are ownership-scoped. Detail also permits the applying contributor.
Withdrawal is contributor-owned and pending-only. Stable workflow errors include
`ALREADY_APPLIED`, `APPLICATIONS_CLOSED`, `REQUEST_CANCELLED`,
`REQUEST_TERMINAL`, `APPLICATION_NOT_AUTHORIZED`, `APPLICATION_TERMINAL`, and
`APPLICATION_IDEMPOTENCY_CONFLICT`.

## Sprint 4 Contribution Proposals (#55)

A Contribution Proposal is a private, contributor-authored suggestion of new
Project work. It is not an Application and grants no Assignment or selection
priority. All routes require an authenticated account; role, status, and
ownership are enforced by the service.

```http
POST /contribution-proposals
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "projectId": "22222222-2222-4222-8222-222222222222",
  "title": "Add a caching layer",
  "problemOrOpportunity": "The discovery feed repeats expensive repository-derived lookups.",
  "proposedOutcome": "Introduce a Redis cache with explicit invalidation on publication.",
  "projectBenefit": "Owners and contributors receive faster, more reliable discovery results.",
  "acknowledgesAttributionAndAssignmentDisclosure": true,
  "idempotencyKey": "00000000-0000-4000-8000-000000000003"
}
```

Submission returns `201` with a `PENDING` proposal, its immutable version 1, the
acknowledged disclosure, and an empty revision-request history. The Project must
be published with proposal intake enabled, the disclosure acknowledgement must be
`true`, and all four canonical proposal fields are required. `title` is 5–255
characters, `problemOrOpportunity` and `proposedOutcome` are 20–5000 characters,
and `projectBenefit` is 20–3000 characters. A contributor may hold only one
pending proposal per Project and is bounded by a daily submission limit. These
invariants are rechecked transactionally; a database partial unique index also
protects the pending-proposal rule under concurrency.

```http
GET  /contribution-proposals/mine?limit=20&cursor=<opaque>
GET  /contribution-proposals/for-project/:projectId?limit=20&cursor=<opaque>
GET  /contribution-proposals/:proposalId
PUT  /contribution-proposals/for-project/:projectId/intake
POST /contribution-proposals/:proposalId/versions
POST /contribution-proposals/:proposalId/revision-requests
POST /contribution-proposals/:proposalId/withdraw
Idempotency-Key: 00000000-0000-4000-8000-000000000004
```

`mine` is proposer-scoped; `for-project` and `intake` are Project-owner-scoped;
both lists return `proposals` plus `pageInfo.hasNextPage` and an opaque
`pageInfo.nextCursor`. Detail permits only the proposer and the Project owner. A new version can be
submitted only by the proposer and only to answer an outstanding owner revision
request. A revision request is an owner-only append-only action that never edits
contributor-authored content. Withdrawal is proposer-owned and pending-only.
Pending proposals never expire and consume no Application or subscription quota.
Stable workflow errors include `PROPOSAL_PROJECT_NOT_PUBLISHED`,
`PROPOSAL_INTAKE_DISABLED`, `PROPOSAL_RATE_LIMITED`, `PROPOSAL_ALREADY_PENDING`,
`PROPOSAL_NO_REVISION_REQUESTED`, `PROPOSAL_TERMINAL`, `PROPOSAL_NOT_AUTHORIZED`,
`PROPOSAL_NOT_FOUND`, `PROPOSAL_CURSOR_INVALID`,
`PROPOSAL_CONCURRENT_MODIFICATION`, and `PROPOSAL_IDEMPOTENCY_CONFLICT`.

## Contract Change Rules

- Breaking API changes require frontend coordination.
- AI service output schema changes require backend and FastAPI contract tests.
- DTO changes must be reflected in docs or generated OpenAPI.
- Contract drift should be caught by integration or contract tests.
