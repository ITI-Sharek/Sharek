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
PATCH /auth/me/password
PATCH /auth/me/email
PATCH /auth/me/username
PATCH /auth/me/details
PATCH /auth/me/phone
PATCH /auth/me/privacy
PUT /auth/me/identity-document
GET /auth/me/export
PATCH /auth/users/:id/role
```

Registration supports these public roles:

```text
owner
contributor
```

`admin` is reserved for role assignment by an authenticated admin.

Social OAuth start requests require `role=owner|contributor` and
`intent=login|register`. The one-time state persists that intent and the
callback enforces it: `login` returns `404 SOCIAL_AUTH_ACCOUNT_NOT_FOUND` for
an unknown provider identity, while `register` returns
`409 SOCIAL_AUTH_ACCOUNT_ALREADY_EXISTS` for an already linked provider
identity. The role is used only if an allowed registration creates a new user.
GitHub identity authentication remains separate from repository authorization.

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
`GET /contributors/experience-levels`; `fieldIds` must reference active fields
returned by `GET /contributors/profile-fields`. The field response remains a
flat list for update/registration compatibility and includes `categoryId` plus
the bilingual `category` object for grouped rendering.

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
    "reviewsCount": 0,
    "completedContributions": 0,
    "totalAssignedTasks": 0,
    "successRate": 0,
    "topVerifiedSkills": []
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

Admin field catalog endpoints require an active admin. Categories are managed
through `GET|POST /admin/contributor-field-categories` and
`PATCH /admin/contributor-field-categories/:categoryId`; fields are managed
through `GET|POST /admin/contributor-fields` and
`PATCH /admin/contributor-fields/:id`. A field creation request requires a
`categoryId`. Both categories and fields use stable kebab-case keys, bilingual
labels, sort order, and soft active/inactive state. Inactive categories hide
their fields from contributors; inactive fields stop appearing as selectable
options. Rows are retained so they can be reactivated without recreating their
identity.

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
caller's current owner entitlement: Free 5, Gold 30; no active assignment
defaults to Free.

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
`expectedRevision`. All `:projectId` values on owner routes must be UUIDv4, and
project titles are trimmed before the non-empty length validation is applied.

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

## Contribution Request Required Skill Levels

Owner-only, authenticated, and editable **only while the Request is a draft**
(DEC-078, ADR 0015):

```text
GET /contribution-requests/:requestId/skill-requirements
PUT /contribution-requests/:requestId/skill-requirements
```

`PUT` replaces the whole set. A partial patch would make "remove the last
required skill" unexpressible, and the owner is editing a short list they can
see in full. Request body:

```json
{
  "skillRequirements": [
    { "skillName": "NestJS", "requiredLevel": "intermediate", "kind": "required" },
    { "skillName": "PostgreSQL", "requiredLevel": "beginner", "kind": "preferred" }
  ]
}
```

`requiredLevel` is `beginner | intermediate | advanced` — the same vocabulary
as a contributor's approved skill proficiency, because both sides of the
eligibility comparison must share one scale. `kind` is `required | preferred`;
only `required` rows will ever block a submission.

`source` and `confidence` are **not accepted** on input and are rejected with
`400`. Every owner write is recorded as `source: owner_override` with
`confidence: null`, so a later inference run can tell a human correction from
its own earlier output and must not overwrite it.

The response is the stored set, ordered `required` first then `preferred`, each
by position, and carries `source` and `confidence` for the owner. The **public**
Request detail (`GET /tasks/:requestId`) exposes `skillName`, `requiredLevel`,
and `kind` only — never `confidence`, `source`, or any model identifier.

At most 15 skills. Duplicates are detected on the *normalized* name, so
`Node.js` and `nodejs` are one skill.

```text
REQUEST_SKILL_REQUIREMENTS_FROZEN        409  the Request is no longer a draft
REQUEST_SKILL_REQUIREMENTS_TOO_MANY      422  more than 15 rows
REQUEST_SKILL_REQUIREMENT_DUPLICATE      422  two spellings of one skill
REQUEST_SKILL_REQUIREMENT_NAME_INVALID   422  a name with no letters or digits
```

The set **freezes at publication** and is copied into the Application's
Requirement Snapshot at submission, so editing a later draft can never change
why an earlier contributor was refused.

Rows may also arrive from inference (DEC-078). Creating or editing a draft
queues a background run against the AI service; the owner DTO carries
`skillInferenceStatus` (`not_started | pending | succeeded | failed`) and
`skillInferenceRanAt` so a client can explain an empty list. A `failed` status
is retriable and leaves the draft editable — a provider outage never blocks
authoring, and the owner can always write the set through the `PUT` above. An
owner write always wins over a later inference run.

**Publication requires at least one `required` skill row.** Without it the
Request has no bar, so every contributor would pass:

```text
REQUEST_SKILL_REQUIREMENTS_MISSING  422  no required skill row; carries skillInferenceStatus
```

`preferred` rows do not satisfy it.

## Eligibility Gate

```text
GET /tasks/:requestId/eligibility
```

Authenticated, and always the caller's own eligibility — there is no path to ask
about anyone else. Returns the whole bar, not just the failures, so a
contributor can see what is being asked before committing to a form:

```json
{
  "contributionRequestId": "...",
  "outcome": "blocked",
  "blockingSkills": [
    { "skillName": "react", "requiredLevel": "advanced", "contributorLevel": "beginner" }
  ],
  "requiredSkills": [
    { "skillName": "react", "requiredLevel": "advanced", "contributorLevel": "beginner", "met": false }
  ]
}
```

`contributorLevel` is `null` when the contributor holds no approved evidence for
that skill at all — a different situation from holding it too low, and one the
UI must render differently because the recovery advice differs.

**This endpoint is advisory.** Its verdict is never trusted at submission; the
comparison is recomputed inside the submission transaction against the same
locked rows. A contributor whose approval is revoked between the two calls is
still blocked. An unpublished or unknown Request returns the same
`CONTRIBUTION_REQUEST_NOT_FOUND` as the public detail route.

`POST /tasks/:requestId/applications` may now return:

```text
APPLICATION_BLOCKED_SKILL_GAP  403  metadata.blockingSkills as above;
                                      metadata.eligibilityEvaluationId identifies
                                      the recorded refusal used for guidance
