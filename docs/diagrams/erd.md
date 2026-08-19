# Entity Relationship Diagram

Derived from `prisma/schema.prisma` (81 models, 67 applied migrations under
`prisma/migrations/`). PostgreSQL 16 with the `pgvector` extension.

The schema is too large for one readable diagram, so it is drawn as a context
map plus one ER diagram per bounded context. Every relationship below is a real
Prisma `@relation` unless it appears in the **Logical references** section at the
end, which lists columns that carry an entity ID without a database foreign key.

Conventions used in every diagram:

- `PK` primary key, `FK` foreign key, `UK` unique constraint.
- All primary keys are `uuid` unless stated otherwise.
- `||--o{` one-to-many, `||--||` one-to-one, `}o--||` optional many-to-one.

---

## 1. Context Map

```mermaid
flowchart TB
  subgraph IDENT["Identity & Access"]
    U[User]
    CP[ContributorProfile]
    SESS[AuthSession]
  end

  subgraph GH["GitHub Integration"]
    GHA[GitHubAccount]
    GHI[GitHubAppInstallation]
    GHL[GitHubAppInstallationLink]
  end

  subgraph BILL["Billing & Entitlements"]
    SUB[Subscription]
    PA[PaymentAttempt]
    UT[UsageTracker]
  end

  subgraph WORK["Work Definition"]
    PRJ[Project]
    CR[ContributionRequest]
    PROP[ContributionProposal]
  end

  subgraph APPLY["Application & Assessment"]
    APP[Application]
    EE[EligibilityEvaluation]
    AR[AssessmentRequest]
    AFA[AdvisoryFitAssessment]
  end

  subgraph EXEC["Assignment & Delivery"]
    OD[OwnerDecision]
    ASG[Assignment]
    CONV[AssignmentConversation]
    DEL[Delivery]
  end

  subgraph SKILL["Skills & AI Output"]
    SPG[SkillProfileGeneration]
    SP[SkillProfile]
    AMR[AiMatchResult]
    ATL[AiTraceLog]
  end

  subgraph MAT["Materials & Analysis"]
    M[Material]
    MAS[MaterialAnalysisSet]
    MAR[MaterialAnalysisRun]
  end

  subgraph NOTIF["Notifications"]
    N[Notification]
    NE[NotificationEvent]
  end

  subgraph TRUST["Trust & Reputation"]
    REP[ReputationRecord]
    BADGE[UserBadge]
    RPT[Report]
    DISP[Dispute]
  end

  U --> CP
  U --> SESS
  U --> GHA
  U --> SUB
  U --> PRJ
  GHL --> SPG
  SPG --> SP
  SP --> APPLY
  PRJ --> CR
  PROP --> CR
  CR --> APP
  CR --> EE
  APP --> AR
  AR --> AFA
  APP --> OD
  OD --> ASG
  ASG --> CONV
  ASG --> DEL
  DEL --> REP
  DEL --> BADGE
  PRJ --> M
  M --> MAS
  MAS --> MAR
  MAR --> CR
  CR --> AMR
  APPLY --> N
  EXEC --> N
  N --> NE
  SUB --> UT
  PA --> SUB
```

---

## 2. Identity & Access

`User` is the single account row for all three roles (`owner`, `contributor`,
`admin`). Credentials, social provider links, OTPs, and sessions are separate
tables so that no auth mechanism owns the account record.

