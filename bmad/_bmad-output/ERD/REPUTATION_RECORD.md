# Entity: REPUTATION_RECORD

## Description
Aggregated contributor reputation metrics computed from verified platform activity. Contains overall rating, completed contribution count, success rate, and top verified skills. This is a materialized/cached view that gets recalculated after each approved delivery review.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `user_id` | UUID | FK → USER.id, NOT NULL, UNIQUE | The contributor |
| `overall_rating` | FLOAT | NULLABLE | Aggregated 1.0–5.0 average |
| `total_contributions` | INTEGER | DEFAULT 0 | Total completed contributions |
| `successful_contributions` | INTEGER | DEFAULT 0 | Successfully approved count |
| `success_rate` | FLOAT | DEFAULT 0.0 | Percentage (0.0–100.0) |
| `top_verified_skills` | JSONB | NULLABLE | Top N approved skills |
| `total_ratings_received` | INTEGER | DEFAULT 0 | Number of ratings received |
| `last_updated_at` | TIMESTAMP | NOT NULL | Last recalculation time |
| `created_at` | TIMESTAMP | NOT NULL | Created |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| USER | 1:1 | One reputation record per contributor |

## Business Rules

1. **One Per Contributor**: Each contributor has exactly one aggregated reputation record.
2. **Verified Data Only**: Only approved delivery outcomes and owner ratings contribute. Self-declared skills and raw GitHub stats do not.
3. **Recalculation Trigger**: Updated whenever a DELIVERY_REVIEW is created with `outcome = 'approved'`.
4. **Matching Signal**: Higher reputation increases chances of being selected and is used by the AI Contributor Matching Agent.
5. **Public Profile**: Reputation data is visible on the contributor's public profile.

## Example

```json
{
  "overall_rating": 4.8,
  "total_contributions": 18,
  "successful_contributions": 17,
  "success_rate": 94.4,
  "top_verified_skills": ["React", "Node.js", "TypeScript"]
}
```

## PRD: FR-021, FR-066–FR-072
