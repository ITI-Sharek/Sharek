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
workflows. `SessionService` is the single implementation for session creation,
refresh, logout, and account authentication eligibility. `PasswordResetService`
owns reset-code lifecycle. `SocialAuthService` links providers and reuses
`SessionService`.

## Refresh transport (ADR-005)

The refresh credential travels only in the `sharek_refresh_token` httpOnly
cookie (`Path=/auth`), issued by `RefreshCookieService` on login, email
verification, social callback completion, and refresh; logout clears it. JSON
responses expose only `tokens.accessToken` and `tokens.expiresAt`
(`PublicAuthTokensDto`), so refresh tokens never reach frontend JavaScript.
`AuthOriginGuard` rejects cookie-bearing requests from origins outside the CORS
allowlist, and `SessionService.refresh` revokes the whole session if a
rotated-out refresh credential is replayed. Cookie attributes are tuned with
`AUTH_REFRESH_COOKIE_SECURE`, `AUTH_REFRESH_COOKIE_SAMESITE`, and
`AUTH_REFRESH_COOKIE_DOMAIN`.

The module exports `IdentityUsernameService` for profile workflows. Password
hashing, token generation, and provider clients remain private.
