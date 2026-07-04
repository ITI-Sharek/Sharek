# Entity: NOTIFICATION

## Description
In-app notifications for users. Covers application status changes, skill review outcomes, delivery updates, AI match results, task recommendations, and system alerts.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `user_id` | UUID | FK → USER.id, NOT NULL | Notification recipient |
| `type` | ENUM | NOT NULL | `application_status`, `skill_review`, `delivery_update`, `match_found`, `task_recommendation`, `plan_limit`, `system` |
| `title` | VARCHAR(255) | NOT NULL | Notification title |
| `message` | TEXT | NOT NULL | Notification body |
| `metadata` | JSONB | NULLABLE | Links, entity IDs, extra context |
| `is_read` | BOOLEAN | DEFAULT false | Read status |
| `read_at` | TIMESTAMP | NULLABLE | When read |
| `created_at` | TIMESTAMP | NOT NULL | Created |

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| USER | N:1 | Sent to a user |

## Business Rules

1. Notifications are role-aware: owners get application/delivery notifications; contributors get status/match notifications.
2. Premium-tier notifications (skill-matched, AI-recommended) only sent to eligible plan tiers.
3. Gold owners get automatic notifications for best-matching contributors.
4. Notifications are soft-deleted/archived, never hard-deleted.

## PRD: FR-075 (auto-notify), FR-078–FR-080 (tier-based notifications)
