# Entity: DELIVERY_REVIEW

## Description
The project owner's review of a submitted delivery. Contains the rating (1-5), textual feedback, and outcome decision. This data feeds directly into the contributor's REPUTATION_RECORD.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `delivery_id` | UUID | FK → DELIVERY.id, NOT NULL, UNIQUE | The reviewed delivery |
| `reviewer_id` | UUID | FK → USER.id, NOT NULL | Project owner who reviewed |
| `rating` | INTEGER | NOT NULL, CHECK 1-5 | Numeric rating |
| `feedback` | TEXT | NULLABLE | Owner textual feedback |
| `outcome` | ENUM | NOT NULL | `approved`, `rejected`, `revision_requested` |
| `created_at` | TIMESTAMP | NOT NULL | When review was submitted |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| DELIVERY | 1:1 | Each delivery gets one review |
| USER | N:1 | Reviewer is the project owner |

## Business Rules

1. **One Review Per Delivery**: Each delivery receives exactly one review.
2. **Reviewer = Owner**: Only the project owner (or authorized team member) can review.
3. **Rating Required**: Rating is mandatory on approval. Feedback is optional but encouraged.
4. **Reputation Feed**: Approved reviews with ratings feed into REPUTATION_RECORD calculations.
5. **No Completion Without Approval**: A contribution is not counted as completed until `outcome = 'approved'`.

## PRD: FR-008, FR-009, FR-062, FR-063, FR-065