```

The block happens **before an Application row exists**, so no Application status
was added and every superseded AI-gate status stays deleted. A blocked attempt
creates no Application, no snapshot, no Application audit row, and **consumes no
daily Application slot** (DEC-079). It records exactly one `EligibilityEvaluation`
with `outcome: blocked`.

Only `required` skill rows can block; `preferred` rows are advisory. Pending,
rejected, and disputed skills never count toward the bar. Approving a higher
level flips the verdict with no other action.

### The Proposal path (P0-B04)

The same gate applies to `POST /contribution-proposals` and
`POST /contribution-proposals/:proposalId/versions`. A proposer has no
owner-authored Request to be measured against, so the bar is inferred from the
**proposal content** and compared against their approved skills by the same
comparison:

```text
PROPOSAL_BLOCKED_SKILL_GAP      403  metadata.blockingSkills, identical shape
PROPOSAL_ELIGIBILITY_UNAVAILABLE 503  metadata.retriable: true
```

A blocked create leaves **no** Proposal row, version row, or audit row. A
blocked new version leaves the prior version as the latest.

**Inference failure fails open** with the 503, never a block — distinguishable
from a refusal by both code and status. The Application path has no equivalent
because its bar is already frozen on the Request and needs no provider at submit
time; here the provider is on the critical path, and an outage presented as a
skill judgement would be a false statement the proposer cannot appeal.

A blocked create records no `EligibilityEvaluation`: the CHECK permits exactly
one target and the Proposal was never created. The 403 still names every
blocking skill. A blocked version does record one.

## Block-triggered Skill-Gap Guidance

The ADR 0014 contributor-requested route is unchanged. These are additional,
scoped to a recorded block (DEC-078, `P0-B05`):

```text
POST /contributors/me/eligibility-guidance      { eligibilityEvaluationId }
GET  /contributors/me/eligibility-guidance      ?cursor&limit
GET  /contributors/me/eligibility-guidance/:id
```

`POST` **returns immediately**, without waiting for the provider:

```json
{
  "id": "...",
  "eligibilityEvaluationId": "...",
  "status": "pending",
  "blockingSkills": [
    { "skillName": "react", "requiredLevel": "advanced", "contributorLevel": "beginner" }
  ],
  "narrative": null,
  "recommendations": null
}
```

`status` moves once, to `ready` or `failed`. **`blockingSkills` is present in
every state** — failure removes the narrative, never the reason, so a
contributor is never told only "you are blocked" with no explanation.

Re-requesting while one is `pending` or `ready` returns the existing row. A
`failed` row is not reused, so a retry after a provider outage is possible.

Guidance is scoped to an eligibility evaluation rather than an Application,
because under a hard block no Application exists. It is **never tier-gated**
(DEC-076).

`GET` (list) is keyset-paginated on `created_at desc, id desc` and returns
`pageInfo { hasNextPage, nextCursor }`. Cursors are base64url and strictly
validated.

```text
ELIGIBILITY_GUIDANCE_NOT_FOUND        404  unknown id, another contributor, or an owner
ELIGIBILITY_GUIDANCE_NOT_BLOCKED      400  the evaluation was `eligible`
ELIGIBILITY_GUIDANCE_CURSOR_INVALID   400  tampered cursor
SKILL_GAP_GUIDANCE_FORBIDDEN          403  not an active contributor
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
current plan assignment use Free. Limits are Free 5 and Gold 30. Cancelled
Requests still count in the month in which they were published.
For local QA only, `NODE_ENV=development` bypasses the enforcement check while
leaving the entitlement and usage data unchanged; test and production retain
the limits.

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
the shared `/realtime` publisher accepted the envelope handoff after the
Notification row/event committed. `false` does not mean notification failure;
the durable row and event remain available to the inbox and recovery worker.

