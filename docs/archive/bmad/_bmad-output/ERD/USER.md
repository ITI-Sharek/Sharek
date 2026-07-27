# Entity: USER

## Description
The central identity entity for all platform participants. Every person interacting with Share-k — whether a project owner, contributor, or admin — is represented as a `USER`. This entity holds authentication credentials, profile information, role assignment, and account status.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK, NOT NULL, AUTO-GENERATED | Unique identifier for the user |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | User's email address, used for login |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt/Argon2 hashed password |
| `first_name` | VARCHAR(100) | NOT NULL | User's first name |
| `last_name` | VARCHAR(100) | NOT NULL | User's last name |
| `avatar_url` | VARCHAR(500) | NULLABLE | URL to user's profile picture (may sync from GitHub) |
| `role` | ENUM | NOT NULL | One of: `owner`, `contributor`, `admin` |
| `status` | ENUM | NOT NULL, DEFAULT `pending` | One of: `pending`, `active`, `suspended`, `deactivated` |
| `preferred_language` | VARCHAR(5) | DEFAULT `en` | UI language preference: `ar` (Arabic) or `en` (English) |
| `created_at` | TIMESTAMP | NOT NULL, AUTO-GENERATED | Account creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL, AUTO-UPDATED | Last modification timestamp |
| `last_login_at` | TIMESTAMP | NULLABLE | Timestamp of most recent login |

## Indexes

| Index Name | Columns | Type | Purpose |
|-----------|---------|------|---------|
| `pk_user` | `id` | PRIMARY KEY | Row identity |
| `uq_user_email` | `email` | UNIQUE | Prevent duplicate accounts |
| `idx_user_role` | `role` | B-TREE | Filter users by role for admin views |
| `idx_user_status` | `status` | B-TREE | Filter by account status |
| `idx_user_created_at` | `created_at` | B-TREE | Sort by registration date |

## Relationships

| Related Entity | Relationship | FK Location | Description |
|---------------|-------------|-------------|-------------|
| SUBSCRIPTION | 1:N | `subscription.user_id` → `user.id` | Subscription history (one active per role context) |
| GITHUB_ACCOUNT | 1:1 | `github_account.user_id` → `user.id` | Connected GitHub OAuth account |
| PROJECT | 1:N | `project.owner_id` → `user.id` | Projects owned by this user |
| SKILL_PROFILE | 1:N | `skill_profile.user_id` → `user.id` | AI-generated skills (one record per skill) |
| REPUTATION_RECORD | 1:1 | `reputation_record.user_id` → `user.id` | Aggregated reputation metrics |
| APPLICATION | 1:N | `application.contributor_id` → `user.id` | Applications submitted |
| NOTIFICATION | 1:N | `notification.user_id` → `user.id` | Notifications received |
| REPORT | 1:N | `report.reporter_id` → `user.id` | Reports filed by this user |
| DISPUTE | 1:N | `dispute.user_id` → `user.id` | Disputes raised |
| USAGE_TRACKER | 1:N | `usage_tracker.user_id` → `user.id` | Usage counts for premium limits |
| AI_MATCH_RESULT | 1:N | `ai_match_result.contributor_id` → `user.id` | Matching results (as matched contributor) |
| SKILL_PROFILE | 1:N | `skill_profile.reviewed_by` → `user.id` | Skills reviewed by this admin |
| DELIVERY_REVIEW | 1:N | `delivery_review.reviewer_id` → `user.id` | Delivery reviews made by this owner |
| AUTH_SESSION | 1:N | `auth_session.user_id` → `user.id` | Login sessions and token refresh state |
| GITHUB_OAUTH_STATE | 1:N | `github_oauth_state.user_id` → `user.id` | Short-lived GitHub OAuth callback states |

## Business Rules

1. **Role Assignment**: A user is assigned exactly one role at registration. Role changes require admin action.
2. **Account Activation**:
   - **Owners**: Become `active` after email verification and GitHub connection.
   - **Contributors**: Remain `pending` until their AI-generated skill profile is reviewed and at least partially approved by an admin.
   - **Admins**: Set to `active` by a super-admin or through a seeded account.
3. **Soft Delete**: Users are `deactivated` rather than hard-deleted to preserve contribution and reputation history.
4. **Suspension**: Admins can `suspend` accounts found to engage in fraud, misuse, or reputation manipulation.
5. **Bilingual Support**: `preferred_language` drives UI locale (Arabic with RTL layout, or English with LTR).

## PRD Traceability

| Functional Requirement | Description |
|----------------------|-------------|
| FR-001 | Project owner connects GitHub account |
| FR-011 | Contributor registers and connects GitHub |
| FR-023 | Admin reviews AI-generated skill profiles |
| NFR-004 | Arabic and English UX support |
