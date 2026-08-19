# Sequence Diagrams

Eleven end-to-end flows through the Share-k backend, drawn from the actual
controller/service/worker code in `src/`. Each one names the real classes and
the real HTTP paths, so a diagram can be checked against the code rather than
believed.

Two conventions recur in almost every diagram and are worth reading once:

- **Enqueue after commit.** Background jobs are dispatched strictly after the
  database transaction commits. A job that starts before its row is visible is
  a race the code deliberately avoids.
- **Durable before realtime.** Notification, message, and delivery events are
  committed as rows first, published to sockets second. A Redis outage delays
  delivery; it never loses an event.

**Contents**

1. [Registration and email verification](#1-registration-and-email-verification)
2. [Social sign-in (GitHub / Google)](#2-social-sign-in-github--google)
3. [Authenticated request and token refresh](#3-authenticated-request-and-token-refresh)
4. [GitHub App linking and skill-profile generation](#4-github-app-linking-and-skill-profile-generation)
5. [Admin skill review and account activation](#5-admin-skill-review-and-account-activation)
6. [Project import and Contribution Request publication](#6-project-import-and-contribution-request-publication)
7. [Eligibility gate and Application submission](#7-eligibility-gate-and-application-submission)
8. [Advisory Fit Assessment](#8-advisory-fit-assessment)
9. [Owner decision, Assignment and Conversation](#9-owner-decision-assignment-and-conversation)
10. [Delivery, review, reputation and badges](#10-delivery-review-reputation-and-badges)
11. [Subscription checkout and Paymob callback](#11-subscription-checkout-and-paymob-callback)
12. [Material upload, scan and analysis](#12-material-upload-scan-and-analysis)
13. [Durable notification to realtime delivery](#13-durable-notification-to-realtime-delivery)

---

## 1. Registration and email verification

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Web Client
  participant MC as ManualAuthController
  participant AS as AuthService
  participant PH as PasswordHasherService
  participant DB as PostgreSQL
  participant M as SMTP

  U->>C: fill registration form
  C->>MC: GET /auth/username-availability?username=...
  MC-->>C: { available }

  C->>MC: POST /auth/register
  MC->>AS: register(dto)
  AS->>PH: hash(password)
  PH-->>AS: password_hash
  AS->>DB: BEGIN
  AS->>DB: INSERT User (status = pending)
  AS->>DB: INSERT EmailVerificationOtp (code_hash, expires_at)
  AS->>DB: COMMIT
  AS-)M: send OTP email
  AS-->>MC: { userId, verificationRequired: true }
  MC-->>C: 201 Created

  U->>C: enter 6-digit code
  C->>MC: POST /auth/verify-email
  MC->>AS: verifyEmail(dto)
  AS->>DB: SELECT EmailVerificationOtp (not consumed, not expired)
  alt code invalid or expired
    AS->>DB: UPDATE attempts = attempts + 1
    AS-->>C: 400 OTP_INVALID
  else code valid
    AS->>DB: BEGIN
    AS->>DB: UPDATE Otp SET consumed_at = now()
    AS->>DB: UPDATE User SET status = active
    AS->>DB: COMMIT
    AS->>SessionService: create(user, context)
    SessionService->>DB: INSERT AuthSession (token hashes)
    AS-->>C: 200 { accessToken, refreshToken, user }
  end
```

`User.status` starts at `pending`. Nothing in the platform accepts a `pending`
account except the verification routes themselves — the guard rejects it
everywhere else unless the handler opts in explicitly.

---

## 2. Social sign-in (GitHub / Google)

The `SocialAuthIntent` enum exists to close a real hole: a **login** flow may
only issue a session for an account that already exists, and a **register** flow
may only create a new one. Binding the intent to the state row makes it
impossible for a callback to silently do the other thing.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Web Client
  participant GC as GitHubAuthController
  participant SA as SocialAuthService
  participant DB as PostgreSQL
  participant GH as GitHub OAuth

  U->>C: click "Continue with GitHub"
  C->>GC: GET /auth/github/start?role=contributor&intent=register
  GC->>SA: startGitHub(role, intent)
  SA->>DB: INSERT AuthOAuthState (state_hash, requested_role, requested_intent, expires_at)
  SA-->>C: { authorizationUrl }
  C->>GH: redirect to authorize
  U->>GH: approve
  GH->>C: redirect ?code=...&state=...

  C->>GC: POST /auth/github/callback { code, state }
  GC->>SA: completeGitHub({ code, state })
  SA->>DB: SELECT AuthOAuthState WHERE state_hash (unconsumed, unexpired)
  alt state missing, expired, or already consumed
    SA-->>C: 400 OAUTH_STATE_INVALID
  else state valid
    SA->>DB: UPDATE state SET consumed_at = now()
    SA->>GH: exchange code for access token
    GH-->>SA: token
    SA->>GH: GET /user, GET /user/emails
    GH-->>SA: profile
    SA->>DB: SELECT AuthProviderAccount BY (provider, provider_account_id)
    alt intent = register AND account exists
      SA-->>C: 409 SOCIAL_ACCOUNT_ALREADY_REGISTERED
    else intent = login AND no account
      SA-->>C: 404 SOCIAL_ACCOUNT_NOT_REGISTERED
    else consistent
      SA->>DB: BEGIN
      SA->>DB: UPSERT User + AuthProviderAccount
      SA->>DB: INSERT AuthSession
      SA->>DB: COMMIT
      SA-->>C: 200 { accessToken, refreshToken, user }
    end
  end
```

---

## 3. Authenticated request and token refresh

```mermaid
sequenceDiagram
  autonumber
  participant C as Web Client
  participant G as AccessTokenGuard
  participant RG as RolesGuard
  participant CT as Controller
  participant SV as Service
  participant DB as PostgreSQL
  participant F as HttpExceptionFilter

  C->>G: GET /projects/me (Authorization: Bearer <opaque>)
  G->>G: extractBearerToken, then hash it
  G->>DB: SELECT AuthSession WHERE access_token_hash AND revoked_at IS NULL
  alt no session or expired
    G-->>C: 401 UNAUTHENTICATED
  else session valid
    G->>DB: SELECT User
    alt status != active and handler not opted in
      G-->>C: 403 ACCOUNT_NOT_ACTIVE
    else
      G->>RG: attach AuthenticatedUser
      RG->>RG: compare @Roles metadata with user.role
      alt role not allowed
        RG-->>C: 403 FORBIDDEN
      else
        RG->>CT: handler(user, dto)
        CT->>SV: business call
        SV->>DB: query / transaction
        alt ApplicationError raised
          SV->>F: throw
          F-->>C: status + { code, message }
        else
          SV-->>CT: domain DTO
          CT-->>C: 200 DTO
        end
      end
    end
  end

  note over C,DB: access token expires
  C->>CT: POST /auth/refresh { refreshToken }
  CT->>SV: SessionService.refresh(dto, context)
  SV->>DB: SELECT AuthSession WHERE refresh_token_hash
  SV->>DB: UPDATE session with rotated hashes
  SV-->>C: { accessToken, refreshToken }
```

Access tokens are opaque and stored only as hashes; the database row is the
authority, so `POST /auth/logout` revokes access immediately rather than waiting
for a JWT to expire.

---

## 4. GitHub App linking and skill-profile generation

Installing the GitHub App and selecting repositories **never** starts analysis on
its own. Generation begins only when the contributor submits an owned
`installationLinkId`, one to ten immutable repository IDs, and the accepted
consent version.

```mermaid
sequenceDiagram
  autonumber
  actor CB as Contributor
  participant C as Web Client
  participant GA as GitHubAppController
  participant GAS as GitHubAppService
  participant SPC as SkillProfilesController
  participant SPS as SkillProfilesService
  participant Q as SkillProfileGenerationQueue
  participant W as SkillProfileGenerationWorker
  participant GS as SkillProfileGenerationService
  participant GE as GitHubEvidenceService
  participant AI as AiService
  participant FA as FastAPI /skill-profiles/generate
  participant DB as PostgreSQL
  participant N as NotificationsService

  CB->>C: connect GitHub App
  C->>GA: POST /github/app/installations/start
  GA->>GAS: startConnection(user, dto)
  GAS->>DB: INSERT GitHubAppLinkState (state_hash, flow_type, issued)
  GAS-->>C: { installUrl, attemptId }
  CB->>C: approve on GitHub, return to callback
  C->>GA: POST /github/app/installations/callback { state, code }
  GA->>GAS: completeConnection(user, dto)
  GAS->>DB: UPSERT GitHubAppInstallation + GitHubAppInstallationLink (active)
  GAS->>DB: UPSERT GitHubAppRepository rows
  GAS-->>C: { installationLinkId, repositories }

  CB->>C: select 1..10 repos, accept consent
  C->>SPC: POST /skill-profiles/me/generations
  SPC->>SPS: startGeneration(input)
  SPS->>DB: BEGIN
  SPS->>DB: verify link ownership + repository selection
  SPS->>DB: INSERT SkillProfileGeneration (status = queued, consent_version, consented_at)
  SPS->>DB: COMMIT
  SPS-)Q: enqueue(generationId)
  SPS-->>C: 202 { generationId, status: queued }

  Q->>W: job
  W->>GS: process(generationId)
  GS->>DB: UPDATE status = collecting_evidence
  GS->>GE: getSelectedSkillProfilingEvidence(linkId, repoIds)
  GE->>GE: revalidate link is still active
  GE-->>GS: contributor-authored evidence capsules
  GS->>DB: store evidence_snapshot, status = analyzing
  GS->>AI: generateSkillProfile({ role: "contributor", capsules })
  AI->>FA: POST /skill-profiles/generate (internal bearer)
  FA-->>AI: candidate skills + evidenceId citations
  AI-->>GS: SkillProfileResult
  GS->>GS: discard citations that match no evidenceId
  GS->>GS: retain detected frameworks + dominant language as beginner fallbacks

  alt no attributable authorship
    GS->>DB: UPDATE status = needs_more_evidence
    GS->>N: createSkillProfileGenerationNotification(needs_more_evidence)
  else provider or timeout error
    GS->>DB: UPDATE status = failed, failure_reason
    GS->>N: createSkillProfileGenerationNotification(failed)
  else usable evidence
    GS->>DB: BEGIN
    GS->>DB: INSERT SkillProfile rows (status = pending)
    GS->>DB: UPDATE generation status = pending_review
    GS->>DB: COMMIT
    GS->>N: createSkillProfileGenerationNotification(ready_for_review)
  end
  note over GS,N: notification failure is isolated —<br/>the committed generation result stands
```

Retry is allowed only for the contributor's own `failed` or
`needs_more_evidence` generation, requires fresh consent, revalidates access,
and creates a **new** generation row linked to the previous one via
`retry_of_generation_id`.

---

## 5. Admin skill review and account activation

```mermaid
sequenceDiagram
  autonumber
  actor A as Admin
  participant C as Admin Client
  participant AC as AdminSkillReviewsController
  participant RS as SkillProfilesReviewService
  participant IS as IdentityAccountStatusService
  participant N as NotificationsService
  participant DB as PostgreSQL

  A->>C: open review queue
  C->>AC: GET /admin/skill-reviews/pending
  AC->>RS: listPendingReviews(input)
  RS->>DB: SELECT SkillProfile WHERE status = pending
  RS-->>C: candidates + evidence summaries

  A->>C: approve / reject / adjust proficiency
  C->>AC: POST /admin/skill-reviews/:id/approve
  AC->>RS: approve({ skillProfileId, reviewer })
  RS->>DB: BEGIN
  RS->>DB: UPDATE SkillProfile SET status = approved, reviewed_by, reviewed_at
  RS->>DB: INSERT SkillProfileReviewDecision (previous/new status + proficiency)
  RS->>DB: COMMIT
  RS->>IS: activateContributorAfterSkillApproval(userId)
  IS->>DB: UPDATE User SET status = active
  RS->>N: createSkillReviewNotification(approved)
  N->>DB: INSERT Notification + NotificationEvent
  RS-->>C: 200 SkillProfileDto
```

Note the direction of the arrows: the `admin` module owns no tables. It calls
services exported by `skill-profiles`, `identity`, and `notifications`, and each
of those writes only its own rows.

---

## 6. Project import and Contribution Request publication

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  participant C as Web Client
  participant PC as ProjectsController
  participant PS as ProjectsService
  participant PPS as ProjectPublicationService
  participant TC as ContributionTasksController
  participant TS as ContributionTasksService
  participant SRS as ContributionRequestSkillRequirementsService
  participant CRP as ContributionRequestPublicationService
  participant Q as RequirementInferenceQueue
  participant RP as RequirementInferenceProcessorService
  participant AI as AiService
  participant GH as GitHub API
  participant DB as PostgreSQL

  O->>C: paste repository URL
  C->>PC: POST /projects/github/preview
  PC->>PPS: preview(user, repositoryReference)
  PPS->>GH: GET /repos/:owner/:repo (+ languages, README)
  GH-->>PPS: metadata
  PPS-->>C: preview (nothing persisted)

  C->>PC: POST /projects (Idempotency-Key)
  PC->>PPS: createDraft(user, dto, idempotencyKey)
  PPS->>DB: assert repository control, then INSERT Project (status = draft, revision = 1)
  PPS->>DB: INSERT ProjectOperation (idempotency log)
  PPS-->>C: 201 ProjectDto
  note over C,PC: `POST /projects/import/github` is retired.<br/>It now calls ProjectsService.rejectRetiredImportRoute()<br/>and never creates a Project.

  O->>C: publish project
  C->>PC: POST /projects/me/:projectId/publish { revision }
  PC->>PPS: publish(user, projectId, dto)
  PPS->>DB: BEGIN
  PPS->>DB: SELECT Project FOR UPDATE, compare revision
  alt revision mismatch
    PPS-->>C: 409 PROJECT_REVISION_CONFLICT
  else
    PPS->>DB: UPDATE status = published, published_at, revision + 1
    PPS->>DB: INSERT ProjectStateTransition (draft → published, validation_outcome)
    PPS->>DB: COMMIT
    PPS-->>C: 200 ProjectDto
  end

  O->>C: create contribution request
  C->>TC: POST /projects/:projectId/contribution-requests
  TC->>TS: createDraft(input)
  TS->>DB: BEGIN
  TS->>DB: INSERT ContributionRequest (status = draft, skill_inference_status = pending)
  TS->>DB: INSERT ContributionRequestRequirement rows (ordered)
  TS->>DB: INSERT ContributionRequestAudit (created)
  TS->>DB: COMMIT
  TS-)Q: enqueueInference(requestId)
  TS-->>C: 201 RequestDto

  Q->>RP: process(requestId)
  RP->>DB: load draft requirements
  RP->>AI: inferRequirementSkills(input)
  AI->>AI: RequirementInferenceClient → POST /requirements/infer
  alt provider failed
    RP->>DB: UPDATE skill_inference_status = failed
    note over RP,DB: retriable — the draft stays editable<br/>and the owner may enter levels by hand
  else inferred
    RP->>DB: BEGIN
    RP->>DB: keep existing owner_override rows, replace ai_inferred rows
    RP->>DB: INSERT ContributionRequestSkillRequirement (source = ai_inferred, confidence)
    RP->>DB: UPDATE skill_inference_status = succeeded, skill_inference_ran_at
    RP->>DB: INSERT AiTraceLog
    RP->>DB: COMMIT
  end
  note over RP,DB: the processor owns these rows directly.<br/>It does not route writes through<br/>ContributionRequestSkillRequirementsService.

  O->>C: review or override required levels
  C->>TC: PUT /contribution-requests/:requestId/skill-requirements
  TC->>SRS: replaceOwnerSkillRequirements(user, requestId, dto)
  SRS->>DB: REPLACE rows with source = owner_override
  note over SRS,DB: an owner_override always wins over<br/>a later re-inference

  O->>C: publish
  C->>TC: POST /contribution-requests/:requestId/publish
  TC->>CRP: publishRequest(input)
  CRP->>DB: assert at least one required skill row exists
  CRP->>DB: UPDATE status = published, published_at
  CRP->>DB: INSERT ContributionRequestAudit (published)
```

---

## 7. Eligibility gate and Application submission

The gate is deterministic and runs **inside** the submission transaction, so a
Request whose required levels changed a millisecond ago cannot be applied to
under stale rules.

```mermaid
sequenceDiagram
  autonumber
  actor CB as Contributor
  participant C as Web Client
  participant EC as EligibilityController
  participant AC as ApplicationsController
  participant AS as ApplicationsService
  participant ES as EligibilityService
  participant SS as SkillProfileSummaryService
  participant QS as ApplicationDailyQuotaService
  participant TS as ContributionTasksService
  participant N as NotificationsService
  participant DB as PostgreSQL

  CB->>C: open a published task
  C->>EC: GET /tasks/:requestId/eligibility
  EC->>ES: previewForRequest(user, requestId)
  ES->>SS: listApprovedSkillsForEligibility(userId)
  ES->>ES: compare held vs required levels (pure)
  ES-->>C: { outcome, blockingSkills } (preview only, nothing written)

  CB->>C: submit application
  C->>AC: POST /tasks/:requestId/applications { contributionApproach, proposedDeliveryDurationDays, idempotencyKey }
  AC->>AS: submit(input)
  AS->>DB: BEGIN
  AS->>TS: lockApplicationSubmissionContext(requestId)
  TS->>DB: SELECT ContributionRequest FOR UPDATE
  alt request not published / closed / terminal
    AS-->>C: 409 APPLICATIONS_CLOSED · REQUEST_CANCELLED · REQUEST_TERMINAL
  else
    AS->>DB: check unique (contributor, request)
    alt already applied
      AS-->>C: 409 ALREADY_APPLIED
    else
      AS->>ES: evaluateForRequest(contributor, request)
      ES->>SS: listApprovedSkillsForEligibility(userId)
      ES->>DB: INSERT EligibilityEvaluation (outcome, blocking_skills, snapshot version)
      alt outcome = blocked
        ES-->>AS: blocked
        AS->>DB: COMMIT (evaluation only, no Application)
        AS-->>C: 403 APPLICATION_BLOCKED_SKILL_GAP + eligibilityEvaluationId
      else outcome = eligible
        AS->>QS: reserve(userId, planDailyLimit)
        alt daily allowance spent
          AS-->>C: 429 APPLICATION_DAILY_LIMIT_REACHED
        else
          AS->>DB: INSERT ApplicationRequirementSnapshot (frozen requirements + levels)
          AS->>DB: INSERT ApplicationEvidenceSnapshot (approved, still-authorized evidence only)
          AS->>DB: INSERT Application (status = pending_owner_review, review_due_at)
          AS->>DB: INSERT ApplicationAudit (submitted, idempotency_key)
          AS->>DB: COMMIT
          AS->>N: createApplicationNotification(owner, submitted)
          AS-->>C: 201 ApplicationDto
        end
      end
    end
  end
```

A blocked contributor can then ask for an explanation, which is the only place
a model is involved in this flow:

```mermaid
sequenceDiagram
  autonumber
  actor CB as Contributor
  participant EG as EligibilityGuidanceController
  participant GS as EligibilityGuidanceService
  participant Q as EligibilityGuidanceQueue
  participant AI as AiService
  participant DB as PostgreSQL

  CB->>EG: POST /contributors/me/eligibility-guidance { eligibilityEvaluationId }
  EG->>GS: request(user, dto)
  GS->>DB: INSERT EligibilityGuidance (status = pending, blocking_skills copied)
  GS-)Q: enqueueGeneration(guidanceId)
  GS-->>CB: 202 { guidanceId, status: pending }

  Q->>GS: worker
  GS->>AI: requestSkillGapGuidance(blockingSkills, context)
  alt provider unavailable
    GS->>DB: UPDATE status = failed
    note over GS,DB: `failed` is a real state — a contributor who<br/>asked for help and got none must be told so
  else
    GS->>DB: UPDATE status = ready, narrative, recommendations, model_used
  end
  CB->>EG: GET /contributors/me/eligibility-guidance/:guidanceId
  EG-->>CB: guidance or an explicit failure
```

The deterministic blocking-skill list survives either branch. The narrative is
an addition to the reason, never the reason itself.

---

## 8. Advisory Fit Assessment

An assessment informs the owner. It cannot write `Application.status`, and its
inputs are the snapshots frozen at submission — not the live Request.

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  participant C as Web Client
  participant AC as ApplicationsController
  participant AF as AdvisoryFitAssessmentService
  participant Q as AdvisoryFitAssessmentQueue
  participant P as AdvisoryFitAssessmentProcessorService
  participant AI as AiService
  participant FA as FastAPI /advisory-fit/assess
  participant R as AdvisoryFitAssessmentReaperService
  participant DB as PostgreSQL

  O->>C: request an assessment
  C->>AC: POST /applications/:applicationId/assessment-requests { idempotencyKey }
  AC->>AF: request({ actor, applicationId, idempotencyKey })
  AF->>DB: BEGIN
  AF->>DB: reconfirm actor still owns the Contribution Request
  AF->>DB: SELECT AssessmentRequest BY (owner_id, idempotency_key)
  alt replay with a different fingerprint
    AF-->>C: 409 ASSESSMENT_IDEMPOTENCY_CONFLICT
  else replay with the same fingerprint
    AF->>DB: COMMIT
    AF-->>C: 200 existing assessment (no new work)
  else new request
    AF->>DB: assert Application is still pending_owner_review
    alt an active request already exists
      AF-->>C: 409 ASSESSMENT_ALREADY_ACTIVE
    else retryable prior request exhausted its budget
      AF-->>C: 409 ASSESSMENT_RETRY_LIMIT_REACHED
    else
      AF->>DB: INSERT/claim AssessmentRequest (status = requested)
      AF->>DB: INSERT AssessmentRequestAudit (requested)
      AF->>DB: COMMIT
      AF-)Q: enqueueAssessment(assessmentRequestId)
      AF-->>C: 202 { status: requested }
    end
  end

  Q->>P: job
  P->>DB: load pinned ApplicationRequirementSnapshot + ApplicationEvidenceSnapshot
  P->>DB: INSERT AssessmentAttempt (attempt_number, started_at, provider, model, prompt_version)
  P->>AI: requestAdvisoryFit(snapshots)
  AI->>FA: POST /advisory-fit/assess (internal bearer, timeout-bounded)
  alt provider timeout or malformed output
    FA--x AI: error
    P->>DB: UPDATE attempt status = failed, error_code, latency_ms
    P->>DB: UPDATE AssessmentRequest status = unavailable
    P->>DB: INSERT audit (attempt_failed)
    note over P,DB: `unavailable` is retriable and is never<br/>presented as a judgement about the contributor
  else structured result
    FA-->>AI: findings + fit band
    P->>DB: BEGIN
    P->>DB: UPDATE attempt status = completed, tokens, latency_ms
    P->>DB: INSERT AdvisoryFitAssessment (fit_band derived by the backend)
    P->>DB: INSERT AssessmentFinding rows (per requirement: finding, confidence, citations, uncertainty)
    P->>DB: UPDATE AssessmentRequest status = completed, completed_at
    P->>DB: INSERT audit (attempt_completed)
    P->>DB: COMMIT
  end

  O->>C: open the assessment
  C->>AC: GET /applications/:applicationId/assessment
  AC->>AF: getAssessment(...)
  AF-->>C: fit band, per-requirement findings, citations

  C->>AC: POST /applications/:applicationId/assessment/presentations
  AC->>AF: presentAssessment(...)
  AF->>DB: INSERT AssessmentPresentation (owner_id, presented_at)
  AF->>DB: INSERT audit (presented)

  loop ADVISORY_FIT_REAP_INTERVAL_MS
    R->>DB: find attempts started before now - ADVISORY_FIT_STALE_AFTER_MS
    R->>DB: mark failed, request unavailable
  end
```

The `fit_band` is computed by NestJS from the returned findings — the model does
not hand over a band to be trusted (ADR 0001).

---

## 9. Owner decision, Assignment and Conversation

Accepting an Application does four things atomically: record the decision,
create the Assignment, move the Request to `assigned`, and close out every other
pending Application on that Request.

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  participant C as Web Client
  participant AC as ApplicationsController
  participant AS as ApplicationsService
  participant TS as ContributionTasksService
  participant CV as AssignmentConversationsService
  participant N as NotificationsService
  participant DB as PostgreSQL

  O->>C: accept an applicant
  C->>AC: POST /applications/:applicationId/accept { idempotencyKey }
  AC->>AS: accept(input)
  AS->>DB: BEGIN
  AS->>TS: lockApplicationReviewOwner(applicationId)
  TS->>DB: SELECT ContributionRequest FOR UPDATE, confirm owner
  AS->>DB: SELECT Application, assert status = pending_owner_review
  AS->>DB: check ApplicationAudit for a replayed idempotency_key
  alt replay, same fingerprint
    AS->>DB: ROLLBACK
    AS-->>C: 200 existing ApplicationDto
  else
    AS->>DB: INSERT OwnerDecision (accepted, idempotency_key, command_fingerprint)
    AS->>DB: UPDATE Application SET status = accepted, owner_reviewed_at
    AS->>DB: INSERT Assignment (agreed_delivery_duration_days, agreed_delivery_due_at)
    AS->>TS: assignFromOwnerDecision(requestId)
    TS->>DB: UPDATE ContributionRequest SET status = assigned
    TS->>DB: INSERT ContributionRequestAudit (assigned)
    AS->>DB: UPDATE other pending Applications SET status = not_selected
    AS->>DB: INSERT ApplicationAudit rows (accepted, not_selected ...)
    AS->>CV: ensureForAssignment(tx, input)
    CV->>DB: INSERT AssignmentConversation (status = active, aggregate_version = 0)
    AS->>N: createApplicationNotification(...) for accepted + each not_selected
    N->>DB: INSERT Notification + NotificationEvent rows
    AS->>DB: COMMIT
    AS->>N: emitApplicationNotifications(ids)
    AS-->>C: 200 ApplicationDto
  end
```

Messaging on the resulting conversation:

```mermaid
sequenceDiagram
  autonumber
  actor P as Participant (owner or contributor)
  participant CC as AssignmentConversationsController
  participant CV as AssignmentConversationsService
  participant DB as PostgreSQL
  participant RP as RealtimePublisherService
  participant S as Socket.IO /realtime
  participant OTHER as The other participant

  P->>CC: POST /assignment-conversations/:id/messages { body, idempotencyKey }
  CC->>CV: sendMessage(input)
  CV->>DB: BEGIN
  CV->>DB: SELECT AssignmentConversation FOR UPDATE
  alt status = read_only (12-month expiry)
    CV-->>P: 409 CONVERSATION_READ_ONLY
  else
    CV->>DB: INSERT Message (sequence = aggregate_version + 1, idempotency_key)
    CV->>DB: INSERT MessageEvent (created, aggregate_version)
    CV->>DB: UPDATE conversation aggregate_version, updated_at
    CV->>DB: COMMIT
    CV->>RP: publish conversation.message.created
    RP->>S: emit to room user:<recipient>
    S-->>OTHER: envelope v1
    CV->>NotificationsService: createConversationActivityNotification(...)
    CV-->>P: 201 MessageDto
  end
```

Conversations become `read_only` twelve months after the assignment (ADR 0008);
history stays readable, writes stop.

---

## 10. Delivery, review, reputation and badges

```mermaid
sequenceDiagram
  autonumber
  actor CB as Contributor
  actor O as Owner
  participant DC as DeliveryReviewsController
  participant DS as DeliveryReviewsService
  participant AS as ApplicationsService
  participant TS as ContributionTasksService
  participant AE as DeliveryApprovedEventsService
  participant Q as DeliveryReputationQueue
  participant PR as DeliveryReputationProjectionService
  participant RS as ReputationService
  participant BS as BadgesService
  participant N as NotificationsService
  participant DB as PostgreSQL

  CB->>DC: POST /applications/:applicationId/deliveries { prUrl, notes, idempotencyKey }
  DC->>DS: submit(input)
  DS->>AS: lockDeliverySubmissionContext(applicationId)
  AS->>DB: SELECT Application + Assignment FOR UPDATE, assert accepted
  DS->>DB: BEGIN
  DS->>DB: INSERT Delivery (status = submitted, submission_number = 1)
  DS->>DB: INSERT DeliverySubmission (history row)
  DS->>DB: COMMIT
  DS->>N: createDeliveryNotification(owner, submitted)
  DS-->>CB: 201 DeliveryDto

  O->>DC: GET /owner/deliveries
  DC->>DS: listReviewQueue(user, query)
  DS-->>O: pending deliveries

  O->>DC: POST /deliveries/:deliveryId/reviews { outcome, rating, feedback, idempotencyKey }
  DC->>DS: review(input)
  DS->>DB: BEGIN
  DS->>DB: SELECT Delivery FOR UPDATE, confirm owner and submission_number
  DS->>DB: INSERT DeliveryReview (outcome, rating)
  alt outcome = changes_requested
    DS->>DB: UPDATE Delivery SET status = changes_requested
    DS->>DB: COMMIT
    DS->>N: createDeliveryNotification(contributor, changes_requested)
    note over CB,DS: contributor resubmits via PATCH /deliveries/:id,<br/>submission_number increments, history is appended
  else outcome = rejected
    DS->>DB: UPDATE Delivery SET status = rejected, reviewed_at
    DS->>DB: COMMIT
    DS->>N: createDeliveryNotification(contributor, rejected)
  else outcome = approved
    DS->>DB: UPDATE Delivery SET status = approved, reviewed_at
    DS->>TS: completeFromDeliveryReview(requestId)
    TS->>DB: UPDATE ContributionRequest SET status = completed
    TS->>DB: INSERT ContributionRequestAudit (completed)
    DS->>BS: awardFirstContributionIfEligible(...)
    BS->>DB: INSERT UserBadge (source_delivery_id)
    DS->>AE: append(tx, review)
    AE->>DB: INSERT DeliveryApprovedEvent (outbox, published_at = null)
    DS->>DB: COMMIT
    AE-)Q: schedule()
    DS->>N: createDeliveryNotification(contributor, approved) + createBadgeNotification
  end
  DS-->>O: 200 DeliveryDto

  Q->>PR: processPendingApprovals(limit)
  PR->>RS: replaceProjection(contributorId, facts)
  RS->>DB: UPSERT ReputationRecord (totals, success_rate, overall_rating)
  PR->>AE: markPublished(eventId)
```

Reputation is a **projection**: `DeliveryApprovedEvent` is the committed fact,
and `ReputationRecord` is rebuilt from it. A worker crash delays the score; it
cannot invent or lose an approval.

---

## 11. Subscription checkout and Paymob callback

```mermaid
sequenceDiagram
  autonumber
  actor U as Owner or Contributor
  participant C as Web Client
  participant PC as PaymentsController
  participant PS as PaymentsService
  participant ES as EntitlementsService
  participant CP as PaymentCustomerProfileService
  participant PV as PaymobPaymentProvider
  participant PM as Paymob
  participant WC as PaymobWebhookController
  participant WS as PaymentWebhookService
  participant DB as PostgreSQL

  U->>C: choose the gold plan
  C->>PC: POST /me/subscription/checkout { planType, roleContext, idempotencyKey }
  PC->>PS: createCheckout(input)
  PS->>ES: getPlanCatalogEntry(planType)
  PS->>DB: SELECT PaymentAttempt BY (user_id, idempotency_key)
  alt replay of the same checkout
    PS-->>C: 200 same checkout URL (no second intention)
  else
    PS->>ES: assertPlanPurchaseAllowed(userId, roleContext, planType)
    PS->>DB: SELECT any pending purchase for this role context
    alt a pending attempt already exists
      PS-->>C: 200 that attempt's checkout URL
    else
      PS->>CP: getForUser(userId)
      alt phone number missing or malformed
        PS-->>C: 400 PAYMENT_CUSTOMER_PROFILE_INCOMPLETE
      else
        PS->>DB: INSERT PaymentAttempt (status = pending, amount_cents, idempotency_key)
        PS->>PV: createIntention(amount, currency, ref = "sharek:payment:<attemptId>")
        PV->>PM: POST /intention (secret key)
        PM-->>PV: { intentionId, clientSecret, checkoutUrl }
        PS->>DB: UPDATE attempt with provider_intention_id, provider_checkout_url
        PS-->>C: 201 { checkoutUrl, paymentId, expiresAt }
      end
    end
  end

  U->>PM: complete payment on the hosted page
  PM->>WC: POST /payments/paymob/webhook (payload + hmac)
  WC->>WS: process({ payload, hmac })
  WS->>PV: verifyAndNormalizeTransactionCallback(payload, hmac)
  alt HMAC invalid or payload malformed
    PV--x WS: error
    WS->>DB: INSERT PaymentWebhookEvent (verification_status = invalid)
    WS-->>PM: stable application error, no state change
  else verified
    WS->>DB: BEGIN
    WS->>DB: INSERT PaymentWebhookEvent (verified, processing = pending, minimized payload)
    WS->>DB: SELECT pg_advisory_xact_lock('payment_webhook:' || paymentId)
    WS->>DB: SELECT PaymentAttempt BY id parsed from merchant reference
    alt duplicate fingerprint or already terminal
      WS->>DB: UPDATE event processing_status = ignored
      WS->>DB: COMMIT
      WS-->>PM: 200 { outcome: duplicate }
    else success transaction
      WS->>DB: transitionPaymentAttemptStatus(pending → paid)
      WS->>ES: activatePurchasedPlan(userId, planType, roleContext, period)
      ES->>DB: UPSERT Subscription (source = payment_provider, current_period_*)
      WS->>DB: UPDATE event processing_status = processed
      WS->>DB: COMMIT
      WS-->>PM: 200 { outcome: processed }
    else declined
      WS->>DB: transitionPaymentAttemptStatus(pending → failed)
      WS->>DB: UPDATE event processing_status = processed
      WS->>DB: COMMIT
      WS-->>PM: 200 { outcome: processed }
    end
  end

  C->>PC: GET /me/payments/:paymentId
  PC-->>C: PaymentStatusDto
```

Three things make this callback safe under retry, reorder, and replay: the
advisory transaction lock, the unique webhook `fingerprint`, and the fact that
only `source = payment_provider` can be written by this path.

---

## 12. Material upload, scan and analysis

Sharing a file with a contributor and letting a model read it are two separate
authorizations (ADR 0004), and analysis produces owner-reviewed **suggestions**,
never direct writes (ADR 0005).

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  participant C as Web Client
  participant MC as MaterialsController
  participant MS as MaterialsService
  participant ST as MaterialStorage
  participant SQ as MaterialScanQueue
  participant SP as MaterialScanProcessorService
  participant SC as MalwareScanner
  participant DB as PostgreSQL

  O->>C: upload a document
  C->>MC: POST /projects/:projectId/materials (multipart)
  MC->>MS: createForProject(input)
  MS->>MS: validate MIME type and MATERIAL_MAX_BYTES
  MS->>ST: put(storage_key, bytes)
  MS->>DB: BEGIN
  MS->>DB: INSERT Material (current_version = 1, visibility)
  MS->>DB: INSERT MaterialVersion (content_hash, byte_size, scan_status = pending)
  MS->>DB: INSERT MaterialAudit (created)
  MS->>DB: COMMIT
  MS-)SQ: enqueueScan(versionId)
  MS-->>C: 201 MaterialDto (not yet downloadable)

  SQ->>SP: job
  SP->>SC: scan(storage_key)
  alt infected
    SP->>DB: UPDATE MaterialVersion SET scan_status = infected, scan_error_code
    SP->>ST: delete(storage_key)
  else clean
    SP->>DB: UPDATE MaterialVersion SET scan_status = clean, scanned_at
  end
```

Sharing and download:

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  actor CB as Contributor
  participant MC as MaterialsController
  participant MG as MaterialGrantsService
  participant MA as MaterialAccessService
  participant DT as MaterialDownloadTokenService
  participant ST as MaterialStorage
  participant DB as PostgreSQL

  O->>MC: POST /materials/:materialId/grants { granteeId }
  MC->>MG: grant(input)
  MG->>DB: INSERT MaterialGrant (grantee_id, granted_by)
  MG->>DB: INSERT MaterialAudit (granted)

  CB->>MC: POST /materials/:materialId/versions/:version/download-token
  MC->>MA: requireReadAccess(user, materialId)
  MA->>DB: check ownership OR active MaterialGrant OR assignment scope
  MA->>DB: assert scan_status = clean
  MC->>DT: issue({ materialId, version, userId })
  DT-->>CB: short-lived signed token (MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS)

  CB->>MC: GET /material-downloads?token=...
  MC->>DT: verify(token)
  MC->>ST: getStream(storage_key)
  ST-->>CB: file stream
  MC->>DB: INSERT MaterialAudit (downloaded)
```

Analysis:

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  participant AC as MaterialAnalysisController
  participant MA as MaterialAnalysisService
  participant ES as EntitlementsService
  participant Q as MaterialAnalysisQueue
  participant W as MaterialAnalysisWorker
  participant ST as MaterialStorage
  participant AI as AiService
  participant FA as FastAPI /material-analysis/analyze
  participant PPS as ProjectPublicationService
  participant DB as PostgreSQL

  O->>AC: POST /projects/:projectId/material-analysis/sets { materialIds }
  AC->>MA: createSet(input)
  MA->>ES: resolveMaterialAnalysisEntitlement(userId)
  alt plan below MATERIAL_ANALYSIS_MIN_PLAN
    MA-->>O: 403 MATERIAL_ANALYSIS_NOT_ENTITLED
  else
    MA->>DB: INSERT MaterialAnalysisSet
    MA->>DB: INSERT MaterialAnalysisSetVersion per material (pins material_version + content_hash)
    MA-->>O: 201 AnalysisSetDto
  end
  note over MA,DB: the set pins exact versions —<br/>re-uploading a file later cannot change<br/>what a completed run was based on

  O->>AC: POST /material-analysis/sets/:setId/runs
  AC->>MA: startSet(input)
  MA->>DB: INSERT MaterialAnalysisRun (status = queued, contract_version)
  MA-)Q: enqueueRun(runId)
  MA-->>O: 202 { runId }

  Q->>W: job
  W->>ST: getStream() for each pinned version
  W->>W: extract text, cap at MATERIAL_ANALYSIS_MAX_EXTRACTED_CHARACTERS
  W->>DB: INSERT MaterialAnalysisChunk rows (text + pgvector embedding)
  W->>AI: requestMaterialAnalysis(chunks, purpose)
  AI->>FA: POST /material-analysis/analyze
  alt provider error
    W->>DB: UPDATE run status = failed, error_code
  else
    FA-->>AI: structured suggestions
    W->>DB: INSERT MaterialDraftSuggestion rows (status = pending, rationale, source_versions)
    W->>DB: UPDATE run status = completed, document_count, extracted_characters
  end

  O->>AC: GET /material-analysis/runs/:runId
  AC-->>O: run + pending suggestions with their rationale

  O->>AC: POST /material-analysis/suggestions/:id/adopt-project
  AC->>MA: adoptProjectSuggestion(input)
  MA->>PPS: apply the owner-approved field change
  MA->>DB: UPDATE suggestion status = adopted, adopted_entity_type/id, reviewed_by
  note over O,DB: nothing reaches a Project or Request<br/>without this explicit owner action
```

---

## 13. Durable notification to realtime delivery

Every notification in the platform takes this path, whichever module produced
it.

```mermaid
sequenceDiagram
  autonumber
  participant SRC as Any producing service
  participant N as NotificationsService
  participant NE as NotificationEventsService
  participant DB as PostgreSQL
  participant NR as NotificationRealtimeService
  participant RP as RealtimePublisherService
  participant R as Redis adapter
  participant GW as RealtimeGateway
  participant C as Web Client
  participant REC as NotificationEventRecoveryService
  participant RET as NotificationRetentionService

  SRC->>N: createApplicationNotification({ userId, templateKey, parameters, deepLink, priority, deduplicationKey })
  N->>DB: BEGIN
  N->>DB: check NotificationCategoryPreference (in_app_enabled)
  N->>DB: check deduplication_key
  N->>DB: INSERT Notification (semantic: template_key + parameters, aggregate_version)
  N->>NE: appendCreated(tx, notification)
  NE->>DB: INSERT NotificationEvent (published_at = null)
  N->>DB: COMMIT
  note over N,DB: the durable row exists before any socket work

  N->>NR: publishCreated(notificationId)
  NR->>RP: publishToUser(userId, envelope v1)
  RP->>GW: emit on this instance
  RP->>R: publish for other instances
  R->>GW: fan-out
  GW->>C: notification.created (room user:<id>)
  alt publish succeeded
    NR->>DB: UPDATE NotificationEvent SET published_at = now()
  else Redis or socket failure
    NR->>DB: UPDATE publish_attempts + 1, last_publish_error_code
    note over NR,DB: HTTP inbox is unaffected —<br/>GET /notifications still returns it
  end

  loop NOTIFICATION_EVENT_RECOVERY_INTERVAL_MS
    REC->>DB: SELECT NotificationEvent WHERE published_at IS NULL LIMIT batch
    REC->>NR: republish with the same stable event id
    alt attempts >= NOTIFICATION_EVENT_MAX_PUBLISH_ATTEMPTS
      REC->>DB: record REALTIME_RETRY_EXHAUSTED
    end
  end

  C->>GW: (reconnect) WS /realtime with Bearer token
  GW->>DB: resolve AuthSession → join room user:<id>
  C->>N: GET /notifications?cursor=...
  N->>NotificationPresenterService: present(rows, user.preferred_language)
  N-->>C: localized page + unread count

  C->>N: PATCH /notifications/:id/read-state { read: true }
  N->>DB: UPDATE is_read, read_at, aggregate_version + 1
  N->>NE: appendReadStateChanged(tx, notification)
  N->>NR: publishReadStateChanged(notificationId)
  GW->>C: other tabs converge

  loop NOTIFICATION_RETENTION_INTERVAL_MS
    RET->>DB: DELETE notifications older than the user's retention_days
  end
```

Notifications are stored **semantically** — `template_key` plus `parameters` —
and rendered into the reader's language at read time (ADR 0012). Changing a
translation therefore changes old notifications too, and one row serves an
Arabic and an English reader correctly.
