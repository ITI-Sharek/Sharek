# Contributor Profiles Module

Owns contributor profile records and assembles authenticated profile views.

## Current API

- `POST /contributors/profiles/me/ensure`
- `GET /contributors/profiles/:username`

`ContributorProfilesService` enforces contributor eligibility and visibility,
ensures a canonical username through `IdentityUsernameService`, writes only the
profile table, and requests GitHub, skill, and reputation summaries through
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