## Durable Notification HTTP Contract

All Notification routes require the existing access token and derive the
recipient from the authenticated session. Responses use the current identity
language and never expose recipient IDs, raw parameters, deduplication keys, or
publication metadata.

```text
GET   /notifications?cursor=<opaque>&limit=20&readState=unread&type=application_status
GET   /notifications/unread-count[?type=conversation_activity]
PATCH /notifications/:notificationId/read-state       { "state": "read" }
POST  /notifications/mark-all-read                   {}
GET   /me/notification-preferences
PATCH /me/notification-preferences
PATCH /auth/me/preferences                            { "preferredLanguage": "ar" }
```

List pagination uses a stable opaque `(created_at,id)` cursor and supports
`readState=read|unread` plus the known Notification type filter. Read-state
commands are idempotent and conceal malformed, missing, expired, and
other-user Notification IDs with `NOTIFICATION_NOT_FOUND`. Mark-all-read uses
a caller-scoped timestamp snapshot and emits one durable read-state event per
changed Notification.

Notification preferences own retention, overnight quiet hours, sparse category
overrides, and optimistic `revision` checks. Required in-app categories cannot
be disabled. Language remains identity-owned, accepts only `ar|en`, and is
idempotent when the requested value already matches the current user.

## Assignment Conversation HTTP Contract

Assignment acceptance creates the private conversation atomically with the
Assignment. There is no public create-conversation route. Every route below
rechecks that the authenticated user is the Assignment's Project owner or
assigned contributor:

```text
GET  /assignment-conversations?cursor=<opaque>&limit=20
GET  /assignment-conversations/:conversationId
GET  /assignment-conversations/:conversationId/messages?cursor=<opaque>&limit=20&query=<text>
POST /assignment-conversations/:conversationId/messages
     { "idempotencyKey": "message-command-001", "body": "plain text" }
```

Message sends are durable before any realtime publication, replay the original
result for the same sender/conversation/idempotency key, and reject blank or
over-4,000-Unicode-character bodies. Unauthorized or missing conversations
are concealed as `ASSIGNMENT_CONVERSATION_NOT_FOUND`; a future terminal state
uses `ASSIGNMENT_CONVERSATION_READ_ONLY`.

Conversation responses include `ownerName` and `contributorName`; Message
responses and realtime payloads include the persisted `senderName`. Clients
must use these names, together with the authenticated sender ID, to render the
participant header and own/other message treatment rather than deriving names
from Assignment or conversation identifiers.

Every newly committed Message also appends one stable outbox event in the same
transaction. After commit, both authorized participants receive:

```json
{
  "eventId": "uuid",
  "type": "conversation.message.created",
  "version": 1,
  "occurredAt": "2026-08-09T12:03:00.000Z",
  "aggregateId": "conversation-uuid",
  "aggregateVersion": 2,
  "payload": {
    "message": {
      "messageId": "message-uuid",
      "conversationId": "conversation-uuid",
      "sequence": 2,
      "senderId": "user-uuid",
      "senderName": "Contributor Name",
      "body": "plain text",
      "replyToMessageId": null,
      "createdAt": "2026-08-09T12:03:00.000Z",
      "editedAt": null,
      "retractedAt": null
    }
  }
}
```

Events may repeat. Clients deduplicate by `eventId` and `messageId`; a Message
sequence gap triggers an authorized HTTP history reconciliation.

The recipient (the other Assignment participant) also receives a durable
`conversation_activity` Notification for the unread Message burst. Later
messages update that same unread conversation notification's count/latest
preview; once it is read, a later message starts a new burst. Its deep link is
`/messages?conversation=<conversationId>`, and its unread count is available
through `GET /notifications/unread-count?type=conversation_activity` for the
Messages shell badge. Notification and message event publication are
best-effort after the PostgreSQL commit; the durable rows/events remain the
authority during reconnect or transport failure.

