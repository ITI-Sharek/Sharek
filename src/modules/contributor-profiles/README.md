# Contributor Profiles Module

Owns contributor profile records and the authenticated profile redirect API.

Implemented endpoints:

- `POST /contributors/profiles/me/ensure`
- `GET /contributors/profiles/:username`

Owned table:

- `ContributorProfile`

Public reads from other modules go through narrow application services:

- identity owns `User.username` generation and persistence.
- GitHub exposes profile connection status without tokens.
- skill-profiles exposes owner/all vs viewer/approved skill summaries.
- reputation exposes public rating and review counts.

This module must not write `User`, GitHub account, skill profile, or reputation
tables directly.
