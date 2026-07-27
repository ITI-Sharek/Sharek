# Implementation Plan: Optional GitHub Skill Profiling

**Branch**: `main` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-optional-github-skill-profile/spec.md`

## Summary

Migrate contributor repository evidence from the current broad GitHub OAuth App
grant to a verified GitHub App installation with selected repositories. Preserve
registration, email-verification account activation, normal profile access, and
optional GitHub social sign-in independently. Reuse the existing repository picker, evidence
normalization, BullMQ generation, AI validation, and admin review workflows.

The `github` module owns installation state, encrypted expiring member
authorization, provider verification, ephemeral installation-token creation,
repository access, and webhooks. The
`skill-profiles` module owns consent snapshots and generation state. No provider
token crosses the GitHub module boundary.

## Technical Context

**Language/Version**: TypeScript on Node.js with the repository's current NestJS toolchain

**Primary Dependencies**: NestJS, Prisma, PostgreSQL, BullMQ/Redis, and built-in Node.js `crypto` for RS256 app JWT signing and webhook HMAC verification; no new GitHub authentication dependency

**Storage**: PostgreSQL via Prisma for installation/state/repository authorization snapshots, encrypted expiring per-member GitHub App user/refresh credentials, one authoritative cutover timestamp, and generation consent; Redis remains limited to the existing BullMQ jobs

**Testing**: Jest unit/service tests, HTTP/E2E tests, webhook signature fixtures, migration tests, provider contract tests, and current architecture/lint/type/build gates

**Target Platform**: Docker Compose local backend stack and deployed NestJS API

**Project Type**: Backend web API in a feature-first modular monolith

**Performance Goals**: Return installation/repository status within three seconds under normal provider conditions; persist and return the initial durable generation state within three seconds of an accepted start request; process a received installation/repository revocation before any affected read and no later than five minutes after receipt

**Constraints**: Official endpoint contracts confirm read-only `Metadata` and `Contents` permissions cover the current evidence operations; selected repositories only; provider installation IDs are hints rather than authorization; private key, webhook secret, and member tokens remain encrypted/configuration secrets; installation tokens are short-lived, minted on demand, and never persisted or cached in the first release; every broad-OAuth consumer must be migrated explicitly

**Scale/Scope**: Multiple personal and organization installations per user and multiple independently verified user links per organization installation; user consent/generations/disconnect remain isolated; up to ten selected repositories per generation; existing contributor skill generation and review volume

## Constitution Check

*GATE: PASS before research; PASS again after design.*

- **Authority and Traceability — PASS**: PRD, BMAD journeys, constitution v3.1.0, and the active spec agree on the target and distinguish current OAuth behavior.
- **Roles and Context — PASS**: Authenticated session ownership controls installation linking; account role does not authorize provider resources.
- **Module Ownership — PASS**: `github` owns installations and provider access; `skill-profiles` owns consent/generation; cross-module calls use exported services.
- **HTTP Flow — PASS**: Controllers bind validated input and delegate; GitHub services coordinate module-local clients and persistence.
- **GitHub and Evidence — PASS**: Registration is repository-free; social identity is separate; installation, selected repositories, consent, and start are distinct gates.
- **AI Boundary — PASS**: Existing NestJS validation and admin review remain final; AI creates pending candidates only.
- **State and Persistence — PASS**: Installation and repository states are explicit; migrations are additive and forward-only before legacy OAuth removal.
- **API Contract — PASS**: Explicit installation/repository/generation DTOs and stable application errors are planned.
- **Testing and Reliability — PASS**: Provider timeouts, rate limits, revocation, signatures, retries, idempotency, concurrency, and partial failures are covered.
- **Brownfield Safety — PASS**: Existing GitHub, identity, profile, skill, AI, queue, schema, tests, and documentation were inspected and will be adapted.

## Project Structure

### Documentation (this feature)

```text
specs/004-optional-github-skill-profile/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   └── github-app-provider-contract.md
├── checklists/requirements.md
└── tasks.md                 # generated in the next Spec Kit phase
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma
└── migrations/

src/modules/github/
├── controllers/
├── services/
├── integrations/
├── repositories/           # only if cohesive installation queries justify it
├── security/
├── dto/
├── mappers/
├── github.module.ts
└── README.md

src/modules/skill-profiles/
├── controllers/
├── services/
├── repositories/
├── jobs/
├── dto/
├── skill-profiles.service.ts
├── skill-profiles.module.ts
└── README.md

