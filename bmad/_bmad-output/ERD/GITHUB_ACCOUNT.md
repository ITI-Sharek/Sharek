# Entity: GITHUB_ACCOUNT

## Description
Stores the linked GitHub OAuth connection for each user. This entity holds OAuth tokens, sync metadata, and ingestion status. It is the entry point for all GitHub-sourced data — repositories, languages, commits, and contribution activity — used by the AI Skill Profiling Agent and Project Publishing flow.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK, NOT NULL, AUTO-GENERATED | Unique identifier |
| `user_id` | UUID | FK → USER.id, NOT NULL, UNIQUE | The Share-k user who owns this GitHub link |
| `github_id` | VARCHAR(50) | UNIQUE, NOT NULL | GitHub's own numeric/string user ID |
| `username` | VARCHAR(100) | NOT NULL | GitHub username (handle) |
| `access_token` | VARCHAR(500) | NOT NULL, ENCRYPTED | OAuth access token (encrypted at rest) |
| `refresh_token` | VARCHAR(500) | NULLABLE, ENCRYPTED | OAuth refresh token (encrypted at rest) |
| `avatar_url` | VARCHAR(500) | NULLABLE | GitHub profile avatar URL |
| `profile_url` | VARCHAR(500) | NULLABLE | Link to GitHub profile page |
| `raw_profile_data` | JSONB | NULLABLE | Full GitHub profile API response for reference |
| `ingestion_status` | ENUM | NOT NULL, DEFAULT `pending` | One of: `pending`, `in_progress`, `completed`, `failed` |
| `token_expires_at` | TIMESTAMP | NULLABLE | When the access token expires |
| `connected_at` | TIMESTAMP | NOT NULL | When the user first connected GitHub |
| `last_synced_at` | TIMESTAMP | NULLABLE | Last time data was fetched from GitHub API |

## Indexes

| Index Name | Columns | Type | Purpose |
|-----------|---------|------|---------|
| `pk_github_account` | `id` | PRIMARY KEY | Row identity |
| `uq_github_account_user` | `user_id` | UNIQUE | One GitHub account per user |
| `uq_github_account_github_id` | `github_id` | UNIQUE | Prevent duplicate GitHub connections |
| `idx_github_ingestion_status` | `ingestion_status` | B-TREE | Find accounts needing ingestion |

## Relationships

| Related Entity | Relationship | FK Location | Description |
|---------------|-------------|-------------|-------------|
| USER | N:1 (effectively 1:1) | `github_account.user_id` → `user.id` | Each GitHub account belongs to exactly one user |

## Business Rules

1. **One-to-One Enforcement**: Each user can connect exactly one GitHub account. Reconnecting replaces the existing tokens.
2. **Token Security**: `access_token` and `refresh_token` must be encrypted at rest using AES-256-GCM or equivalent. They must never appear in API responses or logs.
3. **Ingestion Pipeline**:
   - On connection, `ingestion_status` = `pending`
   - Repository listing/import uses the encrypted token to fetch repos, READMEs, languages, and statistics
   - Background job later sets it to `in_progress` and fetches deeper evidence such as commits and code signals
   - On success → `completed`; on failure → `failed` (with retry capability)
4. **Token Refresh**: If `token_expires_at` is past, the system must attempt a refresh before making API calls.
5. **Disconnect**: If a user disconnects GitHub, tokens are wiped and `ingestion_status` resets. Associated skill profiles may be flagged for re-review.

## Data Flow

```
GitHub OAuth → GITHUB_ACCOUNT stored → Ingestion Service triggered
     ↓
  Repos, READMEs, Languages, Commits fetched
     ↓
  AI Skill Profiling Agent processes evidence
     ↓
  SKILL_PROFILE records created (pending status)
```

## PRD Traceability

| Functional Requirement | Description |
|----------------------|-------------|
| FR-001 | Owner connects GitHub account |
| FR-011 | Contributor connects GitHub account |
| FR-027 | System prepares GitHub ingestion after connection |
| FR-028 | Fetch repositories, READMEs, code evidence, languages, commits |
