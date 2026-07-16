# Share-k Backend Postman API Guide

This guide is the Postman test contract for the currently implemented NestJS
backend routes. It is derived from the controllers under `src/modules`; keep it
updated whenever a route, request DTO, authorization rule, or response contract
changes.

## 1. Start The Backend

The default Docker Compose URL is:

```text
http://localhost:4000
```

Start the backend from the repository root:

```bash
docker compose up -d
curl http://localhost:4000/health
```

Expected health response:

```json
{
  "message": "Service is healthy",
  "status": "ok"
}
```

If you run NestJS directly on the host, use a free `PORT` and set `baseUrl` to
that port. Do not run the host process on the same port already published by
Docker.

## 2. Postman Environment

Create a Postman environment named `Share-k Local` with these variables:

| Variable | Initial value | Used for |
| --- | --- | --- |
| `baseUrl` | `http://localhost:4000` | Backend base URL |
| `ownerEmail` | `owner@example.com` | Owner test account |
| `contributorEmail` | `contributor@example.com` | Contributor test account |
| `adminEmail` | `admin@example.com` | Existing admin account |
| `password` | `Password123!` | Local test password |
| `ownerUsername` | `sharek-owner` | Owner registration |
| `contributorUsername` | `sharek-contributor` | Contributor registration |
| `ownerOtp` | `replace-with-owner-otp` | Email verification code |
| `contributorOtp` | `replace-with-contributor-otp` | Email verification code |
| `passwordResetOtp` | `replace-with-password-reset-otp` | Password reset code |
| `accessToken` | empty | Current bearer token |
| `refreshToken` | empty | Current refresh token |
| `generationId` | empty | Skill generation UUID |
| `userId` | empty | User id for admin role assignment |
| `githubRepoFullName` | `openai/openai-node` | GitHub `owner/repository` |
| `githubRepoUrl` | `https://github.com/openai/openai-node` | Public project URL |

Use the `Authorization` tab with type `Bearer Token` and value
`{{accessToken}}` for protected requests. Do not put real secrets, OAuth codes,
or provider tokens in this repository or in a shared Postman collection.

## 3. Recommended Test Order

1. `GET /health`
2. Register an owner and a contributor.
3. Read the OTP from the configured email inbox or local backend logs.
4. Verify each email and save the returned access and refresh tokens.
5. Use the contributor token for profile, GitHub, and skill-profile requests.
6. Use the owner token for project import.
7. Use an existing admin token for role assignment.
8. Test refresh and logout last because logout revokes the session.

Email/password registration creates a pending account and does not return
session tokens until `POST /auth/verify-email` succeeds. Reusing an existing
email returns an error; use login for an existing test user.

## 4. Complete Endpoint Catalog

### Health

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Check that the NestJS process is responding. |

### Identity And Sessions

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | Create a pending owner or contributor account. |
| `GET` | `/auth/username-availability` | Public | Validate a username and return a suggestion when taken. |
| `POST` | `/auth/verify-email` | Public | Verify the six-digit email OTP and create a session. |
| `POST` | `/auth/verify-email/resend` | Public | Send a new verification OTP for a pending account. |
| `POST` | `/auth/login` | Public | Create a session for an active user. |
| `POST` | `/auth/forgot-password` | Public | Create and send a password reset OTP. |
| `POST` | `/auth/reset-password` | Public | Change the password using a valid reset OTP. |
| `POST` | `/auth/refresh` | Public | Rotate a session using a refresh token. |
| `POST` | `/auth/logout` | Bearer | Revoke the current session. |
| `GET` | `/auth/me` | Bearer | Return the authenticated public user. |
| `PATCH` | `/auth/users/:id/role` | Admin bearer | Assign `owner`, `contributor`, or `admin`. |

### Social Authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/auth/google/start?role=owner\|contributor` | Public | Create a Google authorization URL and state. |
| `GET` | `/auth/google/callback?code=...&state=...` | Public/browser | Forward the provider callback to the frontend. |
| `POST` | `/auth/google/callback` | Public | Exchange a real Google code and state for a Share-k session. |
| `GET` | `/auth/github/start?role=owner\|contributor` | Public | Create a GitHub identity authorization URL and state. |
| `GET` | `/auth/github/callback?code=...&state=...` | Public/browser | Forward the provider callback to the frontend. |
| `POST` | `/auth/github/callback` | Public | Exchange a real GitHub identity code and state. |

