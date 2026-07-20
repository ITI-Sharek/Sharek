# Database Plan

## Decision

Use PostgreSQL with pgvector as the primary database for the MVP.

Prisma owns schema definitions and migrations.

## Why PostgreSQL

Share-k has strongly relational data:

- Users.
- Roles.
- GitHub accounts.
- Projects.
- Contribution tasks.
- Applications.
- Skill reviews.
- Delivery reviews.
- Reputation history.
- Admin actions.

PostgreSQL gives strong transactions, constraints, indexing, and query behavior
without adding multiple persistence systems.

## Why pgvector

pgvector is enough for MVP semantic use cases:

- Project discovery.
- Skill evidence retrieval.
- Contributor-to-task matching support.
- Similarity over repository or task summaries.

Use a dedicated vector database later only if pgvector becomes a measured
bottleneck or retrieval requirements become specialized.

## Table Ownership

Every table has one owning module:

```text
identity              users, auth_sessions, auth_provider_accounts, auth_oauth_states, email_verification_otps
github                github_accounts, github_oauth_states, github_repositories, github_evidence
contributor-profiles  contributor_profiles, contributor_fields, contributor_profile_fields
skill-profiles        skill_profiles, skill_profile_generations, skill_profile_review_decisions, skills, skill_evidence, skill_reviews
notifications         notifications
projects              projects, project_technologies, project_tags
contribution-tasks    contribution_tasks, task_required_skills
applications          applications, application_eligibility_results, application_status_history
delivery-reviews      deliveries, delivery_reviews
reputation            reputation_profiles, reputation_events
admin                 admin_review_queue, reports, disputes, moderation_actions
ai                    ai_call_audit, AI service response snapshots, embeddings where backend-owned
```

Only the owning module writes its tables.

Prompt definitions and provider-specific model execution belong in the separate
FastAPI AI repository. The backend stores the metadata and snapshots needed for
business auditability.

## AI Audit Data

For AI-generated or AI-assisted results, store:

- Provider.
- Model.
- Prompt version.
- Output schema version.
- AI service version.
- Confidence.
- Evidence IDs.
- Decision recommendation.
- Backend final decision.
- Failure reason if any.
- Created timestamp.

This is required for debugging, admin review, and trust.

`SkillProfileGeneration.status` separates queue/analysis lifecycle from skill
review lifecycle. Terminal generation states are `pending_review`,
`needs_more_evidence`, and `failed`.

`SkillProfile.skill_key` stores the canonical comparison key used to merge
aliases and prevent repeated pending claims. When a later generation proposes
the same canonical skill, older pending rows become `superseded`; approved
skills are never automatically replaced by AI output. Generation snapshots
remain available for audit.

`SkillProfileReviewDecision` is an append-only audit table for admin review
actions on generated skills. Each approve, reject, or proficiency-adjustment
action stores reviewer, timestamp, before/after status, before/after
proficiency, and notes where present. The latest review state remains on
`SkillProfile` for fast reads, but the decision table preserves history.

`Notification` stores contributor-facing skill review outcomes. The
`notifications` module owns writes to that table. Review workflows in other
modules must call the exported notification service instead of writing the
table directly.

Migration `20260714130000_normalize_skill_profile_keys` aligns historical
aliases such as `ts`, `js`, and `c sharp` with the same canonical policy.

## Vector Rules

- Store embeddings for stable text snapshots, not constantly changing raw text.
- Keep source IDs so every vector result points back to evidence.
- Store embedding model and dimensions.
- Do not use vector similarity as the only eligibility rule.
- Use deterministic rules and approved skills before LLM explanation.

## Migration Rules

- Every schema change requires a Prisma migration.
- Do not edit production data manually as a normal workflow.
- Add indexes for common filters and foreign keys.
- Use pagination on large tables.
- Avoid caching until query measurements justify it.