```mermaid
erDiagram
  User ||--o| ContributorProfile : "has"
  User ||--o{ AuthSession : "opens"
  User ||--o{ AuthProviderAccount : "links"
  User ||--o{ AuthOAuthState : "initiates"
  User ||--o{ EmailVerificationOtp : "receives"
  User ||--o{ PasswordResetOtp : "receives"
  ContributorProfile }o--o| ContributorExperienceLevel : "declares"
  ContributorProfile ||--o{ ContributorProfileField : "selects"
  ContributorField ||--o{ ContributorProfileField : "selected_by"
  ContributorFieldCategory ||--o{ ContributorField : "groups"

  User {
    uuid id PK
    varchar email UK
    varchar username UK
    varchar password_hash "null for social-only accounts"
    varchar first_name
    varchar last_name
    enum role "owner|contributor|admin"
    enum status "pending|active|suspended|deactivated"
    enum preferred_language "ar|en"
    varchar phone_number
    timestamp phone_verified_at
    varchar country
    varchar region
    varchar city
    date date_of_birth
    varchar profile_visibility
    boolean show_email
    boolean show_phone
    boolean show_activity
    boolean allow_indexing
    varchar identity_verification_status
    bytes identity_document_data
    timestamp last_login_at
    timestamp created_at
    timestamp updated_at
  }

  AuthSession {
    uuid id PK
    uuid user_id FK
    varchar access_token_hash UK
    varchar refresh_token_hash UK
    varchar user_agent
    varchar ip_address
    timestamp expires_at
    timestamp refresh_expires_at
    timestamp revoked_at
  }

  AuthProviderAccount {
    uuid id PK
    uuid user_id FK
    enum provider "github|google"
    varchar provider_account_id UK
    varchar email
    boolean email_verified
    json raw_profile_data
    timestamp last_login_at
  }

  AuthOAuthState {
    uuid id PK
    uuid user_id FK "null before account exists"
    enum provider
    varchar state_hash UK
    enum requested_role
    enum requested_intent "login|register"
    timestamp expires_at
    timestamp consumed_at
  }

  EmailVerificationOtp {
    uuid id PK
    uuid user_id FK
    varchar code_hash
    timestamp expires_at
    timestamp consumed_at
    int attempts
  }

  PasswordResetOtp {
    uuid id PK
    uuid user_id FK
    varchar code_hash
    timestamp expires_at
    timestamp consumed_at
    int attempts
  }

  ContributorProfile {
    uuid id PK
    uuid user_id FK,UK
    text bio
    varchar availability
    uuid experience_level_id FK
    string_array declared_skills
    bytes avatar_data
  }

  ContributorFieldCategory {
    uuid id PK
    varchar key UK
    varchar label_en
    varchar label_ar
    boolean active
    int sort_order
  }

  ContributorField {
    uuid id PK
    uuid category_id FK
    varchar key UK
    varchar label_en
    varchar label_ar
    boolean active
    int sort_order
  }

  ContributorExperienceLevel {
    uuid id PK
    varchar key UK
    varchar label_en
    varchar label_ar
    boolean active
    int sort_order
  }

  ContributorProfileField {
    uuid profile_id PK "FK"
    uuid field_id PK "FK"
    timestamp created_at
  }
```

---

## 3. GitHub Integration

Two generations of GitHub access coexist. `GitHubAccount` is the legacy OAuth
credential; the GitHub App tables (`GitHubAppInstallation` and friends) are the
current evidence-authorization path, and `GitHubEvidenceCutover` records the
one-time migration between them.

```mermaid
erDiagram
  User ||--o| GitHubAccount : "connects_legacy"
  User ||--o{ GitHubOAuthState : "initiates"
  User ||--o{ GitHubAppInstallationLink : "authorizes"
  User ||--o{ GitHubAppLinkState : "starts_flow"
  GitHubAppInstallation ||--o{ GitHubAppInstallationLink : "linked_by"
  GitHubAppInstallation ||--o{ GitHubAppRepository : "grants"
  GitHubAppInstallation ||--o{ GitHubAppLinkState : "targeted_by"
  GitHubAppInstallationLink ||--o{ SkillProfileGeneration : "authorizes"

  GitHubAccount {
    uuid id PK
    uuid user_id FK,UK
    varchar github_id UK
    varchar username
    text access_token "legacy, nullable after cutover"
    text refresh_token
    enum ingestion_status "pending|in_progress|completed|failed"
    timestamp token_expires_at
    timestamp last_synced_at
  }

  GitHubOAuthState {
    uuid id PK
    uuid user_id FK
    varchar state_hash UK
    timestamp expires_at
    timestamp consumed_at
  }

  GitHubAppInstallation {
    uuid id PK
    varchar installation_id UK "GitHub numeric id"
    varchar account_id
    varchar account_login
    enum account_type "user|organization"
    enum repository_selection "selected|all"
    json permissions
    enum status "active|suspended|deleted|verification_failed"
    timestamp installed_at
    timestamp last_verified_at
    timestamp suspended_at
    timestamp deleted_at
  }

  GitHubAppInstallationLink {
    uuid id PK
    uuid installation_id FK
    uuid user_id FK
    varchar github_user_id
    varchar github_login
    text encrypted_user_token
    text encrypted_refresh_token
    enum status "active|disconnected|reauthorization_required|revoked"
    timestamp linked_at
    timestamp revoked_at
  }

  GitHubAppRepository {
    uuid id PK
    uuid installation_id FK
    varchar github_repository_id
    varchar full_name
    varchar visibility
    varchar default_branch
    timestamp last_verified_at
    timestamp removed_at
  }

  GitHubAppLinkState {
    uuid id PK
    uuid user_id FK
    enum flow_type "install_and_authorize|authorize_existing_installation"
    uuid target_installation_id FK
    varchar state_hash UK
    enum status "issued|callback_processed|completed|expired|rejected"
    timestamp expires_at
    json accessible_installation_candidates
    text encrypted_pending_user_token
    varchar failure_code
  }

  GitHubWebhookDelivery {
    uuid id PK
    varchar delivery_id UK
    varchar event
    varchar action
    varchar provider_installation_id
    enum status "received|processed|failed|ignored"
    int retry_count
    varchar safe_error_code
  }

  GitHubEvidenceCutover {
    uuid id PK
    timestamp cutover_at
    varchar executed_by
    timestamp legacy_credentials_purged_at
    int provider_revocation_succeeded_count
    int provider_revocation_failed_count
    timestamp legacy_evidence_cleaned_at
  }
```

