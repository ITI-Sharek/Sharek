# Quickstart: Contributor Profile Redirect

## Prerequisites

- Docker Compose local stack can start the API, PostgreSQL with pgvector, and
  Redis.
- Prisma migrations for this feature have been applied.
- Seed or create at least:
  - one active contributor with email/password credentials,
  - one pending contributor,
  - one owner or admin,
  - one authenticated viewer that is not the profile owner.

## Setup

```bash
docker compose up --build
docker compose exec api npm run prisma:migrate
docker compose exec api npm test
```

## Implementation Validation Notes

- Focused validation command:
  `npm test -- --runInBand identity contributor-profile`
- Focused result: 12 test suites passed, 34 tests passed.
- Build command: `npm run build`
- Build result during implementation: passed.
- Prisma client generation command: `npm run prisma:generate`
- Prisma generation result during implementation: passed.

Profile ensure and lookup are single-resource flows:

- Ensure reads the authenticated user, ensures a username through identity,
  creates or returns one `ContributorProfile`, and reads GitHub/skills/reputation
  summaries through narrow public readers.
- Lookup reads one profile by canonical username and aggregates the same public
  summaries.
- No FastAPI AI call, queue job, or model-provider request is part of this
  redirect flow, keeping it compatible with the P95 under 3s target for normal
  non-streaming API interactions.

## Scenario 1: Contributor Login Redirect Path

1. Call `POST /auth/login` with active contributor credentials.
2. Confirm the response contains `tokens.accessToken`.
3. Confirm `user.username` is non-empty, stable, unique, and matches
   `^[a-z0-9][a-z0-9_-]{2,29}$`.
4. Call `POST /contributors/profiles/me/ensure` with the bearer access token.
5. Confirm the response contains the same canonical `username`.
6. Call `GET /contributors/profiles/{username}` with the same bearer token.
7. Confirm the profile response returns `viewerRelationship: "owner"` and owner
   `completionPrompts`.

Expected outcome: the frontend can redirect to `/profile/{profile.username}`
after profile ensure and load the same profile by username.

## Scenario 2: Idempotent Ensure

1. Call `POST /contributors/profiles/me/ensure` five times for the same
   contributor.
2. Confirm each response has the same username and profile fields.
3. Confirm only one contributor profile row exists for the contributor.

Expected outcome: repeated ensure calls do not create duplicate profiles.

## Scenario 3: Authenticated Viewer Response

1. Login as a different authenticated user.
2. Call `GET /contributors/profiles/{username}` for the contributor profile.
3. Confirm `viewerRelationship: "authenticated-viewer"`.
4. Confirm `completionPrompts` is an empty array.
5. Confirm `skills` includes only approved skills.

Expected outcome: non-owner viewers receive a safe public profile response.

## Scenario 4: Owner Skill Visibility

1. Seed or create approved, pending, and rejected skill profile records for the
   contributor.
2. Load the profile as the owner.
3. Confirm all generated skills are present.
4. Load the same profile as another authenticated viewer.
5. Confirm only approved skills are present.

Expected outcome: unapproved skill claims are never shown to non-owner viewers.

## Scenario 5: Protected Error Handling

Validate the expected statuses:

- Invalid login credentials return 401.
- Missing, expired, revoked, or malformed bearer token returns 401.
- Owner/admin profile ensure attempt returns 403.
- Suspended/deactivated contributor profile ensure attempt returns 403.
- Suspended/deactivated profile lookup by username returns 404.
- Unknown username returns 404.
- Username uniqueness unresolved after 10 deterministic suffix retries returns
  409.
- Valid profile ensure request with invalid profile source data returns 422.
- Malformed request syntax or malformed request shape returns 400.

Expected outcome: every protected failure path returns a useful `message`
without exposing password hashes, tokens, token hashes, OAuth credentials,
private auth session fields, or internal security metadata.
