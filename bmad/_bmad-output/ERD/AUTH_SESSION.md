# Entity: AUTH_SESSION

## Description

Stores backend login sessions for Share-k users. The API returns opaque access
and refresh tokens to the client, but only SHA-256 token hashes are persisted.
This supports logout, token refresh, expiry checks, and session revocation
without storing bearer tokens in plaintext.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK, NOT NULL, AUTO-GENERATED | Unique session identifier |
| `user_id` | UUID | FK -> USER.id, NOT NULL | User who owns the session |
| `access_token_hash` | VARCHAR(128) | UNIQUE, NOT NULL | SHA-256 hash of the opaque access token |
| `refresh_token_hash` | VARCHAR(128) | UNIQUE, NOT NULL | SHA-256 hash of the opaque refresh token |
| `user_agent` | VARCHAR(500) | NULLABLE | User agent captured at login/registration |
| `ip_address` | VARCHAR(45) | NULLABLE | IPv4 or IPv6 address captured at login/registration |
| `expires_at` | TIMESTAMP | NOT NULL | Access token expiry |
| `refresh_expires_at` | TIMESTAMP | NOT NULL | Refresh token expiry |
| `revoked_at` | TIMESTAMP | NULLABLE | Set when the user logs out or the session is revoked |
| `created_at` | TIMESTAMP | NOT NULL, AUTO-GENERATED | Session creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL, AUTO-UPDATED | Last session update timestamp |

## Indexes

| Index Name | Columns | Type | Purpose |
|-----------|---------|------|---------|
| `AuthSession_pkey` | `id` | PRIMARY KEY | Row identity |
| `AuthSession_access_token_hash_key` | `access_token_hash` | UNIQUE | Lookup active access token sessions |
| `AuthSession_refresh_token_hash_key` | `refresh_token_hash` | UNIQUE | Lookup refresh token sessions |
| `AuthSession_user_id_idx` | `user_id` | B-TREE | List or revoke sessions by user |

## Relationships

| Related Entity | Relationship | FK Location | Description |
|---------------|-------------|-------------|-------------|
| USER | N:1 | `auth_session.user_id` -> `user.id` | Each session belongs to one user |

## Business Rules

1. **Opaque Tokens Only**: Raw access and refresh tokens are returned to the
   client once and are never stored in plaintext.
2. **Hash Lookup**: Incoming bearer or refresh tokens are hashed before database
   lookup.
3. **Access Expiry**: Access tokens expire quickly and must pass
   `expires_at > now`.
4. **Refresh Rotation**: Refreshing a session rotates both access and refresh
   token hashes.
5. **Logout**: Logout sets `revoked_at`; revoked sessions cannot authenticate.
6. **Account State**: Suspended, deactivated, or pending users cannot use active
   sessions.

## PRD Traceability

| Functional Requirement | Description |
|----------------------|-------------|
| FR-011 | Contributor registers and logs in |
| FR-001 | Project owner registers and logs in |
