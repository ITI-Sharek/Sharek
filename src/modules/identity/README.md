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
GitHub authorization starts request `prompt=select_account`, so repeated login
attempts do not silently reuse the last GitHub browser identity. Provider
account uniqueness remains enforced; a GitHub identity linked to another
Sharek user still returns a conflict rather than being reassigned. GitHub
sign-in resolves users only through GitHub's immutable numeric account ID,
using either the identity-owned provider link or the exported GitHub account
lookup. A matching email never silently links an unrecognized GitHub identity
to an existing Sharek user. Existing social links that disagree with the
user's repository-connected GitHub ID are rejected as conflicts.

Authenticated repository connection completion is exposed through `POST
/auth/github/account/callback`. It verifies the OAuth state owner, prevents a
GitHub identity already owned by another Sharek user from being taken, and
replaces the authenticated user's stale GitHub provider link with the selected
numeric ID. `DELETE /auth/github/account` removes both the repository connection
and GitHub provider link, but refuses to disconnect GitHub when doing so would
leave a passwordless user with no login method.

The module exports `IdentityUsernameService` for profile workflows and
`IdentityAccountStatusService` for contributor activation after skill review.
Password hashing, token generation, and provider clients remain private.