---

## 4. Billing, Payments & Entitlements

`Subscription.source` exists so that a real checkout can never be confused with
a seeded or admin-granted plan (ADR/DEC-026). `PaymentAttempt` is the
idempotency anchor; `PaymentWebhookEvent` is the append-only provider callback
log.

```mermaid
erDiagram
  User ||--o{ Subscription : "holds"
  User ||--o{ PaymentAttempt : "starts"
  User ||--o{ UsageTracker : "consumes"
  PaymentAttempt ||--o{ PaymentWebhookEvent : "confirmed_by"

  Subscription {
    uuid id PK
    uuid user_id FK
    enum plan_type "free|gold"
    enum user_role_context "owner|contributor"
    enum status "active|cancelled|expired"
    enum source "default|admin|demo|payment_provider"
    timestamp starts_at
    timestamp expires_at
    timestamp current_period_start
    timestamp current_period_end
    varchar provider_subscription_id
    timestamp cancelled_at
  }

  PaymentAttempt {
    uuid id PK
    uuid user_id FK
    enum purpose "subscription_purchase"
    enum user_role_context
    enum plan_type
    int amount_cents
    varchar currency
    varchar idempotency_key UK "unique per user"
    enum provider "paymob"
    varchar provider_intention_id
    varchar provider_checkout_url
    varchar provider_order_id
    varchar provider_transaction_id
    enum status "pending|paid|failed|cancelled|refunded"
    timestamp expires_at
    timestamp paid_at
  }

  PaymentWebhookEvent {
    uuid id PK
    enum provider
    varchar provider_event_id
    varchar fingerprint UK
    uuid payment_attempt_id FK
    json minimized_payload "PII stripped"
    enum verification_status "unverified|verified|invalid"
    enum processing_status "pending|processed|failed|ignored"
    timestamp verified_at
    timestamp processed_at
  }

  UsageTracker {
    uuid id PK
    uuid user_id FK
    enum action_type "order_created|application_submitted"
    date period_date
    int count
  }
```

---

## 5. Projects, Contribution Requests & Proposals

A `Project` wraps an imported GitHub repository. Work is published as
`ContributionRequest`. A contributor can also push work upward through
`ContributionProposal`; an accepted proposal originates a Request that stays
attributed to its proposer (ADR 0003).

