# Identity Module

Owns users, credentials, roles, account status, sessions, verification/reset
codes, and social identity linkage.

## Public HTTP Areas

- Manual auth: registration, username availability, email verification, login,
  forgot/reset password.
- Sessions: refresh, logout, current user, admin role assignment.
- Social auth: GitHub and Google start/callback routes.

## Structure

```text
controllers/
services/
  auth.service.ts
  session.service.ts
  password-reset.service.ts
  social-auth.service.ts
  identity-username.service.ts
  google-oauth.service.ts
dto/
integrations/
mappers/
security/
validators/
identity.module.ts
README.md
```

`AuthService` owns registration, verification, login, current-user, and role
workflows. Admin role assignment is enforced both by HTTP guards and by
`AuthService`, which validates the authenticated actor before updating the
target user. `SessionService` is the single implementation for session creation,
refresh, logout, and account authentication eligibility. `PasswordResetService`
owns reset-code lifecycle. `SocialAuthService` links providers and reuses
`SessionService`. Browser OAuth GET callbacks validate and forward only
`code`, `state`, and provider error details while ignoring unrelated provider
metadata. Frontend POST callback bodies remain strictly DTO-validated.

The module exports `IdentityUsernameService` for profile workflows and
`IdentityAccountStatusService` for contributor activation after skill review.
Password hashing, token generation, and provider clients remain private.