### GitHub Connection And Evidence

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/github/oauth/start` | Bearer | Start repository-access OAuth for the logged-in user. |
| `GET` | `/github/oauth/callback?code=...&state=...` | Public/provider | Complete OAuth from a direct provider redirect. |
| `POST` | `/github/oauth/callback` | Public | Complete OAuth after the frontend receives code and state. |
| `GET` | `/auth/github/callback/repository?code=...&state=...` | Public/browser | Redirect repository OAuth to the frontend callback page. |
| `GET` | `/github/account` | Bearer | Read the connected GitHub account summary. |
| `GET` | `/github/repositories?page=1&perPage=12` | Bearer | List repositories available to the connected account. |
| `GET` | `/github/readme?fullName=owner/repository` | Bearer | Read repository README content. |
| `GET` | `/github/repository/description?fullName=owner/repository` | Bearer | Read repository description. |
| `GET` | `/github/repository/statistics?fullName=owner/repository` | Bearer | Read normalized repository statistics. |
| `GET` | `/github/repository/contribution-activity?fullName=owner/repository` | Bearer | Read contribution activity. |
| `GET` | `/github/repository/commit-signals?fullName=owner/repository&author=login` | Bearer | Read recent commit signals, optionally filtered by author. |
| `DELETE` | `/github/account` | Bearer | Disconnect the current user's GitHub account. |

### Projects

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/projects/import/github` | Owner/admin bearer | Import a public GitHub project by `fullName` or `repoUrl`. |

### Contributor Profiles

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/contributors/profiles/me/ensure` | Contributor bearer | Create or return the current contributor profile. |
| `GET` | `/contributors/profiles/:username` | Bearer | Read an authenticated contributor profile. |

### Skill Profiles

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/skill-profiles/me/generations` | Contributor bearer | Queue AI profiling for one to ten selected repositories. |
| `GET` | `/skill-profiles/me/generations/:generationId` | Contributor bearer | Poll a generation and its current skills/status. |

## 5. Request Recipes

### Register And Verify

#### Register

```http
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "email": "{{ownerEmail}}",
  "password": "{{password}}",
  "username": "{{ownerUsername}}",
  "firstName": "Sharek",
  "lastName": "Owner",
  "role": "owner",
  "preferredLanguage": "en"
}
```

Use `role: "contributor"` and the contributor variables for a contributor
account. `username` must be lowercase URL-safe text, between 3 and 30
characters, and unique.

#### Check Username Availability

```http
GET {{baseUrl}}/auth/username-availability?username={{ownerUsername}}
```

Example response:

```json
{
  "available": true,
  "suggestion": null,
  "reason": null
}
```

#### Verify Email

```http
POST {{baseUrl}}/auth/verify-email
Content-Type: application/json

{
  "email": "{{ownerEmail}}",
  "code": "{{ownerOtp}}"
}
```

Save `tokens.accessToken` to `accessToken` and `tokens.refreshToken` to
`refreshToken` in Postman after a successful verification or login.

#### Resend Email Verification

```http
POST {{baseUrl}}/auth/verify-email/resend
Content-Type: application/json

{
  "email": "{{ownerEmail}}"
}
```

### Login, Password Reset, And Sessions

#### Login

```http
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{ownerEmail}}",
  "password": "{{password}}"
}
```

#### Forgot Password

```http
POST {{baseUrl}}/auth/forgot-password
Content-Type: application/json

{
  "email": "{{ownerEmail}}"
}
```

The reset OTP is delivered through the configured email sender. In local
development without SMTP, inspect backend logs.

#### Reset Password

```http
POST {{baseUrl}}/auth/reset-password
Content-Type: application/json

{
  "email": "{{ownerEmail}}",
  "code": "{{passwordResetOtp}}",
  "newPassword": "NewPassword123!"
}
```

#### Refresh

```http
POST {{baseUrl}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{{refreshToken}}"
}
```

The response is an `AuthTokensDto` with `accessToken`, `refreshToken`,
`expiresAt`, and `refreshExpiresAt`. Replace both saved token variables after a
successful refresh.

#### Current User

```http
GET {{baseUrl}}/auth/me
Authorization: Bearer {{accessToken}}
```

#### Logout

```http
POST {{baseUrl}}/auth/logout
Authorization: Bearer {{accessToken}}
```

Run logout last for that test account. The token must no longer be accepted
after the session is revoked.

#### Assign Role

```http
PATCH {{baseUrl}}/auth/users/{{userId}}/role
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "role": "admin"
}
```

The bearer token must belong to an admin. The register endpoint cannot create
an admin directly.

### Social Authentication

Start either provider with:

```http
GET {{baseUrl}}/auth/google/start?role=contributor
```

or:

```http
GET {{baseUrl}}/auth/github/start?role=contributor
```

Open the returned `authorizationUrl` in a browser. Provider callbacks are
browser redirects and use one-time `code` and `state` values. Complete from
the frontend callback with:

```http
POST {{baseUrl}}/auth/google/callback
Content-Type: application/json

{
  "code": "real-google-code",
  "state": "real-state-from-google-start"
}
```

Use the same body for GitHub at `/auth/github/callback`. Placeholder values
cannot complete OAuth. Provider credentials and callback URLs must be valid in
the local `.env` file.

The provider browser callback routes forward a real callback to the frontend:

```http
GET {{baseUrl}}/auth/google/callback?code=real-google-code&state=real-state
GET {{baseUrl}}/auth/github/callback?code=real-github-code&state=real-state
```

These requests are manual browser-flow checks and normally return a redirect.

### GitHub Repository Connection

Start repository access with a logged-in contributor token:

```http
GET {{baseUrl}}/github/oauth/start
Authorization: Bearer {{accessToken}}
```

