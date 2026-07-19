# Auth transport: in-memory access token + httpOnly refresh cookie

**Status:** ACCEPTED (implemented in the backend; frontend interceptor pending)

Access tokens are held in memory on the frontend only (never `localStorage`), and the refresh token travels in an httpOnly cookie the browser cannot read from JavaScript. `POST /auth/refresh` reads the `sharek_refresh_token` cookie (`Path=/auth`); login, email verification, and social callback responses set it, and logout clears it. Refresh tokens no longer appear in any JSON response.

## Consequences

- Cookie policy: `HttpOnly`, `Path=/auth`, `SameSite=Lax` (configurable to `strict`), `Secure` defaulting on in production, expiry matched to the refresh session TTL. `AUTH_REFRESH_COOKIE_SECURE`, `AUTH_REFRESH_COOKIE_SAMESITE`, and `AUTH_REFRESH_COOKIE_DOMAIN` tune this per environment.
- CSRF: cookie-bearing endpoints (`/auth/refresh`, `/auth/logout`) validate the browser `Origin` header against the CORS allowlist in addition to the SameSite attribute; CORS is enabled with `credentials: true`.
- Replay: refresh rotates the session's token hashes and remembers the previous refresh hash; presenting a rotated-out credential revokes the whole session.
- Cutover was atomic: the JSON-body `refreshToken` request/response contract was removed in the same change because no deployed client depended on it. Existing session rows stay valid; the only schema change is the additive nullable `previous_refresh_token_hash` column.
- Frontend still needs a refresh interceptor that queues concurrent requests, retries once, sends `credentials: 'include'` on auth calls, and keeps the access token in memory only.
