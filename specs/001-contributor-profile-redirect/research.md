# Research: Contributor Profile Redirect

## Decision: Identity Owns Canonical Usernames

Canonical usernames are stored on `User.username`, owned and written by the
`identity` module. Contributor-profile use cases must call an exported identity
application service to ensure or read usernames instead of writing the `users`
table directly.

**Rationale**: The username is returned in auth DTOs, used in login/current-user
responses, and uniquely identifies users for profile URLs. Since the `users`
table belongs to `identity`, username generation and persistence must stay
there to satisfy module ownership rules.

**Alternatives considered**:
- Store username only on contributor profile: rejected because login and
  current-user responses require username before profile aggregation.
- Duplicate username on both user and profile tables: rejected because it
  creates synchronization risk and two owners for one canonical identifier.

## Decision: Add a Contributor-Profiles Module

Create `src/modules/contributor-profiles/` to own contributor profile records,
profile ensure, profile lookup, viewer relationship, response assembly, and
profile-specific policies.

**Rationale**: The profile is a user-facing capability that combines identity,
GitHub, skills, reputation, and completion prompts. Keeping this orchestration
outside `identity` prevents auth/session code from absorbing profile-specific
business behavior.

**Alternatives considered**:
- Put profile ensure and lookup in `identity`: rejected because profile fields,
  skills, reputation, and completion prompts are not authentication concerns.
- Put profile lookup in `skill-profiles`: rejected because skills are only one
  part of the profile response.

## Decision: Use Public Reader/Application Services for Cross-Module Data

Contributor-profiles will use public services or reader ports for identity,
GitHub status, skill summaries, and reputation summary. It must not import
another module's infrastructure repository.

**Rationale**: The response aggregates data owned by multiple modules. Public
readers preserve table ownership while allowing the profile use case to compose
a frontend-ready DTO.

**Alternatives considered**:
- Query all tables directly from contributor-profiles: rejected because it
  bypasses module ownership and creates direct knowledge of other modules'
  persistence internals.
- Move all profile data into one denormalized table: rejected for MVP because
  GitHub, skills, and reputation already have owners and lifecycle rules.

## Decision: Access Tokens Permit Active and Pending Users, Use Cases Enforce Status

Authentication should allow active users and pending contributors to hold valid
sessions for this flow. Suspended and deactivated users remain blocked. Use
cases enforce route-specific status policies, including allowing only active or
pending contributors to ensure profiles.

**Rationale**: The clarification says active and pending contributors may ensure
profiles. The current guard only accepts active users, so the implementation
must either add route-aware status handling or relax the shared guard with
use-case checks. Route-specific use-case status checks keep policy explicit.

**Alternatives considered**:
- Keep active-only auth: rejected because pending contributors could not call
  profile ensure.
- Let every authenticated status reach profile use cases: rejected because
  suspended/deactivated users must receive 403 for ensure and be hidden from
  lookup.

## Decision: Deterministic Username Generation With 10 Attempts

Username generation starts from first/last name and falls back to email
local-part. The candidate is normalized to `^[a-z0-9][a-z0-9_-]{2,29}$`, then
deterministic suffixes are tried up to 10 attempts. If all attempts conflict,
return 409.

**Rationale**: Deterministic generation supports repeatable tests and avoids
random identifiers in canonical URLs. The fixed limit prevents unbounded loops
and makes conflict handling testable.

**Alternatives considered**:
- Require frontend username selection: rejected because the feature must support
  redirect immediately after login.
- Single attempt then 409: rejected because normal collisions should be
  resolvable without user intervention.

## Decision: Profile Visibility Rules

Profile lookup returns active or pending contributor profiles only. Suspended or
deactivated profiles return 404 by username. Owners see all generated skills on
their own profile; other authenticated viewers see only approved skills.

**Rationale**: This preserves the PRD trust gate for public skill claims while
letting contributors see their own pending or rejected generated skills.

**Alternatives considered**:
- Show only approved skills to owners too: rejected because it hides useful
  self-review context.
- Show pending/rejected skills to all authenticated viewers: rejected because
  unreviewed AI-generated claims must not become public trust signals.

## Decision: Validation Error Split

Return 422 for semantically invalid username/profile source data in a valid
request. Reserve 400 for malformed request syntax or malformed request shape.

**Rationale**: The split makes API tests precise and keeps malformed transport
errors separate from valid requests that cannot produce a valid profile.

**Alternatives considered**:
- Return 400 for all validation failures: rejected because it makes the
  malformed-vs-semantic distinction ambiguous.
- Return 422 for all profile ensure failures: rejected because auth, role,
  hidden profile, and conflicts have distinct status codes in the spec.
