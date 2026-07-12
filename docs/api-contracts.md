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
POST /auth/verify-email
POST /auth/verify-email/resend
POST /auth/login
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
^[a-z0-9][a-z0-9_-]{2,29}$
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
provider account first, then by verified email. GitHub social auth also stores
or refreshes the connected `GitHubAccount` token so contributor repository
evidence can use the same consent.

## GitHub Connection Contracts

Implemented GitHub connection endpoints:

```text
GET /github/oauth/start
GET /github/oauth/callback
POST /github/oauth/callback
GET /github/account
GET /github/repositories
GET /github/readme
GET /github/repository/description
GET /github/repository/statistics
GET /github/repository/contribution-activity
GET /github/repository/commit-signals
DELETE /github/account
POST /projects/import/github
```

`GET /github/oauth/start` requires an authenticated Share-k user. It stores a
short-lived OAuth state and returns the GitHub authorization URL. Contributor
OAuth requests the GitHub `repo` scope so Share-k can read public and private
repository evidence after explicit GitHub consent. Owner/admin OAuth keeps the
lighter `public_repo` scope for the project-import shortcut.

The callback validates the stored state, exchanges the GitHub code, fetches the
GitHub profile, and stores the linked account. GitHub access tokens are never
returned in API responses. Stored GitHub access and refresh tokens are encrypted
at rest with AES-256-GCM.

`GET /github/repositories` requires an authenticated user with a connected
GitHub account. It returns normalized repository metadata fetched through the
encrypted server-side GitHub token. For contributors this can include public
and private repositories because their OAuth connection uses the GitHub `repo`
scope. Owner project import does not require this endpoint.

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

`POST /projects/import/github` requires an authenticated `owner` or `admin`
and accepts:

```json
{
  "fullName": "owner/repository"
}
```

or:

```json
{
  "repoUrl": "https://github.com/owner/repository"
}
```

Owner GitHub connection is not required for project import. The endpoint uses
GitHub's public repository API, so private owner repositories are intentionally
outside the MVP import path.

The response is a draft project created or refreshed from GitHub metadata. The
backend stores the GitHub repo URL, GitHub repo ID, language breakdown, topics,
repository statistics, README content snapshot, contribution activity, and
recent commit signals where GitHub exposes them. This is the handoff point for
later repository ingestion/background jobs and FastAPI AI evidence generation.

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

## AI Service Contracts

AI implementation lives in a separate FastAPI AI repository. The NestJS backend
calls that service through ports/adapters and owns all business decisions,
database writes, and user-facing API responses.

Expected NestJS ports:

```text
SkillProfileGenerator
EligibilityAnalyzer
SkillGapAdvisor
EmbeddingGenerator
```

Expected FastAPI service endpoints:

```text
POST /skill-profiles/generate
POST /eligibility/analyze
POST /skill-gap/generate
POST /embeddings/generate
GET /health
```

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
