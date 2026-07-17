# Auth transport: in-memory access token + httpOnly refresh cookie

**Status:** PROPOSED

Access tokens are held in memory on the frontend only (never `localStorage`), and the refresh token travels in an httpOnly cookie the browser cannot read from JavaScript. This is a target proposal; `POST /auth/refresh` currently reads the token from the JSON body.

## Consequences

- Requires coordinated cookie issuance, `SameSite`/`Secure` policy, CSRF protection, and CORS credential handling.
- Frontend needs a refresh interceptor that queues concurrent requests and retries once; no auth module exists yet.
- The two sides (cookie-setting backend, interceptor-consuming frontend) need to land together — building one without the other leaves auth broken, so this is one coordinated change, not two independent ones.