```mermaid
erDiagram
  User ||--o{ Project : "owns"
  User ||--o{ SavedProject : "bookmarks"
  Project ||--o{ SavedProject : "bookmarked_as"
  Project ||--o{ ProjectOperation : "idempotency_log"
  Project ||--o{ ProjectStateTransition : "audit"
  Project ||--o| ProjectProposalIntake : "intake_switch"
  Project ||--o{ ContributionRequest : "publishes"
  Project ||--o{ ContributionProposal : "receives"
  ContributionProposal ||--o{ ContributionProposalVersion : "revised_as"
  ContributionProposal ||--o{ ContributionProposalAudit : "audit"
  ContributionProposal ||--o{ ContributionProposalMisuseReport : "reported_as"
  ContributionProposal ||--o| ContributionRequest : "originates"
  ContributionRequest ||--o{ ContributionRequestRequirement : "states"
  ContributionRequest ||--o{ ContributionRequestSkillRequirement : "requires_level"
  ContributionRequest ||--o{ ContributionRequestAudit : "audit"

  Project {
    uuid id PK
    uuid owner_id FK
    varchar title
    varchar slug UK
    varchar slug_normalized
    text description
    varchar github_repo_url
    varchar github_repo_id
    json languages
    json tags
    json technologies
    json repo_statistics
    enum category "web|mobile|ai_ml|devops|tools_utilities"
    enum difficulty "beginner|intermediate|advanced"
    bytes hero_image_data
    enum status "draft|published|archived"
    text readme_content
    int revision "optimistic concurrency"
    json manual_overrides
    timestamp source_fetched_at
    timestamp published_at
    timestamp archived_at
  }

  SavedProject {
    uuid user_id PK "FK"
    uuid project_id PK "FK"
    timestamp created_at
  }

  ProjectOperation {
    uuid id PK
    uuid project_id FK
    uuid actor_id
    varchar operation
    varchar key_hash UK
    varchar request_hash
    json response
  }

  ProjectStateTransition {
    uuid id PK
    uuid project_id FK
    uuid actor_id
    enum from_status
    enum to_status
    json validation_outcome
  }

  ProjectProposalIntake {
    uuid project_id PK "FK"
    boolean enabled
    uuid updated_by
    timestamp updated_at
  }

  ContributionRequest {
    uuid id PK
    uuid project_id FK
    uuid owner_id FK
    varchar title
    text description
    json technology_tags
    enum difficulty
    timestamp applications_close_at
    timestamp target_completion_date
    decimal reward
    varchar reward_currency
    enum status "draft|published|assigned|completed|cancelled|discarded"
    int max_applicants
    uuid origin_proposal_id FK
    uuid attributed_contributor_id FK
    enum skill_inference_status "not_started|pending|succeeded|failed"
    timestamp skill_inference_ran_at
    timestamp published_at
  }

  ContributionRequestRequirement {
    uuid id PK
    uuid contribution_request_id FK
    enum kind "required|preferred"
    int position
    text text
  }

  ContributionRequestSkillRequirement {
    uuid id PK
    uuid contribution_request_id FK
    varchar skill_name
    varchar skill_name_normalized
    enum required_level "beginner|intermediate|advanced"
    enum kind "required|preferred"
    enum source "ai_inferred|owner_override"
    enum confidence "high|medium|low"
    int position
  }

  ContributionRequestAudit {
    uuid id PK
    uuid contribution_request_id FK
    uuid actor_id FK
    enum action
    enum from_status
    enum to_status
    varchar idempotency_key
    varchar command_fingerprint
    json metadata
  }

  ContributionProposal {
    uuid id PK
    uuid project_id FK
    uuid proposer_id FK
    enum status "pending|withdrawn|accepted|declined"
    int current_version
    varchar disclosure_version
    timestamp disclosure_acknowledged_at
    int revision_request_sequence
    timestamp accepted_at
    timestamp declined_at
  }

  ContributionProposalVersion {
    uuid id PK
    uuid proposal_id FK
    int version
    varchar title
    text problem_or_opportunity
    text proposed_outcome
    text project_benefit
    uuid authored_by FK
  }

  ContributionProposalAudit {
    uuid id PK
    uuid proposal_id FK
    uuid actor_id FK
    enum action
    enum from_status
    enum to_status
    int proposal_version
  }

  ContributionProposalMisuseReport {
    uuid id PK
    uuid proposal_id FK
    uuid reporter_id FK
    int reported_version
    text reason
    json evidence_snapshot
  }
```

---

## 6. Eligibility, Applications & Advisory Fit Assessment

This is the most safety-critical part of the schema. Three separate ideas are
deliberately kept apart:

- **`EligibilityEvaluation`** — the deterministic gate. It has exactly two
  outcomes; a provider outage is a retriable error, never a recorded outcome
  (ADR 0015).
- **`ApplicationRequirementSnapshot` / `ApplicationEvidenceSnapshot`** — what
  was true at submission time, frozen so later edits cannot rewrite history.
- **`AdvisoryFitAssessment`** — AI output that informs an owner and can never
  write Application state (ADR 0001).

