# Entity: CONTRIBUTION_REQUEST

## Description
Represents a structured contribution task (order) created by a project owner. Each request specifies required technologies, difficulty, deadline, and optional reward. Published requests appear in the task feed.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `project_id` | UUID | FK → PROJECT.id, NOT NULL | Parent project |
| `owner_id` | UUID | FK → USER.id, NOT NULL | Project owner (denormalized) |
| `title` | VARCHAR(255) | NOT NULL | Task title |
| `description` | TEXT | NOT NULL | Detailed work description |
| `required_technologies` | JSONB | NOT NULL | e.g. `["Node.js", "JWT"]` |
| `difficulty` | ENUM | NOT NULL | `beginner`, `intermediate`, `advanced` |
| `deadline` | DATE | NULLABLE | Due date |
| `reward` | DECIMAL(10,2) | NULLABLE | Optional monetary reward |
| `reward_currency` | VARCHAR(3) | NULLABLE | e.g. `USD` |
| `status` | ENUM | NOT NULL, DEFAULT `draft` | `draft`, `published`, `assigned`, `completed`, `cancelled` |
| `max_applicants` | INTEGER | DEFAULT 1 | Max accepted contributors |
| `published_at` | TIMESTAMP | NULLABLE | Publication time |
| `created_at` | TIMESTAMP | NOT NULL | Created |
| `updated_at` | TIMESTAMP | NOT NULL | Updated |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| PROJECT | N:1 | Linked to a published project |
| USER | N:1 | Created by a project owner |
| APPLICATION | 1:N | Receives contributor applications |
| AI_MATCH_RESULT | 1:N | AI-generated contributor matches |
| SKILL_GAP_GUIDANCE | 1:N | Gap guidance triggered by requirements |

## Business Rules

1. Only created for `published` projects
2. Counts against owner monthly order limit (Bronze:10, Silver:20, Gold:30)
3. Lifecycle: `draft` → `published` → `assigned` → `completed`; `cancelled` at any time
4. Only `published` requests appear in contributor task feed
5. Requirements indexed for AI validation and matching

## PRD: FR-004, FR-046–FR-050
