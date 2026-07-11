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
POST /auth/login
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

Login and registration return opaque access and refresh tokens. Access tokens
are sent to protected routes using:

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

## GitHub Connection Contracts

Implemented GitHub connection endpoints:

```text
GET /github/oauth/start
GET /github/oauth/callback
POST /github/oauth/callback
GET /github/account
GET /github/repositories
DELETE /github/account
POST /projects/import/github
```

`GET /github/oauth/start` requires an authenticated Share-k user. It stores a
short-lived OAuth state and returns the GitHub authorization URL.

The callback validates the stored state, exchanges the GitHub code, fetches the
GitHub profile, and stores the linked account. GitHub access tokens are never
returned in API responses. Stored GitHub access and refresh tokens are encrypted
at rest with AES-256-GCM.

`GET /github/repositories` requires an authenticated user with a connected
GitHub account. It returns normalized public repository metadata fetched through
the encrypted server-side GitHub token.

`POST /projects/import/github` requires an authenticated `owner` or `admin`
and accepts:

```json
{
  "fullName": "owner/repository"
}
```

The response is a draft project created or refreshed from GitHub metadata. The
backend stores the GitHub repo URL, GitHub repo ID, language breakdown, topics,
repository statistics, and README content snapshot. This is the handoff point
for later repository ingestion/background jobs and FastAPI AI evidence
generation.

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
