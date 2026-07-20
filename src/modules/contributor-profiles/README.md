# Contributor Profiles Module

Owns contributor profile records and assembles authenticated profile views.

## Current API

- `POST /contributors/profiles/me/ensure`
- `PATCH /contributors/profiles/me`
- `PUT /contributors/profiles/me/avatar` (multipart `file`, PNG/JPEG/WebP, 2 MB)
- `GET /contributors/profile-fields`
- `GET /contributors/profiles/:username`
- `GET /contributors/profiles/:username/avatar`

The update contract persists the brief (`bio`), availability, the exact
experience ranges `zero_to_one`, `two_to_four`, `five_to_ten`, and `ten_plus`,
admin-managed field selections, and self-declared skills. Explicit uploaded
avatars are stored on the contributor profile and take precedence over the
identity-provider avatar, so later Google/GitHub logins do not change them.

`ContributorProfilesService` enforces contributor eligibility and visibility,
ensures a canonical username through `IdentityUsernameService`, writes only the
profile, contributor-field catalog, and profile-field join tables, and requests
GitHub, skill, and reputation summaries through exported services.

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