```mermaid
erDiagram
  ContributionRequest ||--o{ Application : "receives"
  User ||--o{ Application : "submits"
  Application ||--o| ApplicationRequirementSnapshot : "freezes"
  Application ||--o| ApplicationEvidenceSnapshot : "freezes"
  Application ||--o{ ApplicationAudit : "audit"
  Application ||--o| AiValidationResult : "legacy_validation"
  Application ||--o| SkillGapGuidance : "guidance"
  Application ||--o{ AssessmentRequest : "assessed_by"
  User ||--o{ EligibilityEvaluation : "evaluated_for"
  ContributionRequest ||--o{ EligibilityEvaluation : "gates"
  ContributionProposal ||--o{ EligibilityEvaluation : "gates"
  EligibilityEvaluation ||--o{ EligibilityGuidance : "explains"
  AssessmentRequest ||--o{ AssessmentAttempt : "attempts"
  AssessmentAttempt ||--o| AdvisoryFitAssessment : "produces"
  AssessmentAttempt ||--o{ AssessmentAttempt : "retry_of"
  AdvisoryFitAssessment ||--o{ AssessmentFinding : "cites"
  AdvisoryFitAssessment ||--o| AssessmentPresentation : "shown_as"
  AssessmentRequest ||--o{ AssessmentRequestAudit : "audit"
  ApplicationRequirementSnapshot ||--o{ AssessmentRequest : "fixed_input"
  ApplicationEvidenceSnapshot ||--o{ AssessmentRequest : "fixed_input"

  EligibilityEvaluation {
    uuid id PK
    uuid contributor_id FK
    uuid contribution_request_id FK "exclusive with proposal"
    uuid contribution_proposal_id FK
    enum outcome "eligible|blocked"
    json blocking_skills
    int requirement_snapshot_version
    timestamp evaluated_at
  }

  EligibilityGuidance {
    uuid id PK
    uuid eligibility_evaluation_id FK
    uuid contributor_id FK
    enum status "pending|ready|failed"
    json blocking_skills
    text narrative
    json recommendations
    varchar model_used
  }

  Application {
    uuid id PK
    uuid contribution_request_id FK
    uuid contributor_id FK
    text cover_message
    text contribution_approach
    int proposed_delivery_duration_days
    uuid requirement_snapshot_id FK
    uuid evidence_snapshot_id FK
    enum status "pending_owner_review|accepted|declined_by_owner|not_selected|expired|withdrawn|request_cancelled"
    boolean is_priority "reserved, not written in Phase 1"
    timestamp submitted_at
    timestamp owner_reviewed_at
    timestamp review_due_at
    timestamp review_reminder_sent_at
    timestamp expires_at
  }

  ApplicationRequirementSnapshot {
    uuid id PK
    uuid contribution_request_id
    timestamp source_request_updated_at
    json requirements
    json skill_requirements
  }

  ApplicationEvidenceSnapshot {
    uuid id PK
    uuid contributor_id FK
    json contributor_context
    json evidence "approved skill summaries only"
  }

  ApplicationAudit {
    uuid id PK
    uuid application_id FK
    uuid actor_id FK
    enum action
    enum from_status
    enum to_status
    varchar idempotency_key
    varchar command_fingerprint
  }

  AssessmentRequest {
    uuid id PK
    uuid application_id FK
    uuid contribution_request_id FK
    uuid owner_id FK
    uuid requirement_snapshot_id FK
    uuid evidence_snapshot_id FK
    enum status "requested|completed|not_started_system_limit|not_started_no_assessable_evidence|cancelled_not_needed|unavailable"
    varchar idempotency_key UK
    varchar command_fingerprint
    timestamp requested_at
    timestamp completed_at
  }

  AssessmentAttempt {
    uuid id PK
    uuid assessment_request_id FK
    uuid retry_of_attempt_id FK
    int attempt_number
    enum status "completed|failed"
    varchar provider
    varchar model
    varchar prompt_version
    varchar schema_version
    int latency_ms
    int input_tokens
    int output_tokens
    varchar error_code
  }

  AdvisoryFitAssessment {
    uuid id PK
    uuid assessment_attempt_id FK,UK
    enum fit_band "strong|partial|limited|unknown|unavailable"
  }

  AssessmentFinding {
    uuid id PK
    uuid advisory_fit_assessment_id FK
    uuid requirement_id
    enum requirement_kind "required|preferred"
    enum finding "supported|partially_supported|not_evidenced|inconclusive"
    enum confidence "high|medium|low"
    json citations
    json uncertainty
    text explanation
  }

  AssessmentPresentation {
    uuid id PK
    uuid advisory_fit_assessment_id FK
    uuid owner_id FK
    timestamp presented_at
  }

  AssessmentRequestAudit {
    uuid id PK
    uuid assessment_request_id FK
    uuid actor_id FK
    enum action
    enum from_status
    enum to_status
    int attempt_number
  }

  AiValidationResult {
    uuid id PK
    uuid application_id FK,UK
    enum decision "eligible|ineligible|review_needed"
    float confidence_score
    text justification
    json matched_skills
    json missing_skills
  }

  SkillGapGuidance {
    uuid id PK
    uuid application_id FK,UK
    uuid contributor_id FK
    uuid contribution_request_id FK
    json missing_skills
    json recommended_technologies
    json learning_resources
    json practice_projects
    text guidance_narrative
  }
```

---

## 7. Owner Decision, Assignment, Conversation & Delivery

`OwnerDecision` is the human decision record; `Assignment` is created in the
same transaction as an `accepted` decision. Conversations are per-Assignment and
expire into `read_only` after twelve months (ADR 0008). `MessageEvent` and
`DeliveryApprovedEvent` are transactional outboxes: the row is committed first,
realtime delivery second (ADR 0007).