src/modules/identity/
└── existing GitHub social-identity compatibility only

test/
└── GitHub installation and skill-generation E2E coverage
```

**Structure Decision**: Extend the existing standard NestJS modules. Do not add
a new integration module or Clean Architecture layers. `GitHubAppService` and a
module-local client may be added inside `github`; the existing
`GitHubEvidenceService` adapts to installation credentials without exposing them.

## Design Phases

### Phase A — Add the GitHub App capability beside legacy OAuth

1. Add validated GitHub App configuration and focused module-local provider
   operations for app JWT creation, non-retried authorization-code exchange,
   expiring member-token refresh, installation verification, on-demand
   installation-token generation, and paginated accessible-repository listing.
2. Add canonical installation, user-installation link with encrypted expiring
   member authorization, mutable selected-repository membership keyed by immutable
   repository ID, single-use link state, and webhook delivery persistence through
   a forward-only migration.
3. Add an authenticated start operation that returns the configured GitHub App
   installation URL with user-bound state. Request user authorization during
   installation and complete through the configured OAuth callback; do not use a
   setup URL. Additional organization members use the normal GitHub App web
   authorization flow before linking an existing installation.
4. Add user-scoped installation status/disconnect APIs and a signed webhook
   receiver.
5. Preserve existing GitHub social sign-in and account-link safety; do not use
   its user token for repository evidence.
6. Use built-in Node.js `crypto` for RS256 GitHub App JWTs and SHA-256 webhook
   HMAC verification so no new authentication dependency is required.

### Phase B — Switch repository evidence and generation

1. Make the repository picker list only repositories accessible to both the
   active installation and the currently authorized linked member.
2. Record consent version/time and installation/repository snapshots when a
   contributor explicitly starts generation.
3. Refresh expiring member authorization when needed and revalidate the member,
   installation, and repository immediately before evidence collection; mint an
   ephemeral installation token inside `github` only after authorization passes.
4. Preserve current evidence normalization, BullMQ recovery, AI validation,
   pending skills, and admin review. Add explicit owner-generation, bounded-admin,
   authorized-skill-AI, and public-safe approved-skill projection allowlists rather
   than assuming the current evidence summary is safe.
5. A user-initiated retry creates a new generation: prefill the prior selection,
   require another explicit start and consent confirmation, and revalidate access
   without reconnecting a valid installation.

### Phase C — Revoke and retire broad repository OAuth

1. Process signed `installation`, `installation_repositories`, and mandatory
   `github_app_authorization` notifications idempotently. Installation events
   update the canonical installation; user-authorization revocation disables only
   the affected user's links.
2. Reject affected queued/running provider reads before fetching new evidence;
   preserve approved skills, admin decisions, and minimal public-safe audit
   attribution while preventing private evidence from public contracts.
3. Inventory and adapt or retire every broad-OAuth repository consumer, including
   repository listing, README, description, statistics, contribution, commit,
   project-import, and legacy disconnect/status routes. Preserve identity-only
   GitHub authorization where required for login compatibility.
4. Persist one database-owned production cutover timestamp. Its database
   transaction atomically disables legacy reads and establishes the cutover clock.
   For each stored broad credential, attempt provider revocation, record the safe
   outcome, and purge the local credential regardless; a provider failure becomes
   an explicit manual-revocation action and never preserves local access. Raw
   legacy private evidence becomes non-authorizing and non-reusable. After 30
   days, run idempotent module-owned cleanup operations using the
   pre-implementation field inventory and transition unresolved legacy candidates
   to `needs_more_evidence`.

## Migration and Compatibility

- First migration is additive; existing `GitHubAccount` and OAuth callbacks stay
  operational only during the pre-cutover compatibility phase.
- New skill generations require an active GitHub App installation once the
  feature flag/cutover is enabled. Existing generation and review records remain
  readable.
- Do not silently convert an OAuth grant into an installation. Users reconnect
  through the profile and explicitly choose repositories.
- Passwordless GitHub users retain identity linkage. Repository disconnect must
  not delete their only login method.
- Local Share-k disconnect immediately disables only the selected installation
  link and reads through it; it does not affect other Share-k users linked to the
  same organization installation. GitHub uninstall remains a separate
  provider-managed action exposed through a settings link.
- The single durable cutover operation revokes/purges broad repository credentials
  immediately. Raw legacy private evidence remains non-authorizing/non-reusable
  for 30 days, after which module-owned cleanup preserves approved skills, admin
  decisions, and minimal public-safe audit attribution.

## Security and Operations

- Store App ID, Client ID, Client Secret, private key, webhook secret, app slug,
  callback URL, and public installation URL in validated configuration.
- Prefer a production secret manager/signing service for the private key. Local
  development may load an ignored environment value.
- Verify webhook HMAC over the raw request body and deduplicate by GitHub
  delivery ID before processing.
- Generate installation access tokens on demand only inside `github`; do not
  persist, cache, return, or log them in the first release.
- Put a cryptographically random, expiring, single-use state on the GitHub App
  installation URL and consume it at the configured authorization callback. No
  setup URL participates in the flow. For additional organization members, issue
  a normal GitHub App user-authorization URL bound to a new state.
- Encrypt expiring GitHub App user and refresh tokens on the user-installation
  link, rotate them transactionally, and clear/disable the affected link on
  refresh failure or `github_app_authorization` revocation. These credentials are
  used only for current member-access verification, never for evidence reads.
- Independently query GitHub to prove the installation/user association. Store
  the provider installation once and a separate verified link per Share-k user;
  never transfer consent/skills through a shared organization installation.
- Revalidate current GitHub user/repository access on picker refresh, generation
  start, and worker evidence-read boundaries. Treat `last_verified_at` only as
  audit metadata, never as a time-based authorization grant.
- Log IDs, states, and safe error codes only; redact code, tokens, private keys,
  secrets, private repository content, and provider payload fields not required
  for audit.
- Retry idempotent provider reads at most three times with exponential backoff
  and jitter, honoring `Retry-After` or rate-limit reset headers. Do not blindly
  retry single-use authorization-code exchange; return a safe restart error.
- Emit safe structured logs using the current NestJS logging boundary for callback
  outcome, installation state, webhook delivery lag/deduplication, provider
  latency/rate limits, generation start latency, and authorization failures. Do
  not add a feature-local metrics abstraction while shared observability is empty.

## Verification Plan

- Focused unit tests for state validation, JWT/token behavior, member-token
  encryption/refresh/rotation, signature verification, installation access, DTO
  mapping, and per-member/global revocation.
- Provider-client contract tests for authorization exchange, installation
  verification, token expiry, pagination, rate limits, and malformed responses.
- Service tests for duplicate callbacks/webhooks, selected-only repositories,
  consent gates, pre-job revalidation, disconnect, and passwordless identity.
- E2E coverage for registration without GitHub, install/select/generate/status,
  cancel/retry, organization approval, removal/suspension, and admin review.
- Contract/E2E coverage for owner-generation, bounded-admin-review,
  authorized-skill-AI, and public-safe DTO allowlists, proving private repository
  names, content, and identifying derived evidence cannot enter other-user/public
  profiles, projects, retrieval paths, logs, or unrelated AI responses.
- Timing assertions proving initial durable generation state is returned within
  three seconds and received revocations block affected reads within five
  minutes, using a controlled clock/provider fixture.
- A pre-release usability protocol with at least ten representative contributors
  records first-attempt install/select/start completion without intervention.
- Migration validation against representative users with identity-only OAuth,
  repository OAuth, pending generations, approved skills, and no GitHub.
- Controlled-clock cleanup tests at before/exactly-after the 30-day boundary,
  including reruns, unknown JSON keys, retained review decisions, redacted public
  output, and unresolved-candidate transitions.
- Required gates: architecture check, lint, TypeScript, focused/full Jest,
  Prisma validate/generate/migration checks, build, and `git diff --check`.

## Post-Design Constitution Check

PASS. The remediated design preserves optional GitHub use and email-verification
account activation, separates social identity from repository authorization,
uses a provider-valid callback flow, models shared organization installations
separately from encrypted per-member authorization, keeps all provider credentials
inside `github`, records consent in the owning workflow, enforces current
member-and-repository access at every read boundary, adds explicit evidence
projection allowlists, keeps AI advisory, and uses one durable forward-only
cutover state.

## Complexity Tracking

No constitutional exception is requested. Supporting both GitHub App and legacy
repository OAuth briefly is intentional pre-cutover compatibility. Installation
tokens are minted on demand; no new token cache is introduced without measured
need.
