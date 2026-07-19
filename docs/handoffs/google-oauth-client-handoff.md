# Google OAuth Client Handoff

## Why This Handoff Exists

The Share-k browser client is currently requesting:

```text
http://localhost:3000/auth/google/start?role=contributor
```

Port `3000` is not the backend API. The Dockerized NestJS backend is exposed at
`http://localhost:4000`, and its development CORS policy already accepts and
reflects arbitrary browser origins.

## Required Client Change

Configure the client API base URL as:

```text
http://localhost:4000
```

Start Google sign-in with:

```http
GET http://localhost:4000/auth/google/start?role=contributor
```

Valid roles are `owner` and `contributor`. The response contains
`authorizationUrl`, `state`, and `expiresAt`. Navigate the browser to
`authorizationUrl`; do not call the Google authorization URL with `fetch` or
XHR.

Example flow:

```ts
const response = await fetch(
  `${API_BASE_URL}/auth/google/start?role=contributor`,
);
const result = await response.json();

window.location.assign(result.authorizationUrl);
```

Google redirects to the backend callback. The backend then redirects the
browser to:

```text
${FRONTEND_URL}/auth/callback?provider=google&code=...&state=...
```

On that client callback page, read `code` and `state`, then complete sign-in:

```http
POST http://localhost:4000/auth/google/callback
Content-Type: application/json

{
  "code": "<google-code>",
  "state": "<oauth-state>"
}
```

The POST response is the Share-k authentication session containing the user and
tokens.

## Client Acceptance Checks

1. No client request for an API route targets port `3000` unless a development
   proxy explicitly forwards that route to backend port `4000`.
2. The start request targets backend port `4000` and returns HTTP 200.
3. The browser navigates to `authorizationUrl` instead of fetching it.
4. `/auth/callback` submits `code` and `state` to the backend POST callback.
5. Errors display the backend response code/message instead of being reported
   generically as a CORS failure.

## Backend/Google Configuration Dependency

The backend operator must configure `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `GOOGLE_OAUTH_CALLBACK_URL`. In Google Cloud, the
authorized redirect URI must exactly match:

```text
http://localhost:4000/auth/google/callback
```

`FRONTEND_URL` must also match the actual client origin so the backend returns
the browser to the correct callback page.
