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
notifications         notifications, notification_events, notification_preferences, notification_category_preferences
projects              projects, project_operations, project_state_transitions, project_technologies, project_tags
contribution-tasks    contribution_requests, contribution_request_requirements, contribution_request_skill_requirements, contribution_request_audits
eligibility           eligibility_evaluations
applications          applications, application_requirement_snapshots, application_evidence_snapshots, application_audits
contribution-proposals contribution_proposals, contribution_proposal_versions, contribution_proposal_audits, project_proposal_intakes, contribution_proposal_misuse_reports
applications          applications, application_requirement_snapshots, application_evidence_snapshots, application_audits, owner_decisions, assignments
contribution-proposals contribution_proposals, contribution_proposal_versions, contribution_proposal_audits, project_proposal_intakes
delivery-reviews      deliveries, delivery_submissions, delivery_reviews, delivery_approved_events
reputation            reputation_records
subscriptions         Subscription
applications          UsageTracker (application_submitted tallies)
matching              AiMatchResult
admin                 admin_review_queue, reports, disputes, moderation_actions
ai                    ai_call_audit, AI service response snapshots, embeddings where backend-owned
```

Only the owning module writes its tables.

Contribution Proposal submissions are serialized per proposer and bounded by a
daily rate limit. Migration `20260730131000_allow_multiple_pending_proposals`
drops the earlier partial unique index so distinct pending suggestions to the
same Project are not conflated.

Owner responses (S4-B10) add `accepted`/`declined` proposal states, an
`accepted_at`/`declined_at`/`decline_reason` audit trail, and a
`ContributionProposalMisuseReport` table that stores an immutable evidence
snapshot for moderation. Acceptance writes attribution onto the resulting draft
Contribution Request: `origin_proposal_id` (unique, so a proposal can originate
at most one Request) and `attributed_contributor_id` both reference the accepted
proposal and its proposer with `ON DELETE SET NULL`. The `contribution-tasks`
module owns those Contribution Request columns; the `contribution-proposals`
module only supplies their values through the exported
`createDraftFromAcceptedProposal` call inside the acceptance transaction.
Migration `20260730130000_proposal_response_notifications` adds the
`proposal_status` notification type used for durable revision, acceptance, and
decline notifications.

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

`Notification` stores semantic, localized-in-reads Notification records. The
`notifications` module owns writes to `Notification`, `NotificationEvent`,
`NotificationPreference`, and `NotificationCategoryPreference`. Review and
workflow modules must call the exported notification service instead of
writing those tables directly.

`Notification` keeps a versioned template key/parameters, trusted relative
deep link, priority, read state, aggregate version, and nullable legacy
rendered columns during the compatibility window. `NotificationEvent` is an
append-only created/read-state outbox row with a stable event ID, recipient,
aggregate version, publication attempts, and safe handoff metadata. Its
foreign key cascades when the owning Notification is removed by retention.

`assignment-conversations` owns `AssignmentConversation`, `Message`, and
`MessageEvent`. `MessageEvent` is the append-only created-Message outbox: it
stores the stable event ID, conversation aggregate version, occurrence time,
publication attempts, and safe handoff status. The Message and its event append
inside one transaction; shared `/realtime` publication starts only after that
transaction commits. HTTP Message history remains authoritative during socket
outage or duplicate delivery.

`delivery-reviews` preserves each contributor command in immutable
`DeliverySubmission` rows and each owner decision in a per-submission
`DeliveryReview`. The current `Delivery` row is the lifecycle projection.
Approval also appends one rating-bearing `DeliveryApprovedEvent` outbox row in
the same transaction as the review and Request completion; the Reputation
module can poll unpublished facts and acknowledge them without writing
Delivery-owned tables. Database checks enforce the approved-rating and
feedback-required contracts for all new review writes.

`ReputationRecord` is a replaceable materialized projection keyed one-to-one by
contributor user. `overall_rating` and `total_ratings_received` represent only
approved-Delivery owner ratings; `successful_contributions` counts approved
Deliveries; `total_contributions` stores the denominator of all assigned tasks;
and `success_rate` stores the percentage derived from those two counts.
`top_verified_skills` stores up to five `{ name,
verifiedContributionCount }` objects derived from owner-authored technology
tags on approved Contribution Requests. Only the `reputation` module writes the
record; Delivery's coordinator supplies facts through its public service seam.

`NotificationPreference` stores per-user retention, quiet hours, and revision;
`NotificationCategoryPreference` stores sparse per-category in-app/browser
overrides. Missing preferences use the documented 90-day retention and
browser-disabled defaults. Cleanup deletes only expired Notification rows and
lets the event cascade remove their corresponding outbox rows; workflow and
audit tables are never part of retention cleanup.

Application submission and withdrawal notifications use a nullable unique
`deduplication_key` so a retried Application command cannot create or deliver
the same durable notification twice.

Migration `20260729120000_owner_decisions_assignments` adds immutable human
Owner Decisions and one-to-one Assignments. Decline feedback remains nullable in
the Prisma type because acceptance stores null, while a PostgreSQL `CHECK`
requires declined decisions to contain non-null text whose `btrim` value is not
empty. Unique Assignment keys enforce at most one Assignment per Contribution
Request, Application, and accepted decision. Owner/idempotency-key uniqueness
supports exact command replay. `Report.owner_decision_id` links moderation to
the decision without changing the Application lifecycle.

Migration `20260714130000_normalize_skill_profile_keys` aligns historical
aliases such as `ts`, `js`, and `c sharp` with the same canonical policy.

Migration `20260728013000_contribution_request_drafts` evolves legacy
Contribution Request storage without deleting rows: `required_technologies` is
renamed to `technology_tags`, `deadline` becomes the optional
`target_completion_date`, and `applications_close_at` is added. Ordered Required
and Preferred Requirements live in relational rows with a unique
request/kind/position constraint. Append-only audit rows store actor, action,
state boundary, optional idempotency key and command fingerprint, reason, and
minimal metadata. Project ownership remains read through the exported Projects
service; the contribution-tasks module does not write Project tables.

Migration `20260728150000_application_owner_review_states` replaces the legacy
Application AI-validation enum with the direct owner-review lifecycle. Existing
`accepted` and `withdrawn` outcomes remain unchanged. Legacy `rejected` becomes
`declined_by_owner` only when `owner_reviewed_at` proves owner action. Other
unresolved rows return to `pending_owner_review` while actionable, become
`not_selected` when their Request is already assigned/completed, or become
`request_cancelled` when the parent Request is cancelled/discarded. A
transactional PostgreSQL fixture validates representative legacy rows through
`npm run test:migrations`. Unresolved Applications attached to a draft Request
fail the migration with a recovery hint because no approved owner-review state
can preserve that invalid, non-actionable history.

Migration `20260728200000_application_submission_withdrawal` adds the immutable
Requirement and authorized Evidence Snapshot records used by new Applications,
append-only Application audit rows, Contribution Approach, Proposed Delivery
Duration, review timing, and the unique contributor/Contribution Request guard.
Snapshot references and duration remain nullable only for legacy rows whose
historical submission inputs cannot be reconstructed without inventing data;
the Applications service always supplies them for new submissions.

Migration `20260728230000_contribution_request_publication` extends the
append-only Request audit actions with `published` and `cancelled`, extends
Application audits with `request_cancelled`, and adds an index over Request
status, Applications Close Time, and publication time for actionable public
reads. Cancellation updates current pending Application state and appends the
corresponding Application audits in the same transaction as the Request audit;
no Request or Application history is deleted.

Migration `20260729200000_application_review_window` adds the durable
`Application.review_reminder_sent_at` marker and indexes for bounded pending
reminder/expiry scans. It extends `ApplicationAuditAction` with `expired` and
makes `ApplicationAudit.actor_id` nullable so a scheduler-triggered expiry is
audited as a system action instead of being falsely attributed to a user. The
Application status, expiry timestamp, audit, and contributor notification are
stored atomically; the reminder marker and owner notification are likewise
atomic. The PostgreSQL migration harness validates the enum, null actor,
marker, indexes, and representative system expiry audit.

Migration `20260802120000_advisory_fit_assessments` adds the append-only
`AssessmentRequest`, `AssessmentAttempt`, `AdvisoryFitAssessment`,
`AssessmentFinding`, `AssessmentPresentation`, and `AssessmentRequestAudit`
tables. Requests retain the owner/key fingerprint and fixed Application
snapshot references. Attempts retain safe provider/model/prompt/schema/service
metadata, remain append-only, and link to the prior attempt for a bounded
technical retry. Findings retain Requirement kind, finding/confidence
vocabulary, citations, uncertainty, and explanation. Results are linked
through the attempt and can be presented once by the owner; no Application
lifecycle column is updated by assessment persistence.

## Vector Rules

- Store embeddings for stable text snapshots, not constantly changing raw text.
- Keep source IDs so every vector result points back to evidence.
- Store embedding model and dimensions.
- Do not use vector similarity as the only eligibility rule.
- Use deterministic rules and approved skills before LLM explanation.

## Subscription plans

`Subscription` is owned by the `subscriptions` module. No other module reads or
writes it; enforcement points ask `EntitlementsService` for the number they need.

Two migrations shape it:

- `20260814090000_single_paid_tier_plans` collapses the inherited
  Bronze/Silver/Gold ladder into `free | gold` (DEC-077). Postgres cannot drop a
  value from an enum in place, so the type is replaced and the column rewritten
  with an explicit `USING` mapping: bronze becomes free because bronze was the
  implicit default for users with no row, and silver becomes **gold** because
  silver was paid for and a paying user must not be downgraded by a migration.
- `20260814100000_subscription_source_and_billing_period` adds `source`
  (`default | admin | demo | payment_provider`, DEC-026),
  `current_period_start`, `current_period_end`, and `provider_subscription_id`,
  backfilling the period from the subscription lifetime for existing rows. A
  NULL `expires_at` stays NULL: an open-ended subscription has no period end,
  and a NULL end reads downstream as "not elapsed" rather than "elapsed at the
  epoch".

`starts_at`/`expires_at` describe the whole subscription; `current_period_*`
describe the period actually paid for, which is what entitlement resolution
reads. The bound is part of the query, so a lapsed plan grants nothing without
any background job having run. Index
`Subscription_user_id_user_role_context_status_starts_at_idx` covers that
resolution query, which runs at every enforcement point.

Both migrations transform existing rows, so both are replayed against a real
throwaway database by `pnpm run test:migrations:subscriptions`.

## Usage tallies

`UsageTracker` had been in the schema unused since the initial migration. It now
carries the contributor daily Application tally, keyed by (user, action, UTC
calendar day). Migration `20260814110000_usage_tracker_period_uniqueness` adds
the unique index on that key: the advisory lock serializes a contributor's
concurrent submissions, but a quota is made of the counter, so its uniqueness is
enforced by the database rather than by whoever remembers to take the lock.

The tally is written inside the Application submission transaction, so a failed
submission gives the slot back by rolling back rather than by decrementing.

## Match results

`AiMatchResult` is owned by the `matching` module. Migration
`20260814120000_drop_ai_match_notification_sent` drops `notification_sent`,
which existed for owner-side auto-notification of best-matching contributors —
a feature that is out of scope and will not be built. The column is dropped
rather than left unused because a boolean named `notification_sent` next to a
match row is an invitation to wire up the `match_found` notification on sight;
removing it makes the absence of the feature visible in the schema instead of
depending on someone reading a decision log first. Nothing had ever written or
read it.

The same migration adds `UNIQUE (contribution_request_id, contributor_id)` and
an index on `(contributor_id, created_at DESC)`. Recomputing a shortlist
replaces that contributor's rows rather than accumulating duplicates, and the
uniqueness that makes the replacement safe is enforced by the database rather
than by the writer remembering to delete first.

`match_score` remains an internal ordering signal and is never returned:
DEC-010 forbids presenting fit as a number, so the API exposes an ordinal
`rank` and a categorical `confidence` instead.

## Required skill levels

`ContributionRequestSkillRequirement` is owned by `contribution-tasks`.
Migration `20260814101636_contribution_request_skill_requirements` creates it
with **`UNIQUE (contribution_request_id, skill_name_normalized)`** and an
`ON DELETE CASCADE` from the Request.

The unique index is the actual invariant, not a convenience. The service
rejects duplicates before they reach the database, but that check reads and
writes in separate statements and is racy across two concurrent draft edits;
the index is what makes "one normalized skill name per Request" true rather
than usually true. It matters because an Eligibility Evaluation compares a
contributor against this set — a Request demanding both `advanced Node.js` and
`beginner nodejs` would contradict itself and produce an unexplainable refusal.
`skill_name_normalized` is written by `shared/skills/skill-name.ts`, the same
function `matching` compares with.

`required_level` uses the existing `SkillProfileProficiencyLevel` enum rather
than a parallel one, so the stored bar and a contributor's approved proficiency
are values of one type. A separate enum could gain a fourth value on one side
only, and the level comparison has no defined answer for a level it has never
seen.

The same migration adds `ApplicationRequirementSnapshot.skill_requirements`
(`JSONB NOT NULL DEFAULT '[]'`). It is a copy, not a foreign key: ADR 0015
requires that a published Request's edit history can never change why an
earlier contributor was blocked, which is only true if the Application holds
its own frozen record. The default means Applications predating the gate read
as "no bar", which is what they were — no backfill is needed or correct.

Because mocked jest suites cannot prove DDL,
`pnpm run test:migrations:skill-requirements` replays every migration against a
throwaway database and asserts the index, the cascade, the level vocabulary,
and that a snapshot survives its source rows being deleted and replaced.

## Eligibility evaluations

`EligibilityEvaluation` is owned by the `eligibility` module. Migration
`20260814143000_eligibility_evaluations` creates it append-only, with a **CHECK
permitting exactly one target**:

```sql
CHECK (num_nonnulls("contribution_request_id", "contribution_proposal_id") = 1)
```

Prisma cannot express a CHECK, so nothing derived from `schema.prisma` proves
it and the mocked jest suites never touch real DDL. It matters because a row
belonging to neither path — or to both — is a refusal nobody can attribute,
which defeats the point of keeping the log at all. `pnpm run
test:migrations:eligibility` asserts it against real Postgres, along with the
outcome vocabulary and the contributor `ON DELETE RESTRICT`.

`contribution_proposal_id` exists from the first migration even though only the
Application path writes it in `P0-B03`. The alternative — adding it in `P0-B04`
— would mean writing the CHECK twice and having a window where a Proposal
evaluation is unstorable.

**There are exactly two outcomes**, `eligible` and `blocked`. A provider outage
or an evaluation that could not run is a retriable error, never a third outcome
recorded against a contributor: the table is the record of decisions actually
made about a person, and an infrastructure failure is not one.

Rows are written for both outcomes. Recording only refusals would make the table
a list of accusations with no denominator and leave "was this person evaluated
at all?" unanswerable in a dispute.

The contributor foreign key is `ON DELETE RESTRICT` rather than `CASCADE`,
unlike the two target keys: the evaluation is the record of *why a person was
refused* and must not vanish to an unrelated cleanup, whereas an evaluation
against a deleted Request has nothing left to explain.

## Migration Rules

Migration `20260728120000_project_publication_owner_flow` expands legacy
Projects for explicit publication without provider/network access. It backfills
unique platform slugs, adds optimistic revisions, manual-override/source status
and archive fields, removes global repository-URL uniqueness so intentional
private drafts can coexist, and adds a partial unique index allowing at most one
published Project for each numeric GitHub repository ID. `ProjectOperation`
stores hashed idempotency scopes and safe response snapshots;
`ProjectStateTransition` preserves actor, before/after state, validation outcome,
and time. Existing rows are preserved and published timestamps are not reset.

## GitHub repository-evidence cutover

The GitHub App tables are introduced additively before any legacy credential is
removed. `GitHubEvidenceCutover` is the only authoritative cutover clock. The
audited operation first persists that clock, attempts provider revocation for
each broad repository OAuth credential, records aggregate success/failure,
purges the local credential regardless of provider outcome, and reports the
count requiring manual provider revocation. It does not delete identity-owned
social-login links, approved skills, or admin decisions.

The same record sets `legacy_evidence_cleanup_due_at` to exactly 30 days after
cutover. At or after that time, module-owned idempotent operations remove
GitHub-owned raw profile JSON and skill-profiles-owned private/unknown evidence
using fail-closed allowlists. Approved skill rows and review decisions remain;
unresolved legacy generations transition to `needs_more_evidence`. Rollback may
restore application code before cutover, but cannot restore purged provider
credentials or private evidence afterward.

Pre-release verification must apply both forward migrations to representative
identity-only, broad-OAuth, pending-generation, approved-skill, and no-GitHub
fixtures; inspect dry-run counts; execute cutover once; rerun it to prove
idempotency; and exercise cleanup immediately before, at, and after its due time.

- Every schema change requires a Prisma migration.
- Do not edit production data manually as a normal workflow.
- Add indexes for common filters and foreign keys.
- Use pagination on large tables.
- Avoid caching until query measurements justify it.