## Real-Time Shared Socket Contract

The shared transport exposes the authenticated Socket.IO namespace `/realtime`
with WebSocket transport only:

```ts
io(`${API_URL}/realtime`, {
  auth: { token: accessToken },
  transports: ["websocket"],
});
```

`auth.token` may be either the raw access token or `Bearer <token>`. The gateway
also accepts an `Authorization: Bearer <token>` header for non-browser clients.
Active users and pending contributors may connect. Invalid, expired, revoked,
suspended, and deactivated sessions receive `realtime.error` before disconnect:

```json
{
  "code": "REALTIME_UNAUTHORIZED",
  "message": "Invalid or expired session"
}
```

The gateway joins each socket only to `user:<authenticated-user-id>`. Persisted
created/read-state events are emitted as their complete version-one envelope.
Current durable types are `notification.created`,
`notification.read_state_changed`, and `conversation.message.created`; clients
deduplicate event IDs and reconcile aggregate gaps through HTTP.
`REALTIME_NOTIFICATIONS_ENABLED` defaults to false during rollout. The legacy
`/notifications` namespace has been retired; clients must use `/realtime`.

## AI Service Contracts

## GitHub App repository evidence

Repository evidence is optional and its read consent is authorized separately
from GitHub social login. Both flows must resolve to the same immutable GitHub
user ID: the account authorizing the GitHub App must be the account linked to the
authenticated Sharek user. The GitHub App requests only Metadata read and
Contents read for selected repositories. Installation alone never creates a
skill generation.

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
plus one candidate provider installation ID and revalidates both the immutable
GitHub identity match and current installation access. Every later repository
read repeats the identity check before provider access. Installation and
repository responses are allowlisted and never include credentials or raw
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
`GITHUB_APP_IDENTITY_REQUIRED`, `GITHUB_APP_ACCOUNT_MISMATCH`,
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
Submission performs no AI work. It does consume one of the contributor's daily
Applications: free contributors get 1 per UTC day and Gold contributors 5, both
resolved through the subscriptions module. Exceeding the allowance returns
`409 APPLICATION_DAILY_LIMIT_REACHED` with `used`, `limit`, and `resetsAt` — the
exact UTC instant the allowance refills. Only a successfully created Application
spends a slot: a replay, a duplicate, or a closed Request costs nothing, and
withdrawal does not refund.

```http
GET  /tasks/:taskId/applications
GET  /applications/:applicationId
POST /applications/:applicationId/withdraw
Idempotency-Key: 00000000-0000-4000-8000-000000000002
```

Owner reads are ownership-scoped. Detail also permits the applying contributor.
Withdrawal is contributor-owned and pending-only. Stable workflow errors include
`ALREADY_APPLIED`, `APPLICATIONS_CLOSED`, `REQUEST_CANCELLED`,
`REQUEST_TERMINAL`, `APPLICATION_NOT_AUTHORIZED`, `APPLICATION_TERMINAL`,
`APPLICATION_DAILY_LIMIT_REACHED`, and `APPLICATION_IDEMPOTENCY_CONFLICT`.

Application detail includes nullable `ownerDecision` and `assignment` fields.
For a declined Application, the applying contributor receives the immutable
decision identifier and feedback needed to use the moderation-report route.
Authorized Application projections also include `reviewDueAt`, `expiresAt`,
nullable `expiredAt`, and `overdue`. `overdue` becomes true at the inclusive
day-5 boundary only while the Application remains `PENDING_OWNER_REVIEW`.

## AI service routes

The backend calls five FastAPI routes, one client each under
`src/modules/ai/integrations/`:

| Route | Client | Feature |
|---|---|---|
| `/advisory-fit/assess` | `advisory-fit.client.ts` | Advisory Fit Assessment |
| `/requirements/infer` | `requirement-inference.client.ts` | Required skill levels (P0) |
| `/material-analysis/analyze` | `material-analysis.client.ts` | Material Draft Suggestions |
| `/skill-gap-guidance/generate` | `skill-gap-guidance.client.ts` | Skill Gap Guidance |
| `/skill-profiles/generate` | `fastapi-skill-profile.client.ts` | Skill profile generation |

Four of the five read their path from an `AI_*_PATH` setting; the default is
what ships and is therefore what the AI service must serve.
`/skill-profiles/generate` is built inline from `AI_SERVICE_URL`.

`npm run test:ai-routes` asserts the AI service still serves all five. It reads
the live `/openapi.json` when `AI_SERVICE_URL` is reachable and falls back to
`docs/ai-service-routes.json` otherwise, failing if that manifest drifts from
the clients. Extra routes on the AI service are fine — only a route the backend
calls and the service does not serve is a failure.

