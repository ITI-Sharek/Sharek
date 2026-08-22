# GitHub Identity Module

Leaf read model for resolving the GitHub identity linked to a Sharek user.
Exists so `identity` and `github` can share this read without importing each
other cyclically; it owns no writes and no routes.

## Ownership

- Reads the `AuthProviderAccount` row for `provider = github` (table owned by
  `identity`).

## Public Services

- `GitHubIdentityLookupService.getGitHubIdentityForUser(userId)` — returns
  `{ providerAccountId, username } | null`. Stateless single query.

## Dependencies

- `shared/database` (global `DatabaseModule`) only. Imports nothing else, so
  no module can cycle through it.

## Extension Notes

- Keep this module a read-only leaf: adding writes or module imports here
  would reintroduce the coupling it exists to remove.
