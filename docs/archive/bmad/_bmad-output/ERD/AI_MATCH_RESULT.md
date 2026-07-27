# Entity: AI_MATCH_RESULT

## Description
AI-generated contributor ranking for a contribution request. The Contributor Matching Agent evaluates contributors based on approved skills, task requirements, and reputation signals, producing a ranked list of top matches. Available only to Silver (top 5) and Gold (top 10) owner plans.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `contribution_request_id` | UUID | FK → CONTRIBUTION_REQUEST.id, NOT NULL | The task being matched |
| `contributor_id` | UUID | FK → USER.id, NOT NULL | Matched contributor |
| `match_score` | FLOAT | NOT NULL | 0.0 to 1.0 |
| `justification` | TEXT | NULLABLE | Why this contributor matches |
| `matched_skills` | JSONB | NULLABLE | Skills aligned with task |
| `reputation_signals` | JSONB | NULLABLE | Reputation factors used |
| `source_attribution` | JSONB | NULLABLE | Evidence sources |
| `rank` | INTEGER | NOT NULL | Position in top-N list |
| `model_used` | VARCHAR(50) | NULLABLE | e.g. `gpt-4o` |
| `notification_sent` | BOOLEAN | DEFAULT false | Whether auto-notification was sent |
| `created_at` | TIMESTAMP | NOT NULL | Created |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| CONTRIBUTION_REQUEST | N:1 | Matches are for a specific task |
| USER | N:1 | Each match references a contributor |

## Business Rules

1. **Premium Only**: Silver owners get top 5; Gold owners get top 10.
2. **Auto-Notify (Gold)**: Gold owner matches trigger automatic notifications to contributors.
3. **Approved Skills Only**: Matching uses only `approved` skill profiles.
4. **Reputation Signal**: Higher reputation scores boost match ranking.

## PRD: FR-074, FR-075, FR-077, FR-093