This exists because a renamed route is invisible to both repositories'
mocked suites: `/advisory-fit/assess` was once renamed to `/advisory-fit/analyze`
on an AI branch while these clients still called `/assess`, and nothing failed
until the service was actually run.

## Phase 1 subscription status (#108)

```http
GET /me/subscription
Authorization: Bearer <owner or contributor access token>
```

Returns the caller's own resolved plan. The route takes no user parameter, so
there is no path through it to another user's subscription. An admin receives
`403 SUBSCRIPTION_ACCOUNT_NOT_ELIGIBLE`: an admin holds no plan in either role
context.

```json
{
  "roleContext": "contributor",
  "plan": "free",
  "status": "active",
  "source": "default",
  "usage": {
    "used": 0,
    "limit": 1,
    "periodStart": "2026-08-14T00:00:00.000Z",
    "periodEnd": "2026-08-15T00:00:00.000Z"
  },
  "benefits": [
    { "key": "CONTRIBUTOR_DAILY_APPLICATIONS", "state": "included", "label": "1 Application per day" },
    { "key": "CONTRIBUTOR_MATCHED_PROJECTS", "state": "unavailable", "label": "Matched projects" }
  ],
  "entitlements": [
    { "key": "PROJECT_MATERIAL_ANALYSIS", "state": "unavailable" }
  ]
}
```

A free user receives a complete payload, never a 404: the absence of a
subscription is a valid state.

`usage` is the window the `used` count is measured over, not the billing period
— a UTC calendar day of Applications for a contributor, a UTC calendar month of
published Contribution Requests for an owner. It is therefore present and
meaningful for free users, who have an allowance but no billing period.

`benefits` are server-authored, including the label, so the sentence a user
reads and the limit the backend enforces come from one place. Only the caller's
own role context is described. **No commission benefit is emitted in Phase 1**:
there are no paid tasks for a commission to apply to, and advertising a waiver
the user cannot benefit from would be advertising an unusable benefit.

`entitlements` reports `PROJECT_MATERIAL_ANALYSIS` exactly as the materials
command enforces it — both read the same resolution — so what a user is shown
and what they can do cannot drift apart.

## Phase 1 matched projects (#111)

```http
GET /contributors/me/recommended-tasks
Authorization: Bearer <contributor access token>
```

Gold contributors receive up to 10 ranked matches. A **free contributor
receives `200` with an empty list and `reason: MATCHING_REQUIRES_SUBSCRIPTION`,
not a `403`** — the route is legitimately theirs, and an error state is the
wrong thing for the UI to render when the correct answer is an upgrade prompt.
An owner receives `403 CONTRIBUTOR_RECOMMENDATIONS_NOT_AUTHORIZED`: matched
projects are a contributor benefit.

```json
{
  "planType": "gold",
  "reason": null,
  "recommendations": [
    {
      "requestId": "…",
      "projectName": "Share-k API",
      "title": "Build the ingestion worker",
      "rank": 1,
      "confidence": "HIGH",
      "justification": "Your approved NestJS and PostgreSQL match what this request asks for.",
      "matchedSkills": [
        { "name": "NestJS", "proficiency": "advanced", "evidenceIds": ["github:sharek/api"] }
      ],
      "applicationsCloseAt": "2026-09-01T00:00:00.000Z",
      "targetCompletionDate": null,
      "difficulty": "intermediate",
      "reward": null,
      "rewardCurrency": null
    }
  ]
}
```

**There is no `matchScore` and no percentage anywhere in this response.**
DEC-010 forbids presenting fit as a number; `rank` is an ordinal position and
`confidence` is a categorical band. Coverage is computed internally for ordering
and never leaves the backend as a number.

**Contributor recommendations are pull-only.** Publishing a Contribution
Request emits no notification to matching contributors, in either owner tier.
Owner-side auto-notification remains out of scope; the
`AiMatchResult.notification_sent` column that existed for it was dropped in
`20260814120000_drop_ai_match_notification_sent`.

The shortlist uses the Request's frozen required skill levels when present:
only contributors meeting every required `beginner < intermediate < advanced`
level are recommended. Preferred rows may explain a match but never make an
under-levelled contributor eligible. Legacy Requests without a stored skill bar
use the earlier normalized-name fallback.

Results are persisted to `AiMatchResult` with rank and matched skills.
Recomputing replaces the contributor's previous rows rather than accumulating
them. AI ranking is an optional re-order over the deterministic shortlist: if
no ranker is bound, or it fails, or it returns anything other than a
permutation of the shortlist, the deterministic order stands and the request
still succeeds.

## Gold owner contributor matching (DEC-080)

