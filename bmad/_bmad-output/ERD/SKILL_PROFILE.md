# Entity: SKILL_PROFILE

## Description
Individual AI-generated skill record for a contributor. Each record represents one skill (e.g., "Python") with its proficiency level, confidence score, and evidence sources from GitHub data. Skills start in `pending` status and require admin approval before they can qualify a contributor for any task.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `user_id` | UUID | FK → USER.id, NOT NULL | The contributor |
| `skill_name` | VARCHAR(100) | NOT NULL | e.g. "Python", "React", "Docker" |
| `proficiency_level` | ENUM | NOT NULL | `beginner`, `intermediate`, `advanced` |
| `confidence_score` | FLOAT | NOT NULL | 0.0 to 1.0, AI confidence |
| `evidence_summary` | TEXT | NULLABLE | AI explanation of evidence |
| `evidence_sources` | JSONB | NULLABLE | Repos, files, commits used as evidence |
| `status` | ENUM | NOT NULL, DEFAULT `pending` | `pending`, `approved`, `rejected`, `disputed` |
| `reviewed_by` | UUID | FK → USER.id (admin), NULLABLE | Admin who reviewed |
| `admin_notes` | TEXT | NULLABLE | Admin adjustment notes |
| `original_proficiency` | ENUM | NULLABLE | Level before admin adjustment |
| `reviewed_at` | TIMESTAMP | NULLABLE | When admin reviewed |
| `created_at` | TIMESTAMP | NOT NULL | Created |
| `updated_at` | TIMESTAMP | NOT NULL | Updated |

## Unique Constraint
`UNIQUE(user_id, skill_name)` — A contributor has at most one record per skill name.

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| USER | N:1 | Belongs to a contributor |
| USER (admin) | N:1 | Reviewed by an admin |
| DISPUTE | 1:N | Can be disputed |

## Business Rules

1. **Human-in-the-Loop Gate**: Generated skills remain `pending` until admin review. `pending` and `rejected` skills **never** qualify a contributor for tasks.
2. **Admin Adjustment**: Admins can change `proficiency_level` (stored as `original_proficiency` for audit).
3. **Evidence Traceability**: Each skill must link back to GitHub evidence (FR-033).
4. **Re-profiling**: If a contributor reconnects GitHub or new repos are synced, the AI can regenerate skills which enter `pending` again.
5. **Dispute Path**: Contributors can dispute rejected or inaccurate skill assessments.

## Example Output

```json
[
  {"skill_name": "Python", "proficiency_level": "advanced", "confidence_score": 0.92, "evidence_sources": ["repo:ml-pipeline", "repo:fastapi-app"]},
  {"skill_name": "React", "proficiency_level": "intermediate", "confidence_score": 0.78, "evidence_sources": ["repo:dashboard-ui"]},
  {"skill_name": "Docker", "proficiency_level": "beginner", "confidence_score": 0.65, "evidence_sources": ["repo:ml-pipeline/Dockerfile"]}
]
```

## PRD: FR-012–FR-014, FR-029–FR-033, NFR-001