```mermaid
erDiagram
  Application ||--o| OwnerDecision : "decided_by"
  ContributionRequest ||--o{ OwnerDecision : "decisions"
  User ||--o{ OwnerDecision : "decides"
  OwnerDecision ||--o| Assignment : "creates"
  Application ||--o| Assignment : "assigned_as"
  ContributionRequest ||--o{ Assignment : "assigns"
  Assignment ||--o| AssignmentConversation : "opens"
  AssignmentConversation ||--o{ Message : "contains"
  AssignmentConversation ||--o{ MessageEvent : "outbox"
  Message ||--o{ MessageEvent : "emits"
  Message ||--o{ Message : "reply_to"
  Application ||--o| Delivery : "delivered_as"
  ContributionRequest ||--o{ Delivery : "deliveries"
  Delivery ||--o{ DeliverySubmission : "submission_history"
  Delivery ||--o{ DeliveryReview : "reviewed_by"
  DeliveryReview ||--o| DeliveryApprovedEvent : "outbox"
  Delivery ||--o{ UserBadge : "awards"
  OwnerDecision ||--o{ Report : "reported_as"

  OwnerDecision {
    uuid id PK
    uuid application_id FK,UK
    uuid contribution_request_id FK
    uuid owner_id FK
    enum decision_type "accepted|declined"
    text feedback
    varchar idempotency_key UK
    varchar command_fingerprint
    timestamp decided_at
  }

  Assignment {
    uuid id PK
    uuid contribution_request_id FK
    uuid application_id FK,UK
    uuid owner_decision_id FK,UK
    uuid contributor_id FK
    int agreed_delivery_duration_days
    timestamp agreed_delivery_due_at
    timestamp assigned_at
  }

  AssignmentConversation {
    uuid id PK
    uuid assignment_id FK,UK
    enum status "active|read_only"
    int aggregate_version
  }

  Message {
    uuid id PK
    uuid conversation_id FK
    int sequence "unique per conversation"
    uuid sender_id FK
    text body
    uuid reply_to_message_id FK
    varchar idempotency_key
    timestamp edited_at
    timestamp retracted_at
  }

  MessageEvent {
    uuid id PK
    uuid message_id FK
    uuid conversation_id FK
    enum event_type "created"
    int aggregate_version
    timestamp occurred_at
    timestamp published_at
    int publish_attempts
    varchar last_publish_error_code
  }

  Delivery {
    uuid id PK
    uuid application_id FK,UK
    uuid contribution_request_id FK
    uuid contributor_id FK
    varchar pr_url
    text contributor_notes
    enum status "submitted|changes_requested|resubmitted|approved|rejected"
    int submission_number
    varchar submission_idempotency_key
    timestamp submitted_at
    timestamp reviewed_at
  }

  DeliverySubmission {
    uuid id PK
    uuid delivery_id FK
    int submission_number
    uuid contributor_id FK
    varchar pr_url
    text contributor_notes
    varchar idempotency_key
    timestamp submitted_at
  }

  DeliveryReview {
    uuid id PK
    uuid delivery_id FK
    uuid reviewer_id FK
    int submission_number
    int rating
    text feedback
    enum outcome "approved|rejected|changes_requested"
    varchar idempotency_key
  }

  DeliveryApprovedEvent {
    uuid id PK
    uuid delivery_id FK
    uuid delivery_review_id FK,UK
    uuid contributor_id FK
    uuid contribution_request_id
    int rating
    timestamp occurred_at
    timestamp published_at
  }
```

---

## 8. Skill Profiles, AI Results & Trust

```mermaid
erDiagram
  User ||--o{ SkillProfileGeneration : "requests"
  SkillProfileGeneration ||--o{ SkillProfile : "produces"
  SkillProfileGeneration ||--o{ SkillProfileGeneration : "retry_of"
  User ||--o{ SkillProfile : "owns"
  SkillProfile ||--o{ SkillProfileReviewDecision : "reviewed_by"
  SkillProfile ||--o{ Dispute : "disputed_as"
  AiValidationResult ||--o| Dispute : "disputed_as"
  ContributionRequest ||--o{ AiMatchResult : "ranks"
  User ||--o{ AiMatchResult : "matched_as"
  User ||--o| ReputationRecord : "scores"
  User ||--o{ UserBadge : "earns"
  User ||--o{ Report : "files"

  SkillProfileGeneration {
    uuid id PK
    uuid user_id FK
    enum status "queued|collecting_evidence|analyzing|pending_review|needs_more_evidence|failed"
    json selected_repositories "1..10 immutable repo ids"
    json evidence_snapshot
    json fraud_signals
    varchar evidence_quality
    varchar failure_reason
    varchar provider
    varchar model
    varchar prompt_version
    varchar schema_version
    uuid github_app_installation_link_id FK
    varchar consent_version
    timestamp consented_at
    timestamp authorization_verified_at
    uuid retry_of_generation_id FK
  }

  SkillProfile {
    uuid id PK
    uuid user_id FK
    uuid generation_id FK
    varchar skill_name
    varchar skill_key
    enum proficiency_level "beginner|intermediate|advanced"
    float confidence_score
    text evidence_summary
    json evidence_sources
    enum status "pending|approved|rejected|disputed|superseded"
    uuid reviewed_by FK
    enum original_proficiency
    timestamp reviewed_at
    timestamp superseded_at
  }

  SkillProfileReviewDecision {
    uuid id PK
    uuid skill_profile_id FK
    uuid reviewer_id FK
    enum action "approve|reject|adjust_proficiency"
    enum previous_status
    enum new_status
    enum previous_proficiency
    enum new_proficiency
    text notes
  }

  AiMatchResult {
    uuid id PK
    uuid contribution_request_id FK
    uuid contributor_id FK
    float match_score
    text justification
    json matched_skills
    json reputation_signals
    int rank
    varchar model_used
  }

  AiTraceLog {
    uuid id PK
    enum agent_type "skill_profiling|skill_validation|skill_gap_guidance|contributor_matching"
    uuid trigger_entity_id
    enum trigger_entity_type "user|application|contribution_request"
    json input_payload
    json output_payload
    float confidence_score
    varchar model_used
    int prompt_tokens
    int completion_tokens
    int latency_ms
    enum status "success|partial|failure"
    json retrieved_sources
  }

  ReputationRecord {
    uuid id PK
    uuid user_id FK,UK
    float overall_rating
    int total_contributions
    int successful_contributions
    float success_rate
    json top_verified_skills
    int total_ratings_received
  }

  UserBadge {
    uuid id PK
    uuid user_id FK
    enum badge_type
    uuid source_delivery_id FK
    timestamp awarded_at
  }

  Dispute {
    uuid id PK
    uuid user_id FK
    uuid skill_profile_id FK
    uuid ai_validation_result_id FK
    enum type "skill_assessment|validation_decision"
    text reason
    enum status "open|under_review|upheld|overturned|dismissed"
    uuid resolved_by FK
  }

  Report {
    uuid id PK
    uuid reporter_id FK
    uuid reported_user_id FK
    uuid reported_content_id "polymorphic, no FK"
    enum reported_content_type
    uuid owner_decision_id FK
    enum reason "fraud|misuse|reputation_manipulation|inaccurate_ai|harassment|other"
    text description
    enum status "open|investigating|resolved|dismissed"
    uuid resolved_by FK
  }
```