```http
POST /contribution-requests/:requestId/matches/generate
Authorization: Bearer <owner access token>
```

The Request must be published and owned by the caller. A Free owner receives
`403 OWNER_CONTRIBUTOR_MATCHING_PLAN_REQUIRED`; a Gold owner receives up to 10
advisory suggestions from the active contributors whose approved skills were
included in the backend-authorized candidate snapshot.

```json
{
  "requestId": "…",
  "planType": "gold",
  "resultLimit": 10,
  "status": "completed",
  "matches": [
    {
      "contributorId": "…",
      "contributorName": "Sara Ahmed",
      "contributorUsername": "sara",
      "rank": 1,
      "confidence": "HIGH",
      "justification": "Strong approved Node.js evidence.",
      "matchedSkills": [{ "name": "Node.js", "proficiency": "advanced" }]
    }
  ]
}
```

Provider scores and evidence IDs are validated inside the backend but do not
leave it. Generation is explicit and side-effect free: it does not invite,
assign, notify, or persist over the contributor recommendation rows.

## Sprint 4 Owner Decisions and Assignments (#51)

```http
POST /applications/:applicationId/accept
Authorization: Bearer <owner-access-token>
Idempotency-Key: 00000000-0000-4000-8000-000000000003
```

Acceptance returns `200` with the accepted Application, immutable accepted
Owner Decision (`feedback: null`), and the single Assignment. Assignment due
date is acceptance time plus the Application's Proposed Delivery Duration. The
Request becomes `ASSIGNED`; other pending Applications become `NOT_SELECTED`
without feedback or decline decisions.

```http
POST /applications/:applicationId/decline
Authorization: Bearer <owner-access-token>
Idempotency-Key: 00000000-0000-4000-8000-000000000004
Content-Type: application/json

{ "feedback": "  The approach needs a concrete test strategy.  " }
```

Decline feedback is trimmed before storage and must contain 1–2000 characters.
Missing, empty, or whitespace-only feedback fails with the stable top-level code
`APPLICATION_DECISION_FEEDBACK_REQUIRED`, including at the direct service seam.
Decline affects only
that Application and returns no Assignment. Stable decision errors include
`APPLICATION_TERMINAL`, `REQUEST_CANCELLED`, `REQUEST_TERMINAL`,
`APPLICATION_IDEMPOTENCY_KEY_REQUIRED`, and
`APPLICATION_IDEMPOTENCY_CONFLICT`.

```http
POST /owner-decisions/:ownerDecisionId/reports
Authorization: Bearer <contributor-access-token>
Content-Type: application/json

{
  "reason": "harassment",
  "description": "The decline feedback contains abusive language."
}
```

Only the contributor affected by an explicit declined decision can create the
linked moderation Report. Reporting returns `201`, does not change the
Application state, and is not an appeal. A duplicate returns
`OWNER_DECISION_REPORT_ALREADY_EXISTS`.

## Sprint 4 Application Review Window (#52)

There is no public scheduler route. A repeatable backend sweep uses the
persisted submission clock to produce these effects:

- day 3 inclusive: one durable reminder to the current Project owner;
- day 5 inclusive: `overdue: true` on authorized pending projections;
- day 7 inclusive: `EXPIRED`, a system-attributed audit, and one durable
  contributor notification.

Every scheduled write rechecks `PENDING_OWNER_REVIEW`; accepted, declined,
not-selected, withdrawn, request-cancelled, and already-expired Applications
are unchanged. Expiry is not an owner decline and changes no reputation,
eligibility, contributor profile, sibling Application, or Assignment data.
Queue retries, duplicate delivery, backend restarts, and a decision racing the
expiry boundary are handled idempotently from PostgreSQL state.

## Sprint 4 Advisory Fit Assessment (#53)

The current Project owner can request one advisory assessment for a pending
Application:

```http
POST /applications/:applicationId/assessment-requests
Authorization: Bearer <owner-access-token>
Content-Type: application/json

{ "idempotencyKey": "00000000-0000-4000-8000-000000000005" }
```

The endpoint returns `202` with the persisted assessment projection. The
request uses the Application's fixed Requirement and authorized Evidence
Snapshots. Reusing the same owner/key replays the request; a different active
request returns `ASSESSMENT_ALREADY_ACTIVE`. A technical or invalid provider
failure returns `UNAVAILABLE` with one immutable failed attempt, whose
`error_code` names the responsible party: `AI_ADVISORY_FIT_SERVICE_ERROR` and
`AI_ADVISORY_FIT_SERVICE_UNAVAILABLE` for transport and availability failures,
`AI_ADVISORY_FIT_RESPONSE_INVALID` for a malformed provider payload,
`AI_ADVISORY_FIT_COVERAGE_INCOMPLETE` when the provider does not cover every
requirement it was sent, and `ASSESSMENT_REQUIREMENT_SNAPSHOT_INVALID` when the
fault is in our own stored Requirement Snapshot rather than the provider.
Repeating the
POST with a new UUID idempotency key retries an unavailable request at most
once; the new attempt links to the prior attempt and a further retry returns
`ASSESSMENT_RETRY_LIMIT_REACHED`. A terminal Application returns
`APPLICATION_TERMINAL`.

