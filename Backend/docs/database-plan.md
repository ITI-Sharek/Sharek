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
identity              users, user_roles, refresh_tokens
github                github_accounts, github_repositories, github_evidence
skill-profiles        skill_profiles, skills, skill_evidence, skill_reviews
projects              projects, project_technologies, project_tags
contribution-tasks    contribution_tasks, task_required_skills
applications          applications, application_eligibility_results, application_status_history
delivery-reviews      deliveries, delivery_reviews
reputation            reputation_profiles, reputation_events
admin                 admin_review_queue, reports, disputes, moderation_actions
ai                    ai_prompt_versions, ai_call_audit, embeddings where shared
```

Only the owning module writes its tables.

## AI Audit Data

For AI-generated or AI-assisted results, store:

- Provider.
- Model.
- Prompt version.
- Output schema version.
- Confidence.
- Evidence IDs.
- Decision recommendation.
- Backend final decision.
- Failure reason if any.
- Created timestamp.

This is required for debugging, admin review, and trust.

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