---

## 9. Materials & Material Analysis

Material sharing authorization (`MaterialGrant`) is deliberately separate from
AI authorization (`MaterialAnalysisSet`) — ADR 0004. Analysis produces
owner-reviewed **draft suggestions**, never direct writes to a Project or
Request — ADR 0005. `MaterialAnalysisChunk.embedding` is a pgvector column.

```mermaid
erDiagram
  Project ||--o{ Material : "holds"
  ContributionRequest ||--o{ Material : "holds"
  User ||--o{ Material : "owns"
  Material ||--o{ MaterialVersion : "versions"
  Material ||--o{ MaterialGrant : "shared_via"
  Material ||--o{ MaterialAudit : "audit"
  Project ||--o{ MaterialAnalysisSet : "analyzed_in"
  MaterialAnalysisSet ||--o{ MaterialAnalysisSetVersion : "pins"
  Material ||--o{ MaterialAnalysisSetVersion : "pinned_as"
  MaterialAnalysisSet ||--o{ MaterialAnalysisRun : "runs"
  MaterialAnalysisRun ||--o{ MaterialDraftSuggestion : "suggests"
  MaterialAnalysisRun ||--o{ MaterialAnalysisChunk : "embeds"
  MaterialAnalysisSet ||--o{ MaterialAnalysisChunk : "scopes"

  Material {
    uuid id PK
    uuid project_id FK
    uuid contribution_request_id FK
    uuid owner_id FK
    varchar title
    enum visibility
    int current_version
    timestamp deleted_at
  }

  MaterialVersion {
    uuid id PK
    uuid material_id FK
    int version
    varchar storage_key
    varchar content_hash
    int byte_size
    varchar mime_type
    varchar original_filename
    enum scan_status
    varchar scan_error_code
    uuid uploaded_by FK
    timestamp purged_at
  }

  MaterialGrant {
    uuid id PK
    uuid material_id FK
    uuid grantee_id FK
    uuid granted_by FK
    timestamp granted_at
    timestamp revoked_at
  }

  MaterialAudit {
    uuid id PK
    uuid material_id FK
    uuid actor_id FK
    enum action
    json metadata
  }

  MaterialAnalysisSet {
    uuid id PK
    uuid project_id FK
    uuid owner_id FK
    enum purpose
    enum status
  }

  MaterialAnalysisSetVersion {
    uuid id PK
    uuid analysis_set_id FK
    uuid material_id FK
    int material_version "pinned"
    varchar original_filename
    varchar mime_type
    varchar content_hash
  }

  MaterialAnalysisRun {
    uuid id PK
    uuid analysis_set_id FK
    varchar contract_version
    enum status
    varchar provider
    varchar model
    varchar prompt_version
    varchar schema_version
    int document_count
    int extracted_characters
    varchar error_code
  }

  MaterialDraftSuggestion {
    uuid id PK
    uuid run_id FK
    enum suggestion_type
    varchar target_field
    json payload
    text rationale
    json source_versions
    enum status
    uuid reviewed_by FK
    varchar adopted_entity_type
    uuid adopted_entity_id
    timestamp source_removed_at
  }

  MaterialAnalysisChunk {
    uuid id PK
    uuid run_id FK
    uuid analysis_set_id FK
    uuid material_id
    int material_version
    int chunk_index
    text text
    int character_start
    int character_end
    vector embedding "pgvector"
  }
```

