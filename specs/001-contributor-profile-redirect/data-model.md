# Data Model: Contributor Profile Redirect

## Authenticated User

Owned by `identity` through the existing `User` model.

### Fields Used By This Feature

- `id`: UUID string, primary identifier.
- `email`: unique email address, returned in auth DTOs.
- `username`: nullable unique canonical Share-k username on `User`; non-null
  for contributors returned by login/current-user redirect flows.
- `first_name`: contributor first name.
- `last_name`: contributor last name.
- `avatar_url`: optional public avatar URL.
- `role`: `owner`, `contributor`, or `admin`.
- `status`: `pending`, `active`, `suspended`, or `deactivated`.
- `preferred_language`: `ar` or `en`.
- `created_at`, `updated_at`, `last_login_at`: timestamps returned in public
  auth DTOs.

### Validation Rules

- Contributor usernames match `^[a-z0-9][a-z0-9_-]{2,29}$`.
- Usernames are unique across users.
- Username generation starts from name fields, falls back to email local-part,
  normalizes to the required pattern, then retries deterministic suffixes up to
  10 attempts.
- If a contributor username cannot be generated or persisted after 10 suffix
  retries, the flow returns 409.
- Suspended or deactivated users are not allowed to ensure profiles.

## Contributor Profile

Owned by the new `contributor-profiles` module.

### Proposed Prisma Shape

```prisma
model ContributorProfile {
  id             String   @id @default(uuid()) @db.Uuid
  user_id        String   @unique @db.Uuid
  bio            String?
  availability   String?  @db.VarChar(100)
  created_at     DateTime @default(now())
  updated_at     DateTime @default(now()) @updatedAt

  user           User     @relation(fields: [user_id], references: [id])

  @@index([user_id])
}
```

`User` also needs:

```prisma
username             String? @unique @db.VarChar(30)
contributorProfile   ContributorProfile?
```

### Fields In Public Response

- `username`: from `User.username`.
- `displayName`: profile display name, defaulting to first and last name.
- `avatarUrl`: from `User.avatar_url`.
- `roleLabel`: contributor-facing role label.
- `bio`: nullable profile bio.
- `skills`: skill summaries filtered by viewer relationship.
- `availability`: nullable profile availability value.
- `githubStatus`: public GitHub connection summary.
- `reputationSummary`: rating and review count summary.
- `contributionHistory`: empty array for this feature unless existing public
  delivery/reputation readers are available.
- `completionPrompts`: owner-only prompt list; empty for other viewers.
- `viewerRelationship`: `owner` or `authenticated-viewer`.

### Relationships

- One `User` with role `contributor` has zero or one `ContributorProfile`.
- `ContributorProfile` references exactly one `User`.
- Profile response reads GitHub connection summary from the `github` module.
- Profile response reads skill summaries from the `skill-profiles` module.
- Profile response reads reputation summary from the `reputation` module.

### Lifecycle

1. Contributor logs in or calls current-user and receives a canonical username.
2. Contributor calls ensure profile.
3. If no profile exists, contributor-profiles creates one linked to the user.
4. If a profile exists, ensure returns the existing profile without duplicate
   writes.
5. Profile lookup by canonical username returns active/pending contributors
   only; suspended/deactivated profiles are hidden with 404.

## Skill Summary

Owned by `skill-profiles`; read by contributor-profiles through a public reader.

### Fields

- `name`: skill name.
- `proficiencyLevel`: `beginner`, `intermediate`, or `advanced`.
- `confidence`: numeric confidence score.
- `status`: `pending`, `approved`, `rejected`, or `disputed`.
- `evidenceSummary`: optional public evidence summary.

### Visibility Rules

- Profile owner sees all generated skill summaries, including pending or
  rejected skills.
- Other authenticated viewers see approved skill summaries only.
- Pending or rejected skills must not qualify the contributor for eligibility
  decisions.

## GitHub Status Summary

Owned by `github`; read by contributor-profiles through a public reader.

### Fields

- `connected`: boolean.
- `username`: GitHub username or null.

### Rules

- If no GitHub account exists, return `{ connected: false, username: null }`.
- Do not expose OAuth tokens, encrypted token fields, raw profile data, or
  internal ingestion metadata in the profile DTO.

## Reputation Summary

Owned by `reputation`; read by contributor-profiles through a public reader.

### Fields

- `rating`: nullable number.
- `reviewsCount`: number, default `0`.

### Rules

- If no reputation record exists, return `{ rating: null, reviewsCount: 0 }`.
- Do not expose internal reputation calculation details.

## State and Error Outcomes

- Missing/invalid/revoked/expired token: 401.
- Owner/admin profile ensure attempt: 403.
- Suspended/deactivated contributor profile ensure attempt: 403.
- Unknown username or suspended/deactivated profile lookup: 404.
- Username uniqueness unresolved after 10 suffix retries: 409.
- Valid request with invalid username/profile source data: 422.
- Malformed request syntax or shape: 400.