Open `authorizationUrl` in a browser and let GitHub redirect to
`/auth/github/callback/repository`. The frontend then posts the real values:

```http
POST {{baseUrl}}/github/oauth/callback
Content-Type: application/json

{
  "code": "real-github-code",
  "state": "real-state-from-github-oauth-start"
}
```

The direct provider callback route is also available for integrations that do
not use the frontend redirect page:

```http
GET {{baseUrl}}/github/oauth/callback?code=real-github-code&state=real-state-from-github-oauth-start
```

After a successful connection:

```http
GET {{baseUrl}}/github/account
Authorization: Bearer {{accessToken}}
```

```http
GET {{baseUrl}}/github/repositories?page=1&perPage=12
Authorization: Bearer {{accessToken}}
```

The repository page defaults to `page=1`, `perPage=12`, and caps `perPage` at
50. Evidence requests use the `fullName` returned by the repository list:

```http
GET {{baseUrl}}/github/readme?fullName={{githubRepoFullName}}
Authorization: Bearer {{accessToken}}
```

```http
GET {{baseUrl}}/github/repository/description?fullName={{githubRepoFullName}}
Authorization: Bearer {{accessToken}}
```

```http
GET {{baseUrl}}/github/repository/statistics?fullName={{githubRepoFullName}}
Authorization: Bearer {{accessToken}}
```

```http
GET {{baseUrl}}/github/repository/contribution-activity?fullName={{githubRepoFullName}}
Authorization: Bearer {{accessToken}}
```

```http
GET {{baseUrl}}/github/repository/commit-signals?fullName={{githubRepoFullName}}&author=github-login
Authorization: Bearer {{accessToken}}
```

Disconnect only when the test is complete:

```http
DELETE {{baseUrl}}/github/account
Authorization: Bearer {{accessToken}}
```

### Project Import

Use an owner or admin token. The import path accepts either `fullName` or a
public GitHub `repoUrl`:

```http
POST {{baseUrl}}/projects/import/github
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "repoUrl": "{{githubRepoUrl}}"
}
```

This workflow uses GitHub's public repository API and does not require the
owner to connect a GitHub account.

### Contributor Profile

Ensure the logged-in contributor profile exists:

```http
POST {{baseUrl}}/contributors/profiles/me/ensure
Authorization: Bearer {{accessToken}}
```

Read a profile by its canonical username:

```http
GET {{baseUrl}}/contributors/profiles/{{contributorUsername}}
Authorization: Bearer {{accessToken}}
```

The response contains public profile data, approved skills for other viewers,
and the viewer relationship. Passwords, tokens, OAuth credentials, and private
session data are never returned.

### Skill Profile Generation

The contributor must have a connected GitHub account and must select names from
the authenticated repository list:

```http
POST {{baseUrl}}/skill-profiles/me/generations
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "repositories": [
    { "fullName": "{{githubRepoFullName}}" }
  ]
}
```

Save `generationId` from the response, then poll it:

```http
GET {{baseUrl}}/skill-profiles/me/generations/{{generationId}}
Authorization: Bearer {{accessToken}}
```

The normal lifecycle is `queued`, `collecting_evidence`, `analyzing`, and then
`pending_review`, `needs_more_evidence`, or `failed`. Generated skills remain
pending until the backend admin review workflow approves them.

## 6. Useful Negative Tests

These tests verify the shared HTTP behavior without changing database state:

| Test | Request | Expected |
| --- | --- | --- |
| Missing bearer token | `GET /auth/me` without `Authorization` | `401 Unauthorized` |
| Missing bearer token | `GET /github/account` without `Authorization` | `401 Unauthorized` |
| Invalid login body | `POST /auth/login` with `{}` | `400 Bad Request` with validation messages |
| Missing repository name | Protected evidence route without `fullName` | `400` with `GITHUB_REPOSITORY_FULL_NAME_REQUIRED` |
| Contributor-only route as owner/admin | Skill generation or profile ensure | `403 Forbidden` |
| Admin-only route as owner/contributor | `PATCH /auth/users/:id/role` | `403 Forbidden` |
| Invalid page | `GET /github/repositories?page=0` | `400 Bad Request` |

## 7. Runtime And Integration Limits

- Real Google and GitHub OAuth requires valid provider applications and real,
  one-time authorization codes. Postman cannot replace the browser consent
  step.
- Email verification and password-reset testing requires SMTP or the local OTP
  logging fallback.
- Skill generation requires the separate FastAPI AI service at `AI_SERVICE_URL`
  and a running Redis worker.
- GitHub repository and evidence requests require a real connected account and
  valid GitHub API access.
- Prisma migrations run as part of the Docker API command. Do not edit the
  database manually for schema changes.

## 8. Related Files

- REST Client requests: `sharek-api.http`
- Stable API and AI contract rules: `docs/api-contracts.md`
- Architecture decision: `bmad/_bmad-output/planning-artifacts/architecture/adr-002-standard-nestjs-module-architecture.md`
- Local startup: `docs/local-development.md`
