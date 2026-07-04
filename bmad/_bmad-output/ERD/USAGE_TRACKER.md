# Entity: USAGE_TRACKER

## Description
Tracks daily/monthly action counts for premium limit enforcement. Used to check whether an owner has exceeded their monthly order limit or a contributor has exceeded their daily application limit before allowing the action.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `user_id` | UUID | FK → USER.id, NOT NULL | The user |
| `action_type` | ENUM | NOT NULL | `order_created`, `application_submitted` |
| `period_date` | DATE | NOT NULL | Date of the action (for daily limits) or first day of month (for monthly limits) |
| `count` | INTEGER | NOT NULL, DEFAULT 0 | Number of actions in this period |
| `created_at` | TIMESTAMP | NOT NULL | Created |
| `updated_at` | TIMESTAMP | NOT NULL | Updated |

## Unique Constraint
`UNIQUE(user_id, action_type, period_date)` — One counter per user per action type per period.

## Relationships

| Related Entity | Relationship | Description |
|---------------|-------------|-------------|
| USER | N:1 | Tracks usage for a user |

## Business Rules

1. **Atomic Increment**: Count is incremented atomically when an action is attempted.
2. **Limit Check**: Before allowing an action, the system checks current count against the user's plan limit:
   - Owner orders: Bronze 10/month, Silver 20/month, Gold 30/month
   - Contributor applications: Bronze 2/day, Silver 3/day, Gold 4/day
3. **Period Reset**: Daily counters use the current date. Monthly counters use the first day of the month. No manual reset needed.
4. **Plan Change**: If a user upgrades/downgrades mid-period, the new limit applies to the remaining period.

## PRD: FR-050, FR-076, FR-081