Every assessment projection includes `attempts` and the server-derived
`retryAvailable` boolean. `retryAvailable` becomes true after the first
`UNAVAILABLE` provider attempt and for `NOT_STARTED_SYSTEM_LIMIT`, and false
after the single provider retry has been consumed. Clients must use this value
instead of duplicating the backend retry limit.

```http
GET  /applications/:applicationId/assessment
POST /applications/:applicationId/assessment/presentations
Authorization: Bearer <owner-access-token>
```

The read returns `NOT_REQUESTED`, `REQUESTED`, `COMPLETED`,
`NOT_STARTED_SYSTEM_LIMIT`, `NOT_STARTED_NO_ASSESSABLE_EVIDENCE`,
`CANCELLED_NOT_NEEDED`, or `UNAVAILABLE`. Completed responses contain one
validated finding per Requirement and a NestJS-derived `STRONG`, `PARTIAL`,
`LIMITED`, or `UNKNOWN` fit band. Preferred Requirements never affect the band.
Provider citations must be drawn from the supplied Evidence Snapshot; invalid
coverage, citations, or vocabulary are stored as `UNAVAILABLE` rather than
being shown as a valid assessment. The read is pure: it never writes, so it is
safe to prefetch, retry, or poll. Presentation is recorded only by an explicit
`POST /applications/:applicationId/assessment/presentations`, which is
append-only and idempotent under concurrent calls.
The assessment is advisory only and never hides, ranks, accepts, declines, or
transitions an Application.

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
and `projectBenefit` is 20–3000 characters. A contributor may hold **multiple**
pending proposals on the same Project; submissions are bounded only by a daily
limit of 10 per contributor (`PROPOSAL_DAILY_SUBMISSION_LIMIT`). These invariants
are rechecked transactionally, and concurrent submissions by the same contributor
are serialised by a `pg_advisory_xact_lock` held for the transaction.

Migration `20260730131000_allow_multiple_pending_proposals` removed the earlier
one-pending-proposal-per-Project rule together with the partial unique index that
enforced it, so no such database constraint exists.

```http
GET  /contribution-proposals/mine?limit=20&cursor=<opaque>
GET  /contribution-proposals/for-project/:projectId?limit=20&cursor=<opaque>
GET  /contribution-proposals/:proposalId
GET  /contribution-proposals/for-project/:projectId/intake
PUT  /contribution-proposals/for-project/:projectId/intake
POST /contribution-proposals/:proposalId/versions
POST /contribution-proposals/:proposalId/revision-requests
POST /contribution-proposals/:proposalId/withdraw
Idempotency-Key: 00000000-0000-4000-8000-000000000004
```

The owner response actions (S4-B10) close the loop:

```text
POST /contribution-proposals/:proposalId/accept
POST /contribution-proposals/:proposalId/decline
POST /contribution-proposals/:proposalId/misuse-reports
```

Both intake routes are Project-owner-scoped and return `{ projectId, enabled }`.
A Project with no stored intake row is accepting proposals, matching the column
default; the read reports that without creating the row, so it is safe to
prefetch and poll.

`mine` is proposer-scoped; `for-project` and `intake` are Project-owner-scoped;
both lists return `proposals` plus `pageInfo.hasNextPage` and an opaque
`pageInfo.nextCursor`. Every proposal — in both lists and in the detail
response — carries `proposerId`, `proposerName` (`first_name` and `last_name`
joined and trimmed) and `proposerUsername`, which is `null` until the
contributor has chosen one. These are the same identity fields published
Contribution Requests expose through their attribution block.
Detail permits only the proposer and the Project owner. A new version can be
submitted only by the proposer and only to answer an outstanding owner revision
request. A revision request is an owner-only append-only action that never edits
contributor-authored content. Withdrawal is proposer-owned and pending-only.
Pending proposals never expire and consume no Application or subscription quota.
Stable workflow errors include `PROPOSAL_PROJECT_NOT_PUBLISHED`,
`PROPOSAL_INTAKE_DISABLED`, `PROPOSAL_RATE_LIMITED`,
`PROPOSAL_NO_REVISION_REQUESTED`, `PROPOSAL_TERMINAL`, `PROPOSAL_NOT_AUTHORIZED`,
`PROPOSAL_NOT_FOUND`, `PROPOSAL_CURSOR_INVALID`,
`PROPOSAL_CONCURRENT_MODIFICATION`, and `PROPOSAL_IDEMPOTENCY_CONFLICT`.

