# Entity: GITHUB_OAUTH_STATE

## Description

Stores short-lived GitHub OAuth state values for users starting the connection
flow. The raw state is returned to the client/GitHub redirect flow, while only
its SHA-256 hash is stored. The callback must present the same state before the
backend exchanges the GitHub code for tokens.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK, NOT NULL, AUTO-GENERATED | Unique state record identifier |
| `user_id` | UUID | FK -> USER.id, NOT NULL | User who started the OAuth flow |
| `state_hash` | VARCHAR(128) | UNIQUE, NOT NULL | SHA-256 hash of the random OAuth state |
| `expires_at` | TIMESTAMP | NOT NULL | State expiry timestamp |
| `consumed_at` | TIMESTAMP | NULLABLE | Set after the callback successfully uses the state |
| `created_at` | TIMESTAMP | NOT NULL, AUTO-GENERATED | State creation timestamp |

## Indexes

| Index Name | Columns | Type | Purpose |
|-----------|---------|------|---------|
| `GitHubOAuthState_pkey` | `id` | PRIMARY KEY | Row identity |
| `GitHubOAuthState_state_hash_key` | `state_hash` | UNIQUE | Validate callback state |
| `GitHubOAuthState_user_id_idx` | `user_id` | B-TREE | Inspect or clean up states by user |

## Relationships

| Related Entity | Relationship | FK Location | Description |
|---------------|-------------|-------------|-------------|
| USER | N:1 | `github_oauth_state.user_id` -> `user.id` | Each state belongs to one user |

## Business Rules

1. **Short Lifetime**: OAuth states expire quickly; current implementation uses
   a 10-minute window.
2. **Hash Storage**: Raw state values are never stored in plaintext.
3. **Single Use**: A valid callback sets `consumed_at`; consumed states cannot
   be reused.
4. **Authenticated Start**: Only an authenticated Share-k user can create an
   OAuth state.
5. **Callback Validation**: The backend must validate state before exchanging
   the GitHub authorization code.

## PRD Traceability

| Functional Requirement | Description |
|----------------------|-------------|
| FR-001 | Owner connects GitHub account |
| FR-011 | Contributor connects GitHub account |