---

## 10. Notifications

Notifications are stored semantically (`template_key` + `parameters`) and
rendered into the reader's language at read time (ADR 0012). The durable row is
written before any realtime attempt (ADR 0007); `NotificationEvent` is the
outbox that a bounded BullMQ recovery worker republishes.

```mermaid
erDiagram
  User ||--o{ Notification : "receives"
  Notification ||--o{ NotificationEvent : "outbox"
  User ||--o{ NotificationEvent : "addressed_to"
  User ||--o| NotificationPreference : "configures"
  NotificationPreference ||--o{ NotificationCategoryPreference : "overrides"

  Notification {
    uuid id PK
    uuid user_id FK
    enum type "16 semantic categories"
    varchar template_key
    int template_version
    json parameters
    varchar deep_link
    enum priority "urgent|attention|ambient"
    varchar title "legacy rendered copy"
    text message "legacy rendered copy"
    varchar deduplication_key
    boolean is_read
    timestamp read_at
    int aggregate_version
  }

  NotificationEvent {
    uuid id PK
    uuid notification_id FK
    uuid user_id FK
    enum event_type "created|read_state_changed"
    int aggregate_version
    timestamp occurred_at
    timestamp published_at
    int publish_attempts
    varchar last_publish_error_code
  }

  NotificationPreference {
    uuid user_id PK "FK"
    int retention_days
    boolean quiet_hours_enabled
    time quiet_start_local
    time quiet_end_local
    varchar quiet_timezone
    int revision "optimistic concurrency"
  }

  NotificationCategoryPreference {
    uuid user_id PK "FK"
    enum type PK
    boolean in_app_enabled
    boolean browser_enabled
  }
```

---

## Logical references (no database foreign key)

These columns carry an entity ID but are intentionally not constrained, either
because the target is polymorphic or because the row must survive the target's
deletion as an audit fact.

| Table | Column | Points at | Why unconstrained |
| --- | --- | --- | --- |
| `ProjectOperation` | `actor_id` | `User.id` | Idempotency log must outlive the actor row |
| `ProjectStateTransition` | `actor_id` | `User.id` | Append-only audit fact |
| `ProjectProposalIntake` | `updated_by` | `User.id` | Setting survives admin removal |
| `ApplicationRequirementSnapshot` | `contribution_request_id` | `ContributionRequest.id` | Snapshot is frozen evidence, not a live link |
| `Report` | `reported_content_id` | any of 7 types | Polymorphic, discriminated by `reported_content_type` |
| `MaterialDraftSuggestion` | `adopted_entity_id` | `Project.id` / `ContributionRequest.id` | Polymorphic adoption target |
| `MaterialAnalysisChunk` | `material_id` | `Material.id` | Pinned to a version, not the live Material |
| `DeliveryApprovedEvent` | `contribution_request_id` | `ContributionRequest.id` | Outbox payload is a frozen fact |
| `GitHubEvidenceCutover` | `executed_by` | `User.id` | One-time operational record |
| `AiTraceLog` | `trigger_entity_id` | `User` / `Application` / `ContributionRequest` | Polymorphic, discriminated by `trigger_entity_type` |

## Cross-cutting schema patterns

| Pattern | Where it appears | Purpose |
| --- | --- | --- |
| Append-only audit table | `ContributionRequestAudit`, `ApplicationAudit`, `AssessmentRequestAudit`, `ContributionProposalAudit`, `MaterialAudit`, `ProjectStateTransition` | State history without event sourcing (ADR 0002) |
| Transactional outbox | `NotificationEvent`, `MessageEvent`, `DeliveryApprovedEvent` | Commit durably, publish to realtime second (ADR 0007) |
| Idempotency key + command fingerprint | `Application*`, `OwnerDecision`, `AssessmentRequest`, `Delivery*`, `PaymentAttempt`, `ProjectOperation`, `Message` | Safe client retries; a replayed key with different content is rejected |
| Frozen snapshot | `ApplicationRequirementSnapshot`, `ApplicationEvidenceSnapshot`, `MaterialAnalysisSetVersion` | Later edits cannot rewrite what a decision was based on |
| Provider run metadata | `AssessmentAttempt`, `SkillProfileGeneration`, `MaterialAnalysisRun` | `provider`/`model`/`prompt_version`/`schema_version` recorded per run |
| Optimistic concurrency | `Project.revision`, `NotificationPreference.revision`, `*.aggregate_version` | Lost-update protection on concurrent edits |
| Soft delete | `Material.deleted_at`, `GitHubAppRepository.removed_at`, `MaterialVersion.purged_at` | Retention and audit obligations |
