# Feature Specification: Contributor Profile Redirect

**Feature Branch**: `001-contributor-profile-redirect`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Build backend support for contributor profile redirect after successful login. When a contributor logs in, the frontend must be able to ensure the contributor has a profile, then redirect to /profile/{username}."

## Clarifications

### Session 2026-07-11

- Q: Which contributor account statuses may ensure or expose contributor profiles? → A: Active and pending contributors may ensure profiles; suspended/deactivated contributors receive 403 and are hidden from lookup.
- Q: Which skills may appear in contributor profile responses? → A: Show all generated skills to the profile owner and approved skills to other viewers.
- Q: How should the system handle username generation when the initial candidate conflicts? → A: Generate from name/email, normalize to the required pattern, retry deterministic suffixes up to a fixed limit, then return 409 if still conflicting.
- Q: What is the fixed username suffix retry limit? → A: 10 attempts.
- Q: Which status code should invalid username or profile source data return? → A: Return 422 when valid requests contain invalid username/profile source data; reserve 400 for malformed request syntax.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contributor Login Redirect Path (Priority: P1)

A contributor signs in with email and password, receives authenticated user data
that includes a stable username, ensures their contributor profile exists, and
is redirected by the frontend to their canonical profile page.

**Why this priority**: This is the primary post-login contributor journey and
unblocks profile-first navigation for the frontend.

**Independent Test**: Can be tested by signing in as a contributor, calling the
profile ensure action with the returned access token, and verifying the returned
profile username can be used to load `/profile/{username}`.

**Acceptance Scenarios**:

1. **Given** an active contributor with valid credentials, **When** they log in,
   **Then** the response includes tokens and a user object with `id`, `email`,
   `username`, `firstName`, `lastName`, `avatarUrl`, `role`, `status`,
   `preferredLanguage`, `createdAt`, `updatedAt`, and `lastLoginAt`.
2. **Given** a newly logged-in contributor without an existing contributor
   profile, **When** the frontend ensures the contributor profile, **Then** a
   basic profile is created and returned with a canonical `username`.
3. **Given** a logged-in contributor with an existing contributor profile,
   **When** the frontend ensures the contributor profile again, **Then** the
   existing profile is returned and no duplicate profile is created.
4. **Given** the frontend receives the ensured profile, **When** it redirects to
   `/profile/{profile.username}`, **Then** the profile lookup returns the same
   contributor profile.

---

### User Story 2 - Authenticated Profile Viewing (Priority: P2)

An authenticated user opens a contributor profile by username and sees a safe
profile response tailored to whether they own that profile or are viewing
someone else's profile.

**Why this priority**: Profile pages must work after redirect and must preserve
different viewer relationships without exposing private user data.

**Independent Test**: Can be tested by loading the same contributor profile as
the profile owner and as a different authenticated user, then comparing
`viewerRelationship` and `completionPrompts`.

**Acceptance Scenarios**:

1. **Given** an authenticated contributor views their own profile username,
   **When** the profile is loaded, **Then** `viewerRelationship` is `owner` and
   `completionPrompts` are included.
2. **Given** any other authenticated user views that contributor profile,
   **When** the profile is loaded, **Then** `viewerRelationship` is
   `authenticated-viewer` and `completionPrompts` is an empty array.
3. **Given** an authenticated user requests an unknown username, **When** the
   profile is loaded, **Then** the system returns 404 with a useful message.

---

### User Story 3 - Protected Error Handling (Priority: P3)

The system rejects invalid credentials, invalid or missing tokens, non-
contributor profile ensure attempts, username conflicts, and invalid profile
source data with clear status outcomes and useful messages.

**Why this priority**: Clear failures protect account data, prevent duplicate
profiles, and let the frontend show actionable feedback.

**Independent Test**: Can be tested by attempting each rejected action with
invalid credentials, missing tokens, owner/admin users, duplicate usernames,
invalid generated usernames, and unknown profile usernames.

**Acceptance Scenarios**:

1. **Given** invalid login credentials, **When** login is attempted, **Then** the
   system returns 401 with a useful message.
2. **Given** a missing, expired, or invalid access token, **When** current-user,
   profile ensure, or profile lookup is attempted, **Then** the system returns
   401 with a useful message.
3. **Given** an authenticated owner or admin user, **When** they attempt to
   ensure a contributor profile for themselves, **Then** the system returns 403
   with a useful message.
4. **Given** an authenticated suspended or deactivated contributor, **When**
   they attempt to ensure their contributor profile, **Then** the system returns
   403 with a useful message.
5. **Given** profile creation detects a username or profile uniqueness conflict,
   **When** the contributor profile is ensured, **Then** the system returns 409
   with a useful message.
6. **Given** a valid profile ensure request contains username or profile source
   data that cannot produce a valid profile, **When** the contributor profile is
   ensured, **Then** the system returns 422 with a useful message.

### Edge Cases

