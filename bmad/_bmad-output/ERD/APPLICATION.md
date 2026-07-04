# Entity: APPLICATION

## Description
Represents a contributor's application to a contribution request. This is the central entity in Share-k's AI-gated application flow. When submitted, it triggers the AI Skill Validation Agent which determines eligibility before the application can reach the project owner.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `contribution_request_id` | UUID | FK → CONTRIBUTION_REQUEST.id, NOT NULL | The task being applied to |
| `contributor_id` | UUID | FK → USER.id, NOT NULL | The applying contributor |
| `cover_message` | TEXT | NULLABLE | Optional message to the owner |
| `status` | ENUM | NOT NULL, DEFAULT `pending_validation` | `pending_validation`, `eligible`, `ineligible`, `accepted`, `rejected`, `withdrawn` |
| `is_priority` | BOOLEAN | DEFAULT false | Gold-tier priority flag |
| `submitted_at` | TIMESTAMP | NOT NULL | When contributor submitted |
| `validated_at` | TIMESTAMP | NULLABLE | When AI validation completed |
| `owner_reviewed_at` | TIMESTAMP | NULLABLE | When owner made a decision |
| `created_at` | TIMESTAMP | NOT NULL | Created |
| `updated_at` | TIMESTAMP | NOT NULL | Updated |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| CONTRIBUTION_REQUEST | N:1 | Application targets a specific task |
| USER | N:1 | Submitted by a contributor |
| AI_VALIDATION_RESULT | 1:1 | AI eligibility decision |
| DELIVERY | 1:1 | Resulting delivery (if accepted) |
| SKILL_GAP_GUIDANCE | 1:1 | Gap guidance (if ineligible + Gold tier) |

## Status Lifecycle

```
submitted → pending_validation → AI validates
                                    ↓
                          ┌─── eligible ───→ owner reviews → accepted / rejected
                          │
                          └─── ineligible ──→ (Gold: triggers SKILL_GAP_GUIDANCE)
                          
accepted → contributor works → submits DELIVERY
```

## Business Rules

1. **AI Gate**: Every application triggers AI validation. No application reaches the owner without passing.
2. **Unique Application**: A contributor cannot apply twice to the same contribution request (UNIQUE constraint on `contributor_id + contribution_request_id`).
3. **Daily Limits**: Application submission is gated by contributor's daily application limit (Bronze:2, Silver:3, Gold:4) via USAGE_TRACKER.
4. **Skill Requirements**: Only `approved` skills qualify. Pending, rejected, or disputed skills never qualify.
5. **Priority**: Gold-tier contributors get `is_priority = true` for higher visibility in owner review queues.
6. **Withdrawal**: Contributors can withdraw an application before owner acceptance.

## PRD: FR-005, FR-006, FR-017, FR-018, FR-019, FR-051–FR-059