`accept`, `decline`, and `misuse-reports` all require a UUID `idempotencyKey` in
the body; `decline` and `misuse-reports` also require a `reason`. Accept and
decline are owner-only and act on a pending proposal only; both are terminal and
idempotent. Acceptance transactionally creates one owner-controlled draft
Contribution Request from the latest Proposal Version and returns the proposal
with `status: "ACCEPTED"` and `resultingContributionRequestId`; it creates no
Assignment, Application, reserved place, quota use, ownership claim, or selection
priority, and discarding the resulting draft never reopens the proposal.
Proposal detail also returns `resultingContributionRequestStatus`, allowing the
proposer to observe the resulting Request lifecycle without exposing private
unfinished Request fields.
`decline` returns `status: "DECLINED"` with the contributor-visible
`declineReason`. `misuse-reports` may be filed by the proposer or the Project
owner, returns the stored report, and preserves an immutable authorship-evidence
snapshot for moderation without any automatic copying, ownership, or legal
finding. The resulting draft records immutable proposer attribution: the owner
`GET /contribution-requests/:id` view exposes `attribution: { proposalId,
contributorId }`, and once the Request is published `GET
/contribution-requests/:id` public detail exposes `attribution: { contributorId,
contributorName, contributorUsername }`; clients display the handle as
`@contributorUsername` when present.

## Sprint 5 delivery, reputation, and guidance contracts

Delivery routes require an active bearer session. Delivery writes also require
a UUIDv4 `Idempotency-Key`; reuse with different content fails with
`IDEMPOTENCY_KEY_REUSED`.

```http
POST  /applications/:applicationId/deliveries
PATCH /deliveries/:deliveryId
GET   /deliveries/:deliveryId
GET   /me/deliveries
GET   /owner/deliveries
GET   /owner/delivery-lifecycle
POST  /deliveries/:deliveryId/reviews
```

Submissions use a canonical GitHub pull-request URL and optional contributor
notes. Owner review accepts `APPROVED` with a 1-5 rating, or
`CHANGES_REQUESTED`/`REJECTED` with required feedback. Each contributor command
and owner decision is retained in immutable history. Approval atomically
completes the Contribution Request and appends a durable reputation event.

Contributor profiles expose the verified reputation projection: average
approved-delivery rating, rating count, approved contribution count,
assigned-task success rate, and up to five deterministically ranked verified
skills derived from approved work.

Explicit Skill Gap Guidance is contributor-initiated and independent of
Application outcomes and subscription tiers:

```http
POST /contributors/me/skill-gap-guidance
GET  /contributors/me/skill-gap-guidance/stream?contributionRequestId=<uuid>
```

NestJS assembles the published request requirements and approved-skill evidence
before calling FastAPI. The validated result may contain missing or
below-target skills, technologies, source-backed resources, practice projects,
and improvement steps. It never changes eligibility, Application state, owner
decisions, rank, or score.

## Paymob checkout and payment status (PAY-03 / #105)

The payment slice is disabled by default and exposes a backend-owned Free/Gold
catalog plus authenticated checkout/status operations:

```http
GET  /subscriptions/plans
POST /me/subscription/checkout
GET  /me/payments/:paymentId
```

The catalog is the only source of plan amount, currency, duration, role-context
eligibility, and checkout availability. Free is `0 EGP` with no checkout; Gold
is `50,000` minor units (`500 EGP`) for 30 days in either role context.

Checkout accepts `planType`, `roleContext`, and an optional 8–128 character
`idempotencyKey` in the body; the `Idempotency-Key` header is also accepted.
The server resolves all commercial values and rejects a mismatched active role
context. Repeating the same key for the same pending checkout returns the same
payment ID and browser-safe Paymob client secret. A key reused for different
commercial facts or a terminal attempt is rejected.

Payment status is scoped to the authenticated payer and returns only the
payment ID, selected role context and plan, server-owned amount/currency,
status, creation time, and paid time. Checkout creation and redirect data do
not activate a Subscription; only the later verified callback workflow may do
so.

## Contract Change Rules

- Breaking API changes require frontend coordination.
- AI service output schema changes require backend and FastAPI contract tests.
- DTO changes must be reflected in docs or generated OpenAPI.
- Contract drift should be caught by integration or contract tests.
