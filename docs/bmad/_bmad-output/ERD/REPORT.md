# Entity: REPORT

## Description
Trust and safety reports filed by users against other users, projects, contribution requests, applications, deliveries, or skill profiles. Admins investigate and resolve reports to prevent fraud, misuse, and reputation manipulation.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `reporter_id` | UUID | FK → USER.id, NOT NULL | User who filed the report |
| `reported_user_id` | UUID | FK → USER.id, NULLABLE | Reported user (if applicable) |
| `reported_content_id` | UUID | NULLABLE | ID of reported entity (polymorphic) |
| `reported_content_type` | ENUM | NULLABLE | `user`, `project`, `contribution_request`, `application`, `delivery`, `skill_profile` |
| `reason` | ENUM | NOT NULL | `fraud`, `misuse`, `reputation_manipulation`, `inaccurate_ai`, `harassment`, `other` |
| `description` | TEXT | NOT NULL | Detailed description |
| `status` | ENUM | NOT NULL, DEFAULT `open` | `open`, `investigating`, `resolved`, `dismissed` |
| `resolved_by` | UUID | FK → USER.id (admin), NULLABLE | Admin who resolved |
| `resolution_notes` | TEXT | NULLABLE | Resolution explanation |
| `resolved_at` | TIMESTAMP | NULLABLE | When resolved |
| `created_at` | TIMESTAMP | NOT NULL | Created |
| `updated_at` | TIMESTAMP | NOT NULL | Updated |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| USER (reporter) | N:1 | Filed by a user |
| USER (reported) | N:1 | Optionally against a user |
| USER (resolver) | N:1 | Resolved by an admin |

## Business Rules

1. Reports can target any content type via polymorphic reference.
2. Admins investigate and resolve — disputed claims never silently qualify contributors.
3. Resolved reports are archived, not deleted.

## PRD: FR-023–FR-026, NFR-002