- Contributor login succeeds for a user record that does not yet have a
  username; the system must generate and persist a stable unique username before
  the frontend needs to redirect.
- A generated username collides with an existing username; the system must avoid
  duplicate usernames by retrying deterministic suffixes up to 10 attempts, or
  return a 409 conflict if uniqueness cannot be resolved.
- A contributor calls profile ensure repeatedly or concurrently; the system must
  return one canonical profile and must not create duplicates.
- An owner or admin tries to use the contributor profile ensure endpoint; the
  system must reject the request with 403.
- A suspended or deactivated contributor tries to ensure a contributor profile;
  the system must reject the request with 403.
- A suspended or deactivated contributor profile is requested by username; the
  system must return 404 so inactive profiles are not exposed.
- A profile is requested with different casing or an alias form; the system must
  resolve only the canonical URL-safe username.
- A profile is requested for an unknown username; the system must return 404.
- Any authentication-protected action receives a missing, expired, malformed, or
  revoked token; the system must return 401.
- A request has malformed syntax or malformed request shape; the system must
  return 400 with a useful message.
- A valid profile ensure request contains invalid username or profile source
  data; the system must return 422 with a useful message.
- Profile responses must not expose password hashes, refresh/access token data,
  token hashes, private auth session fields, OAuth credentials, or internal
  security metadata.
- Profile owners may see all generated skills in their own profile response,
  while other authenticated viewers must see only approved skills.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate email/password login attempts and return
  tokens plus the authenticated user on success.
- **FR-002**: System MUST return 401 with a useful message for invalid login
  credentials.
- **FR-003**: System MUST return the authenticated user from login and
  current-user responses with exactly these public fields: `id`, `email`,
  `username`, `firstName`, `lastName`, `avatarUrl`, `role`, `status`,
  `preferredLanguage`, `createdAt`, `updatedAt`, and `lastLoginAt`.
- **FR-004**: System MUST restrict user `role` values in public auth responses
  to `owner`, `contributor`, or `admin`.
- **FR-005**: System MUST ensure every contributor user has a stable, unique,
  URL-safe username before that contributor is returned to the frontend for
  redirect decisions.
- **FR-006**: System MUST use username values matching
  `^[a-z0-9][a-z0-9_-]{2,29}$` for contributor usernames.
- **FR-007**: System MUST generate a username from contributor name or email,
  normalize it to the username pattern, retry deterministic suffixes up to 10
  attempts on conflicts, and persist a valid unique username during migration or
  profile creation for any existing contributor user that lacks one.
- **FR-008**: System MUST return the current authenticated user with the same
  public user DTO shape as login.
- **FR-009**: System MUST require a valid bearer access token for current-user,
  contributor profile ensure, and contributor profile lookup actions.
- **FR-010**: System MUST return 401 with a useful message when a protected
  action receives a missing, expired, revoked, or invalid token.
- **FR-011**: System MUST allow authenticated contributors with `active` or
  `pending` status to ensure their own contributor profile and receive the
  profile response.
- **FR-012**: System MUST create a basic contributor profile when an
  authenticated contributor ensures their profile and no profile exists.
- **FR-013**: System MUST make profile ensure idempotent so repeated calls
  return the existing profile and never create duplicate profiles.
- **FR-014**: System MUST reject owner and admin users from contributor profile
  ensure with 403 and a useful message.
- **FR-014a**: System MUST reject suspended or deactivated contributors from
  contributor profile ensure with 403 and a useful message.
- **FR-015**: System MUST return 409 with a useful message when contributor
  profile creation or username persistence cannot resolve a uniqueness conflict
  after 10 deterministic username suffix retries.
- **FR-016**: System MUST return 422 with a useful message when a valid profile
  ensure request contains username or profile source data that is invalid and
  cannot produce a valid contributor profile.
- **FR-016a**: System MUST reserve 400 for malformed request syntax or malformed
  request shape.
- **FR-017**: System MUST return contributor profile responses using this public
  shape: `username`, `displayName`, `avatarUrl`, `roleLabel`, `bio`, `skills`,
  `availability`, `githubStatus`, `reputationSummary`,
  `contributionHistory`, `completionPrompts`, and `viewerRelationship`.
- **FR-017a**: System MUST include all generated skills in `skills` when the
  profile owner views their own profile, including pending or rejected skills
  if present.
- **FR-017b**: System MUST include only approved skills in `skills` when an
  authenticated user views another contributor's profile.
- **FR-018**: System MUST include `githubStatus.connected` and
  `githubStatus.username` in contributor profile responses.
- **FR-019**: System MUST include `reputationSummary.rating` and
  `reputationSummary.reviewsCount` in contributor profile responses.
- **FR-020**: System MUST include a `completionPrompts` list for the profile
  owner and an empty `completionPrompts` list for other authenticated viewers.
