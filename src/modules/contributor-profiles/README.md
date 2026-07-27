# Contributor Profiles Module

Contributor profiles are usable without GitHub. A missing repository
installation is represented as an optional/disconnected state and does not
block profile management or project discovery. Skill-gated behavior continues
to depend on approved skills, not on account activation or installation alone.

Owns contributor profile records and assembles authenticated profile views.

## Current API

- `POST /contributors/profiles/me/ensure`
- `PATCH /contributors/profiles/me`
- `PUT /contributors/profiles/me/avatar` (multipart `file`, PNG/JPEG/WebP, 2 MB)
- `GET /contributors/profile-fields`
- `GET /contributors/experience-levels` (public — no access token; registration
  step 3 needs the catalog before an account/session exists)
- `GET /contributors/profiles/:username`
- `GET /contributors/profiles/:username/avatar`

The update contract persists the brief (`bio`), availability, an
`experienceLevelId` referencing an admin-managed `ContributorExperienceLevel`
row, admin-managed field selections, and self-declared skills. Explicit
uploaded avatars are stored on the contributor profile and take precedence
over the identity-provider avatar, so later Google/GitHub logins do not change
them.

`ContributorProfilesService` enforces contributor eligibility and visibility,
ensures a canonical username through `IdentityUsernameService`, writes only the
profile, contributor-field catalog, experience-level catalog, and profile-field
join tables, and requests GitHub, skill, and reputation summaries through
exported services.

```text
contributor-profiles.module.ts
contributor-profiles.controller.ts
contributor-profiles.service.ts
dto/
utils/
validators/
README.md
```

The controller owns route validation only. Explicit response assembly prevents
passwords, tokens, and private persistence fields from leaking.
