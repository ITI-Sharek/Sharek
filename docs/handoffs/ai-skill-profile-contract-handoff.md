# AI Skill-Profile Contract Handoff

## Purpose

Implement the FastAPI endpoint required by the Share-k NestJS skill-profile
worker. Work only in the separate AI repository; do not change the backend or
client repositories as part of this handoff.

## Observed Integration State

Initial observation on 2026-07-19 from the running FastAPI OpenAPI document:

```text
GET  /health
POST /profile/repos
```

The backend requires:

```text
POST /skill-profiles/generate
```

The observed Uvicorn process was also listening only on `127.0.0.1:8000`.
Because NestJS runs in Docker, FastAPI must listen on a Docker-reachable host
interface during local integration, for example:

```bash
uvicorn <module>:app --host 0.0.0.0 --port 8000
```

Keep this development listener protected by the local machine/firewall. The
backend reaches it through `http://host.docker.internal:8000`; using
`http://localhost:8000` inside the NestJS container targets the container
itself and fails.

Calling the required route currently returns HTTP 404. The existing
`POST /profile/repos` contract is not compatible:

- it accepts `repo_urls` and `github_username`;
- it returns fields such as `clean_code`, `framework_skills`, `confidence`, and
  `sources`;
- it does not declare bearer-token security in OpenAPI;
- it does not return backend evidence IDs or the required audit/version fields.

Do not solve this by renaming the existing route alone. The request and response
contracts must be implemented and tested.

### Follow-up verification

Later verification on 2026-07-19 confirmed that the AI service now exposes
`POST /skill-profiles/generate`, declares route security, listens on
`0.0.0.0:8000`, and accepts the backend bearer token. An intentionally empty
authenticated request returned HTTP 422 with the expected missing request
fields, proving that authentication and request-schema validation execute.

The remaining local integration blocker is host firewall access. The backend
container uses source subnet `172.24.0.0/16`; requests from that subnet to host
port `8000` time out even though host-local health returns HTTP 200. The local
operator must allow TCP port `8000` from that Docker subnet, or run FastAPI in a
container attached to `server_sha-rek-network` and use its service hostname.

## Required Request

`POST /skill-profiles/generate` must accept JSON shaped like the backend
`SkillProfileInput` in `src/modules/ai/dto/skill-profile-ai.dto.ts`:

```json
{
  "contributorId": "user-id",
  "githubLogin": "sharek-dev",
  "generationId": "generation-id",
  "requestedAt": "2026-07-19T00:00:00.000Z",
  "selectedRepositories": [
    {
      "evidenceId": "github:sharek-dev/repository",
      "fullName": "sharek-dev/repository",
      "htmlUrl": "https://github.com/sharek-dev/repository",
      "private": false,
      "fork": false,
      "archived": false,
      "defaultBranch": "main",
      "owner": "sharek-dev",
      "description": null,
      "topics": [],
      "primaryLanguage": "TypeScript",
      "languages": { "TypeScript": 1000 },
      "technologies": ["TypeScript"],
      "statistics": {},
      "readmeExcerpt": null,
      "contributionActivity": {},
      "commitSignals": {},
      "authorship": {
        "githubLogin": "sharek-dev",
        "repositoryOwned": true,
        "recentCommitCount": 2,
        "totalCommits": 5,
        "additions": 200,
        "deletions": 20,
        "contributionDetected": true,
        "matchedRecentCommitShas": ["abc"]
      },
      "evidenceFailures": []
    }
  ]
}
```

The AI service must analyze the supplied evidence capsules. It must not replace
them by independently crawling arbitrary repositories.

## Required Response

Return HTTP 200 with this structure:

```json
{
  "skills": [
    {
      "name": "TypeScript",
      "proficiency": "intermediate",
      "confidence": 0.8,
      "evidenceIds": ["github:sharek-dev/repository"],
      "evidenceSummary": "Evidence-based explanation",
      "limitations": []
    }
  ],
  "fraudSignals": [],
  "evidenceQuality": "medium",
  "recommendation": "pending_review",
  "provider": "provider-name",
  "model": "model-name",
  "promptVersion": "v1",
  "schemaVersion": "skill-profile-result-v1",
  "serviceVersion": "service-version"
}
```

Allowed values:

- `proficiency`: `beginner`, `intermediate`, or `advanced`;
- `evidenceQuality`: `strong`, `medium`, or `weak`;
- `recommendation`: `pending_review` or `needs_more_evidence`;
- fraud-signal severity: `low`, `medium`, or `high`.

Every returned `evidenceId` must exactly match an `evidenceId` supplied in the
request. Unknown or fabricated IDs are rejected by NestJS.

## Authentication

Require this header on generation routes:

```text
Authorization: Bearer <AI_SERVICE_AUTH_TOKEN>
```

The same non-empty, long random token must be configured in both repositories.
`GET /health` must remain unauthenticated and must not expose configuration.

## Acceptance Checks

1. `GET /health` returns HTTP 200 without authentication.
2. FastAPI binds to a Docker-reachable interface and its health endpoint is
   reachable from the `sha-rek-api` container.
3. `POST /skill-profiles/generate` rejects missing or incorrect bearer tokens.
4. A valid evidence-capsule request returns the required response schema.
5. All skill citations are limited to submitted evidence IDs.
6. Weak evidence deterministically returns `needs_more_evidence`.
7. Provider timeouts and malformed model output return a non-2xx service error.
8. OpenAPI documents the request, response, and bearer-token security scheme.
9. Contract tests use the backend DTO reference and include unknown-evidence-ID
   and missing-audit-metadata cases.

## Backend References

- `src/modules/ai/dto/skill-profile-ai.dto.ts`
- `src/modules/ai/integrations/fastapi-skill-profile.client.ts`
- `src/modules/ai/integrations/fastapi-skill-profile.client.spec.ts`
- `docs/api-contracts.md`, AI integration section

After implementation, return the AI files changed, tests run, OpenAPI route
list, authentication behavior, and one sanitized compatible response example.
