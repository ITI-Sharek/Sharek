# Entity: DELIVERY

## Description
Records a contributor's submitted work (GitHub PR link) for an accepted contribution request. Once a contributor is accepted, they work on the task and submit a pull request URL as evidence of completion.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `application_id` | UUID | FK → APPLICATION.id, NOT NULL, UNIQUE | The accepted application |
| `contribution_request_id` | UUID | FK → CONTRIBUTION_REQUEST.id, NOT NULL | The task (denormalized) |
| `contributor_id` | UUID | FK → USER.id, NOT NULL | The contributor (denormalized) |
| `pr_url` | VARCHAR(500) | NOT NULL | GitHub Pull Request link |
| `contributor_notes` | TEXT | NULLABLE | Notes from the contributor |
| `status` | ENUM | NOT NULL, DEFAULT `submitted` | `submitted`, `under_review`, `approved`, `rejected`, `revision_requested` |
| `submitted_at` | TIMESTAMP | NOT NULL | When PR was submitted |
| `reviewed_at` | TIMESTAMP | NULLABLE | When owner reviewed |
| `created_at` | TIMESTAMP | NOT NULL | Created |
| `updated_at` | TIMESTAMP | NOT NULL | Updated |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| APPLICATION | 1:1 | One delivery per accepted application |
| CONTRIBUTION_REQUEST | N:1 | For which task |
| USER | N:1 | Who delivered |
| DELIVERY_REVIEW | 1:1 | Owner's review of this delivery |

## Business Rules

1. **Only Accepted Applications**: A delivery can only be created when `application.status = 'accepted'`.
2. **One Per Application**: A contributor submits one delivery per accepted application.
3. **Status Flow**: `submitted` → `under_review` → `approved` / `rejected` / `revision_requested`.
4. **Approved = Completed**: An approved delivery marks the contribution as complete and feeds the REPUTATION_RECORD.
5. **PR Validation**: The `pr_url` should be a valid GitHub PR URL format.

## PRD: FR-007, FR-008, FR-020, FR-060–FR-065
