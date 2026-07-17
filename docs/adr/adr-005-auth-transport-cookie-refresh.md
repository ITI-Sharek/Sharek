# Auth transport: in-memory access token + httpOnly refresh cookie

**Status:** Accepted

Access tokens are held in memory on the frontend only (never `localStorage`), and the refresh token travels in an httpOnly cookie the browser can't read from JS — this bounds the blast radius of an XSS bug to a short-lived access token instead of a long-lived refresh token. This is the target; it's a real change from what's running today (`prd.md` FR-03): `POST /auth/refresh` currently reads `refreshToken` from the JSON request body, not a cookie.

## Consequences

- Requires an actual backend change (cookie issuance on login/refresh, `SameSite`/`Secure` flags, CORS credential handling) — not fixed by writing this document, tracked as E1-05 in `epics-and-stories.md`.
- Frontend needs a refresh interceptor that queues concurrent requests during a token refresh and retries once (`frontend-spec.md` §4) — this doesn't exist yet either, since `frontend/` has no auth module at all yet.
- The two sides (cookie-setting backend, interceptor-consuming frontend) need to land together — building one without the other leaves auth broken, so this is one coordinated change, not two independent ones.
