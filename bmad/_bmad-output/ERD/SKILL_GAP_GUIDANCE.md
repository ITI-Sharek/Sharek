# Entity: SKILL_GAP_GUIDANCE

## Description
AI-generated learning guidance for Gold-tier contributors who are rejected by the AI validation gate. Instead of just a rejection notice, Gold contributors receive actionable guidance: missing skills, recommended technologies, learning resources, practice projects, and an estimated improvement timeline.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `application_id` | UUID | FK → APPLICATION.id, NOT NULL | The rejected application |
| `contributor_id` | UUID | FK → USER.id, NOT NULL | The Gold contributor |
| `contribution_request_id` | UUID | FK → CONTRIBUTION_REQUEST.id, NOT NULL | The task they failed to qualify for |
| `missing_skills` | JSONB | NOT NULL | Skills needed but not met |
| `recommended_technologies` | JSONB | NULLABLE | Technologies to learn |
| `learning_resources` | JSONB | NULLABLE | Tutorials, docs, courses |
| `practice_projects` | JSONB | NULLABLE | Suggested practice projects |
| `estimated_improvement_time` | VARCHAR(50) | NULLABLE | e.g. "4-6 weeks" |
| `guidance_narrative` | TEXT | NULLABLE | Full AI-generated guidance text |
| `source_attribution` | JSONB | NULLABLE | Evidence sources used |
| `model_used` | VARCHAR(50) | NULLABLE | e.g. `gpt-4o` |
| `created_at` | TIMESTAMP | NOT NULL | Created |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| APPLICATION | N:1 | Triggered by a rejected application |
| USER | N:1 | For a specific Gold contributor |
| CONTRIBUTION_REQUEST | N:1 | Against this task's requirements |

## Business Rules

1. **Gold Only**: Only generated for contributors with an active Gold subscription.
2. **Rejection Trigger**: Only generated when `AI_VALIDATION_RESULT.decision = 'ineligible'`.
3. **Streamed Response**: Supports streamed AI responses for better UX (FR-085).
4. **Source Attribution**: Includes evidence sources where available.

## Example Output

```json
{
  "missing_skills": ["JWT", "OAuth 2.0"],
  "recommended_technologies": ["jsonwebtoken", "passport.js"],
  "learning_resources": ["JWT.io Introduction", "Auth0 Node.js Tutorial"],
  "practice_projects": ["Build a token-based auth API"],
  "estimated_improvement_time": "2-3 weeks"
}
```

## PRD: FR-057, FR-080, FR-082, FR-092