- **FR-021**: System MUST return `viewerRelationship: "owner"` when the
  authenticated viewer owns the requested contributor profile.
- **FR-022**: System MUST return `viewerRelationship:
  "authenticated-viewer"` when an authenticated user views another
  contributor's profile.
- **FR-023**: System MUST allow authenticated users to load an active or pending
  contributor profile by canonical username.
- **FR-024**: System MUST return 404 with a useful message for unknown profile
  usernames and for suspended or deactivated contributor profiles.
- **FR-025**: System MUST exclude password hashes, tokens, token hashes, private
  auth session fields, OAuth credentials, and internal security metadata from
  all responses in this feature.
- **FR-026**: System MUST support the frontend flow: login, store access token
  for contributors, ensure contributor profile, redirect to
  `/profile/{profile.username}`, then load that profile by username.

### Trust, Safety, and Audit Requirements *(include when applicable)*

- **TS-001**: System MUST preserve role boundaries by allowing only contributor
  users with active or pending account status to ensure contributor profiles for
  themselves.
- **TS-002**: System MUST expose only public auth and contributor profile DTO
  fields and must never expose credential, token, or internal security metadata.
- **TS-002a**: System MUST prevent pending or rejected skills from appearing in
  profile responses to authenticated viewers who do not own the profile.
- **TS-003**: System MUST return error responses with a useful `message` string
  for 400 malformed request, 401 authentication, 403 authorization/status,
  404 missing or hidden profile, 409 unresolved uniqueness conflict, and 422
  semantically invalid profile source outcomes in this flow.
- **TS-004**: System MUST maintain one canonical username per contributor so
  profile URLs remain stable after login.

### Key Entities *(include if feature involves data)*

- **Authenticated User**: A Share-k account with identity fields, role, status,
  preferred language, timestamps, and a stable username for contributors.
- **Contributor Profile**: The public contributor-facing profile identified by
  canonical username and containing display information, skills, availability,
  GitHub connection summary, reputation summary, contribution history,
  completion prompts, and viewer relationship.
- **Skill Summary**: A profile skill item visible according to viewer
  relationship; owners see all generated skill summaries, while other
  authenticated viewers see only approved skill summaries.
- **GitHub Status Summary**: Public profile summary showing whether the
  contributor has connected GitHub and, when available, the GitHub username.
- **Reputation Summary**: Public profile summary showing the contributor rating
  and review count without exposing internal reputation calculation details.

### API Contract Impact *(include if feature exposes or changes backend APIs)*

- **Endpoint(s)**: `POST /auth/login`, `GET /auth/me`,
  `POST /contributors/profiles/me/ensure`,
  `GET /contributors/profiles/:username`.
- **Request validation**: Login requires valid email/password input; protected
  profile actions require an authenticated viewer; profile lookup requires a
  canonical username matching the username rules.
- **Response contract**: Login and current-user responses return the same public
  user DTO. Contributor profile ensure and lookup return the same
  `ContributorProfileDto`, with `viewerRelationship` and `completionPrompts`
  adjusted for the authenticated viewer.
- **Pagination**: Not required for these single-resource actions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful contributor login and current-user responses
  include a non-empty stable username and all required public user fields.
- **SC-002**: A contributor with no existing profile can complete login,
  profile ensure, redirect, and profile lookup without manual account fixes.
- **SC-003**: Repeating contributor profile ensure at least five times for the
  same contributor returns one canonical profile and creates no duplicates.
- **SC-004**: Owner/admin profile ensure attempts, invalid credentials, invalid
  tokens, suspended/deactivated contributor ensure attempts, unknown or hidden
  usernames, duplicate username conflicts, and invalid profile source data each
  produce the expected status outcome and a useful message.
- **SC-005**: Profile owners see owner-specific completion prompts, while other
  authenticated viewers receive an empty prompt list for the same profile.
- **SC-005a**: Profile owners can see all generated skills on their own
  profiles, while other authenticated viewers see only approved skills for the
  same profile.
- **SC-006**: Security review confirms no password hashes, token material,
  OAuth credentials, private auth session data, or internal security metadata
  appear in responses for this flow.

## Assumptions

- Contributor profile URLs use the canonical Share-k username, not the GitHub
  username.
- Username generation starts from the contributor's available name fields and
  falls back to email local-part before applying deterministic suffixes.
- Display name defaults to the contributor's first and last name when no custom
  profile display name exists.
- New basic profiles may start with `bio: null`, `skills: []`,
  `availability: null`, `contributionHistory: []`, and default completion
  prompts such as "Add your bio", "Add your skills", and "Connect GitHub".
- A contributor without a connected GitHub account has
  `githubStatus.connected: false` and `githubStatus.username: null`.
- A contributor without reviews has `reputationSummary.rating: null` and
  `reputationSummary.reviewsCount: 0`.
- This feature defines backend contracts needed by the frontend redirect flow;
  detailed screen design and frontend routing are outside this feature.
