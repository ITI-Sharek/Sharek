# Implementation Plan: Contributor Profile Redirect

**Branch**: `001-contributor-profile-redirect` | **Original Date**: 2026-07-11 | **Architecture Refresh**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

## Summary

Return a stable contributor username in auth responses, idempotently ensure a
contributor profile, and expose authenticated profile lookup by canonical
username. Preserve viewer-specific skill visibility and exclude private auth,
OAuth, session, and persistence fields.

The feature now follows ADR-002 standard NestJS modules. Historical behavior and
contracts are unchanged; only implementation organization was simplified.

## Technical Context

- TypeScript 5.7, Node.js, NestJS 11
- PostgreSQL and Prisma
- Jest unit and HTTP/E2E coverage
- No AI call or asynchronous queue in this feature
- Existing migration `20260711000000_contributor_profile_redirect` remains unchanged

## Boundaries

- `identity` owns `User.username`, login/current-user DTOs, and username assignment.
- `contributor-profiles` owns profile rows, eligibility, visibility, and response assembly.
- `github`, `skill-profiles`, and `reputation` expose summary services.
- The profile service writes only contributor-profile records.
- Controllers perform route binding/validation and delegate to services.

## Runtime Flow

```text
ManualAuthController -> AuthService -> IdentityUsernameService -> Prisma

ContributorProfilesController
  -> ContributorProfilesService
  -> IdentityUsernameService
  -> GitHubProfileService
  -> SkillProfileSummaryService
  -> ReputationService
  -> Prisma contributorProfile
```

## Source Structure

```text
src/modules/identity/
  controllers/
  services/auth.service.ts
  services/session.service.ts
  services/identity-username.service.ts
  dto/
  mappers/
  validators/username.validator.ts

src/modules/contributor-profiles/
  contributor-profiles.module.ts
  contributor-profiles.controller.ts
  contributor-profiles.service.ts
  dto/contributor-profile.dto.ts
  utils/contributor-profile.presenter.ts
  utils/profile-completion-prompts.ts
  validators/contributor-profile.validator.ts

src/modules/github/services/github-profile.service.ts
src/modules/skill-profiles/services/skill-profile-summary.service.ts
src/modules/reputation/reputation.service.ts
```

## Contract

- `POST /auth/login`
- `GET /auth/me`
- `POST /contributors/profiles/me/ensure`
- `GET /contributors/profiles/:username`

The OpenAPI artifact remains
`contracts/contributor-profile-redirect.openapi.yaml`.

## Verification

- Username validation, normalization, collision, and assignment tests
- Auth login/status and public DTO tests
- Contributor profile service/validator/presenter tests
- HTTP tests for login -> ensure -> lookup and 400/403/404 outcomes
- Architecture check, lint, type-check, full tests, build, Prisma validation

## Architecture Decision

This plan uses controller -> service -> Prisma/exported service. It does not use
layer folders, use-case classes, reader ports, or abstract repositories. See
ADR-002 and `docs/architecture.md`.
