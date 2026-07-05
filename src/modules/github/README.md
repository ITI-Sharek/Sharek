# GitHub Module

Owns the integration between Share-k and GitHub.

Implemented endpoints:

- `GET /github/oauth/start`
- `GET /github/oauth/callback`
- `POST /github/oauth/callback`
- `GET /github/account`
- `GET /github/repositories`
- `DELETE /github/account`

Use this module for:

- GitHub OAuth connection metadata.
- Token references or encrypted token storage.
- Repository metadata ingestion.
- README/language/activity evidence collection.
- GitHub API normalization and rate-limit handling.

Other modules should request normalized GitHub data through ports or public
application services. They should not call GitHub SDKs directly.

Repository import behavior:

- `GET /github/repositories` lists public repositories available through the
  connected GitHub account.
- `POST /projects/import/github` is owner/admin-only and creates or refreshes a
  draft `Project` from GitHub repository metadata.
- Import stores normalized language, topic, statistics, and README snapshots so
  later background ingestion can pass stable repository evidence to the separate
  FastAPI AI repository.
