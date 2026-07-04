# Entity: SUBSCRIPTION

## Description
Tracks premium subscription plans for users. Share-k offers separate plan tiers (Bronze, Silver, Gold) for both project owners and contributors, each with distinct limits and benefits. A user can have subscription history, but only one active subscription per role context at any time.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK, NOT NULL, AUTO-GENERATED | Unique identifier |
| `user_id` | UUID | FK → USER.id, NOT NULL | The subscribing user |
| `plan_type` | ENUM | NOT NULL | One of: `bronze`, `silver`, `gold` |
| `user_role_context` | ENUM | NOT NULL | One of: `owner`, `contributor` — determines which plan table applies |
| `status` | ENUM | NOT NULL, DEFAULT `active` | One of: `active`, `cancelled`, `expired` |
| `starts_at` | TIMESTAMP | NOT NULL | When the subscription becomes effective |
| `expires_at` | TIMESTAMP | NULLABLE | When the subscription period ends |
| `cancelled_at` | TIMESTAMP | NULLABLE | When the user cancelled (if applicable) |
| `created_at` | TIMESTAMP | NOT NULL, AUTO-GENERATED | Record creation time |
| `updated_at` | TIMESTAMP | NOT NULL, AUTO-UPDATED | Last modification time |

## Indexes

| Index Name | Columns | Type | Purpose |
|-----------|---------|------|---------|
| `pk_subscription` | `id` | PRIMARY KEY | Row identity |
| `idx_subscription_user` | `user_id` | B-TREE | Find subscriptions for a user |
| `idx_subscription_active` | `user_id, user_role_context, status` | UNIQUE (partial: WHERE status = 'active') | Enforce one active subscription per role context |
| `idx_subscription_expires` | `expires_at` | B-TREE | Find expiring subscriptions for batch processing |

## Relationships

| Related Entity | Relationship | FK Location | Description |
|---------------|-------------|-------------|-------------|
| USER | N:1 | `subscription.user_id` → `user.id` | Each subscription belongs to a user |

## Plan Limits Reference

### Owner Plans

| Plan | Monthly Orders | AI Matching | Visibility | Commission |
|------|---------------|-------------|------------|------------|
| Bronze | 10 | ❌ | Standard | Standard |
| Silver | 20 | Top 5 matches | Priority | Standard |
| Gold | 30 | Top 10 matches + auto-notify | Priority | No commission |

### Contributor Plans

| Plan | Daily Applications | Notifications | AI Guidance | Commission |
|------|-------------------|---------------|-------------|------------|
| Bronze | 2 | Basic task notifications | ❌ | Standard |
| Silver | 3 | Skill-matched notifications | ❌ | Reduced |
| Gold | 4 | AI-recommended tasks | Skill-gap feedback on rejection | No commission |

## Business Rules

1. **One Active Per Context**: A user can have at most one `active` subscription for `owner` and one for `contributor` at any time.
2. **Default Plan**: All new users start on Bronze. No payment is needed for Bronze.
3. **Upgrade/Downgrade**: Changing plans creates a new subscription record and marks the old one as `cancelled` or `expired`. The new plan's limits apply to future actions — existing contribution history is preserved.
4. **Limit Enforcement**: Plan limits are enforced via the `USAGE_TRACKER` entity, not directly by this entity. This entity provides the current plan context.
5. **Benefit Gating**: Premium features (AI matching, skill-gap guidance, priority visibility) check `plan_type` and `status` before execution.

## PRD Traceability

| Functional Requirement | Description |
|----------------------|-------------|
| FR-010 | Enforce owner premium plan limits and benefits |
| FR-022 | Enforce contributor premium plan limits and benefits |
| FR-073 | Bronze owner: 10 orders/month, standard visibility |
| FR-074 | Silver owner: 20 orders/month, top-5 matching, priority |
| FR-075 | Gold owner: 30 orders/month, top-10 matching, auto-notify, no commission |
| FR-078 | Bronze contributor: 2 apps/day, basic notifications |
| FR-079 | Silver contributor: 3 apps/day, skill-matched notifications, reduced commission |
| FR-080 | Gold contributor: 4 apps/day, AI-recommended tasks, skill-gap guidance, no commission |
