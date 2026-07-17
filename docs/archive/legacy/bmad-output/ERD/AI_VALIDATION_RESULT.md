# Entity: AI_VALIDATION_RESULT

## Description
Stores the AI Skill Validation Agent's eligibility decision for each application. Contains the decision, confidence score, justification, matched/missing skills, and source attribution. This is Share-k's core differentiator — it determines whether an application reaches the project owner.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `application_id` | UUID | FK → APPLICATION.id, NOT NULL, UNIQUE | The validated application |
| `decision` | ENUM | NOT NULL | `eligible`, `ineligible`, `review_needed` |
| `confidence_score` | FLOAT | NOT NULL | 0.0 to 1.0 |
| `justification` | TEXT | NOT NULL | AI-generated explanation of the decision |
| `matched_skills` | JSONB | NULLABLE | Skills that matched task requirements |
| `missing_skills` | JSONB | NULLABLE | Skills the contributor lacks |
| `source_attribution` | JSONB | NULLABLE | Evidence sources used (repos, commits, etc.) |
| `model_used` | VARCHAR(50) | NULLABLE | e.g. `gpt-4o` |
| `latency_ms` | INTEGER | NULLABLE | Agent execution time |
| `created_at` | TIMESTAMP | NOT NULL | When validation was performed |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| APPLICATION | 1:1 | Each application gets exactly one validation |
| DISPUTE | 1:N | Can be disputed by the contributor |

## Business Rules

1. **One Per Application**: Each application is validated exactly once (retry creates a new record if needed).
2. **Gate Logic**: `eligible` → forwards to owner; `ineligible` → blocks; `review_needed` → flags for admin/manual review.
3. **Low Confidence**: If `confidence_score < threshold`, decision defaults to `review_needed` rather than making an unsupported trust decision.
4. **Explainability**: `justification` and `source_attribution` must be provided for transparency (NFR-003).
5. **Disputability**: Contributors can dispute ineligible decisions via the DISPUTE entity.

## PRD: FR-051–FR-059, NFR-003, NFR-006
