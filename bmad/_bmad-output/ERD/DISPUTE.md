# Entity: DISPUTE

## Description
Allows contributors to challenge AI-generated skill assessments or validation decisions they believe are inaccurate. Disputes are reviewed by admins who can uphold, overturn, or dismiss the challenge.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `user_id` | UUID | FK → USER.id, NOT NULL | Contributor who disputes |
| `skill_profile_id` | UUID | FK → SKILL_PROFILE.id, NULLABLE | Disputed skill |
| `ai_validation_result_id` | UUID | FK → AI_VALIDATION_RESULT.id, NULLABLE | Disputed validation |
| `type` | ENUM | NOT NULL | `skill_assessment`, `validation_decision` |
| `reason` | TEXT | NOT NULL | Why the contributor disagrees |
| `evidence` | TEXT | NULLABLE | Supporting evidence |
| `status` | ENUM | NOT NULL, DEFAULT `open` | `open`, `under_review`, `upheld`, `overturned`, `dismissed` |
| `resolved_by` | UUID | FK → USER.id (admin), NULLABLE | Admin who resolved |
| `resolution_notes` | TEXT | NULLABLE | Resolution explanation |
| `resolved_at` | TIMESTAMP | NULLABLE | When resolved |
| `created_at` | TIMESTAMP | NOT NULL | Created |
| `updated_at` | TIMESTAMP | NOT NULL | Updated |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| USER | N:1 | Filed by a contributor |
| SKILL_PROFILE | N:1 | Disputed skill (if type = skill_assessment) |
| AI_VALIDATION_RESULT | N:1 | Disputed validation (if type = validation_decision) |

## Business Rules

1. Disputed skills/validations never silently qualify a contributor.
2. `overturned` disputes trigger skill re-evaluation or validation override.
3. One of `skill_profile_id` or `ai_validation_result_id` must be set based on `type`.

## PRD: FR-059, NFR-002
