# GitHub Module

Owns the integration between Share-k and GitHub.

Use this module for:

- GitHub OAuth connection metadata.
- Token references or encrypted token storage.
- Repository metadata ingestion.
- README/language/activity evidence collection.
- GitHub API normalization and rate-limit handling.

Other modules should request normalized GitHub data through ports or public
application services. They should not call GitHub SDKs directly.

