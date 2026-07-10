# Identity Module

Owns users, roles, sessions, authentication state, and account-level access.

Identity answers these questions:

- Who is this user?
- Can this user authenticate?
- Which Share-k role does this user have?
- Is this session still valid?
- Which account-level status blocks access?

Implemented endpoints:

- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/verify-email/resend`
- `POST /auth/login`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `POST /auth/google/callback`
- `GET /auth/github/start`
- `GET /auth/github/callback`
- `POST /auth/github/callback`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `PATCH /auth/users/:id/role`

## Current Structure

```text
identity/
  identity.module.ts
  application/
    dto/auth-session.dto.ts
    dto/email-verification.dto.ts
    dto/social-auth.dto.ts
    mappers/auth-user.mapper.ts
    use-cases/identity.service.ts
    use-cases/social-auth.service.ts
  infrastructure/
    integrations/email-verification.sender.ts
    integrations/google-oauth.client.ts
    security/password-hasher.service.ts
    security/session-token.service.ts
  presentation/
    http/controllers/identity.controller.ts
    http/requests/register.request.ts
    http/requests/verify-email.request.ts
    http/requests/resend-email-verification.request.ts
    http/requests/login.request.ts
    http/requests/refresh-session.request.ts
    http/requests/social-auth-start.request.ts
    http/requests/social-auth-callback.request.ts
    http/requests/assign-role.request.ts
```

## How The Current Flow Works

```text
IdentityController
  -> request DTO
  -> IdentityService
  -> DatabaseService, PasswordHasher, SessionTokenService
  -> auth-user mapper
  -> AuthSessionDto or AuthUserDto
```

The controller owns HTTP routing only. `IdentityService` owns the auth workflow:
normalizing email, checking credentials, creating email verification OTPs,
creating sessions, refreshing tokens, revoking sessions, and assigning roles.

Email/password registration flow:

```text
POST /auth/register
  -> create pending user
  -> create hashed 6-digit email OTP
  -> send OTP through EmailVerificationSender
  -> return user + verification expiry, without tokens

POST /auth/verify-email
  -> validate latest unconsumed OTP
  -> activate user
  -> create auth session
  -> return AuthSessionDto
```

`EmailVerificationSender` uses SMTP when `SMTP_HOST` and `EMAIL_FROM` are
configured. Gmail is supported through SMTP (`smtp.gmail.com`) with a Google App
Password in `SMTP_PASS`; normal Gmail passwords should not be used. In
non-production environments without SMTP config, the sender logs the OTP for
local testing instead of failing registration.

The current code uses `DatabaseService` directly inside the use case service.
That is acceptable for this sprint. If identity persistence grows or becomes
hard to test, create `infrastructure/persistence/` and move user/session Prisma
queries behind repository classes.

Social auth flow:

```text
IdentityController
  -> SocialAuthService
  -> AuthOAuthState and AuthProviderAccount tables
  -> GoogleOAuthClient or GitHubOAuthService
  -> SessionTokenService
  -> AuthSessionDto
```

Google and GitHub direct auth return the same `AuthSessionDto` as email/password
login after the provider has verified the user's email. The requested `role` is
used only when a new user is created; existing users keep their saved role. If a
pending email/password user later signs in with a provider that proves the same
verified email, Identity activates that pending user. GitHub direct auth may
also refresh the user's connected GitHub account token, but Identity still does
not own GitHub token encryption or repository evidence.

## Where To Put New Files

- `presentation/http/controllers`: new auth or account HTTP controllers.
- `presentation/http/requests`: request validation classes such as login,
  register, refresh, password reset, or role assignment input.
- `presentation/http/responses`: add this when frontend response shape needs a
  dedicated response class instead of returning application DTOs directly.
- `application/use-cases`: registration, email verification, login, refresh
  session, logout, social auth, account status, role assignment, password reset.
- `application/dto`: stable use-case outputs such as authenticated user,
  session, token, or account status DTOs.
- `application/mappers`: conversion from Prisma/domain records to safe DTOs.
- `domain/entities`: add only when user, session, or account status gets real
  lifecycle behavior.
- `domain/policies`: role policy, account-state policy, password policy,
  session lifecycle policy.
- `infrastructure/integrations`: provider clients and SMTP/email delivery
  adapters used only by identity.
- `infrastructure/security`: password hashing, token generation, token hashing,
  encryption-related technical services.
- `infrastructure/persistence`: Prisma user/session repositories when direct
  database access in the use case becomes too large.

## Add `domain/` When

- account status has multiple transitions.
- roles need rules beyond simple assignment.
- password or session rules become reusable.
- refresh/logout behavior needs stronger lifecycle protection.

## Boundaries

Do not put project ownership, application eligibility, or GitHub repository
logic in this module.

Identity may expose the authenticated user and role through shared auth helpers.
It should not decide whether a project can be published, whether a contributor
is eligible for a task, or how reputation changes.
