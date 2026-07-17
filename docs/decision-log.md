# ShareK — Approved Human Decision Log

**Status:** APPROVED DECISIONS  
**Updated:** 2026-07-17  
**Purpose:** Record the completed human decision round that governs the later documentation consolidation.  
**Important:** These decisions supersede conflicting statements in older documents.

This update does not change the status of the generated canonical document set. Status changes and full consolidation remain a separate, later task.

---

## PD-001 — ITI AI Checklist Is an External Constraint

**Status:** APPROVED

### Decision

The ITI AI checklist is an external capstone-evaluation constraint, not the primary product specification.

Product coherence, realistic delivery, and truthful implementation status take priority.

Only checklist requirements confirmed as mandatory affect the MVP. Optional Gold-tier requirements must not be implemented merely to decorate the project with AI terminology.

### Consequences

- Store the official checklist under `docs/reference/`.
- Keep checklist-compliance mapping separate from product requirements.
- Never mark checklist features implemented without repository evidence.
- Multi-agent workflows, multimodal AI, reranking, MCP, and similar features are not automatically MVP requirements.

### Open dependency

The team must obtain the official ITI checklist and classify each item as:

- `MANDATORY`
- `OPTIONAL`
- `NOT_APPLICABLE`
- `UNCLEAR`

---

## AD-001 — NestJS Is the Core Backend; FastAPI Is a Bounded AI Service

**Status:** APPROVED

### Decision

NestJS remains the authoritative core backend.

The existing FastAPI service remains separate for AI-specific workloads that benefit from Python tooling.

Core business logic must not move into FastAPI.

### NestJS owns

- Users and authentication.
- Profiles.
- Projects.
- Tasks.
- Applications.
- Assignments.
- Membership.
- Evidence submissions.
- Reviews.
- Reputation.
- Disputes.
- Authorization.
- Audit history.
- Business state transitions.

### FastAPI may perform

- AI skill inference.
- Advisory application-fit analysis.
- Project summaries.
- Commit and pull-request summaries.
- Retrieval workflows.
- AI evaluation and experimentation.

### FastAPI must not directly

- Accept or reject applications.
- Change project membership.
- Approve evidence.
- Publish reviews.
- Create final reputation events.
- Release payments.
- Bypass NestJS authorization.

### Revisit trigger

Reconsider this boundary only if the AI service provides no meaningful Python-specific value or its operational cost becomes greater than its benefit.

---

## AI-001 — AI Skill Inference Is Required in MVP

**Status:** APPROVED

### Decision

AI Skill Inference is a required MVP capability.

This decision supersedes any earlier statement that defers AI skill inference beyond MVP.

When a contributor requests AI inference after connecting GitHub, ShareK analyzes accessible public evidence and generates an evidence-backed inferred skill profile.

### MVP evidence sources

- Public GitHub repositories.
- Public contribution history.
- Public pull requests.
- Public commit diffs when accessible.
- Repository languages.
- README files.
- Public issues and code-review activity when available.

### Required AI output

Each inferred skill must include:

- Skill name.
- Estimated proficiency level.
- Confidence.
- Evidence references.
- Evidence date or last analyzed date.
- Known limitations or uncertainty.
- Inference status.

### Trust rules

- `AI_INFERRED` does not mean verified.
- Lack of public evidence does not prove lack of skill.
- Contributors may dispute inaccurate inferences.
- AI skill inference must not become an irreversible hiring, acceptance, or rejection decision.
- Public UI must explain that the result is inferred from available public evidence.

### Implementation priority

AI Skill Inference belongs in MVP, but it must not block completion of the manual contribution, evidence, review, and reputation loop.

---

## AI-002 — Advisory AI Application Screening Fit Is Required in MVP

**Status:** APPROVED

### Decision

Advisory AI Application Screening Fit is a required MVP capability.

This decision supersedes earlier MVP proposals for strict screening or automatic AI rejection.

The AI compares the contributor’s available evidence with task requirements and produces an explainable fit analysis.

### Required output

- Overall fit category or score range.
- Matching skills and evidence.
- Missing requirements.
- Uncertain requirements.
- Confidence.
- Explanation.
- Evidence citations.
- Clear warning that the owner makes the final decision.

### Application rule

Every otherwise valid application reaches the project owner.

AI may:

- Summarize fit.
- Highlight risks.
- Recommend further review.

AI must not:

- Hide an application.
- Automatically reject an applicant.
- Permanently block an applicant.
- Change application state without NestJS business rules.

---

## AI-003 — Strict or Automatic AI Rejection Is Deferred

**Status:** DEFERRED

### Decision

Strict AI screening and automatic AI rejection are outside the MVP.

They may be reconsidered only after the platform has:

- Measured false positives and false negatives.
- A contributor dispute workflow.
- Owner override.
- Complete audit history.
- A meaningful evaluation dataset.
- Evidence that owners actually need strict screening.

---

## DM-001 — Definition of a ShareK-Verified Contribution

**Status:** APPROVED

### Decision

A ShareK contribution is verified only when all of the following exist:

1. A real ShareK project.
2. A defined task.
3. An accepted contributor assignment.
4. Versioned evidence submitted by that contributor.
5. An owner verdict approving the evidence.
6. No unresolved evidence or fraud dispute.
7. An immutable reputation event.

### Non-qualifying activity

The following are not verified contributions by themselves:

- Project membership.
- Chat activity.
- Discussion activity.
- AI-generated claims.
- Self-declared project experience.
- An external project approved by an admin.

### Approved public evidence labels

These labels describe different evidence sources and verification outcomes; they are not one linear enum. More than one label may apply to a ShareK contribution where the labels explain different facts.

#### `SELF_DECLARED_PROJECT`

An external project claim has been provided by the contributor but has not been approved through the admin-review workflow. It may appear subject to visibility rules, but it is not a verified contribution and must not create verified reputation.

#### `ADMIN_REVIEWED_EXTERNAL_PROJECT`

An external project claim was reviewed and approved by an admin according to platform policy.

This is a valid professional-profile trust signal, but it is not equivalent to a completed ShareK contribution or repository-backed evidence.

#### `SHAREK_CONTRIBUTION_VERIFIED`

The contribution satisfied all seven ShareK verification conditions above. Its public evidence must also explain whether it is repository-backed or owner-attested.

#### `REPOSITORY_BACKED_CONTRIBUTION`

Evidence is linked to authoritative repository activity, such as:

- Pull request.
- Commit range.
- Issue.
- Code review.

#### `OWNER_ATTESTED_CONTRIBUTION`

Evidence is not repository-backed but is approved by the ShareK project owner, such as:

- Design.
- Documentation.
- Deployment.
- Research.
- Demo.
- Project setup.
- Other non-code work.

### Public display rule

The public profile must show the verification tier and evidence source clearly.

---

## DM-002 — External Project Evidence Submission and Admin Review

**Status:** APPROVED

### Decision

A contributor may submit an external project to strengthen their public professional profile.

This workflow verifies that submitted evidence was reviewed according to platform policy. It does not prove legal identity, sole project ownership, or authorship of every part of the project.

### Required project fields

- `title`
- `description`
- `images` or screenshots
- `demo_link` — optional
- `github_url` — optional
- `technologies`
- `claimed_role`
- `contribution_description`
- `project_start_date` — optional
- `project_end_date` or period — optional
- `supporting_files` — optional
- `supporting_urls` — optional
- `visibility`
- `submission_status`
- `admin_review_result`
- `admin_review_notes`
- `submitted_at`
- `reviewed_at`
- `reviewed_by`

### Submission statuses

- `DRAFT`
- `PENDING_REVIEW`
- `CHANGES_REQUESTED`
- `APPROVED`
- `REJECTED`
- `WITHDRAWN`
- `FLAGGED`

### Workflow

1. Contributor creates an external project submission.
2. The contributor may save it as `DRAFT`.
3. The contributor submits it for review.
4. Status becomes `PENDING_REVIEW`.
5. The contributor may edit or withdraw it before active review begins.
6. Admin reviews the project and evidence.
7. Admin may approve, reject, request changes, or flag it.
8. Approved projects appear on the public profile when their visibility setting permits, with the `ADMIN_REVIEWED_EXTERNAL_PROJECT` label.
9. Rejected projects do not affect public reputation.
10. Suspicious submissions may enter moderation.
11. Every action must be auditable.

### Admin review rules

Admin approval means:

- The supplied evidence was inspected.
- The claim met the platform’s external-project review policy.
- The project can appear as `ADMIN_REVIEWED_EXTERNAL_PROJECT`.

Admin approval does not mean:

- The contributor built the entire project alone.
- Every claimed technology is automatically a verified skill.
- The GitHub repository belongs to the contributor.
- The contributor’s legal identity is verified.
- The project is equivalent to a ShareK contribution reviewed by a project owner.

### Skill evidence mapping

An approved external project may support skill evidence only when a clear mapping exists between:

- The claimed skill.
- The contributor’s claimed role.
- The submitted evidence.
- The admin-reviewed project.

Technologies listed in the project must not automatically become verified skills.

### Required separation of concerns

The data model must keep these four dimensions independent:

1. Evidence source.
2. Review status.
3. Verification tier.
4. Skill claims mapped to the evidence.

No status transition may silently overwrite one dimension with another.

---

## DM-003 — Contributor Profile Trust Signals

**Status:** APPROVED

### Decision

A contributor profile may contain multiple independent trust signals.

Do not use one ambiguous `verified = true` field.

### Trust signals

- `UNVERIFIED_PROFILE`
- `GITHUB_CONNECTED`
- `AI_SKILL_PROFILE_GENERATED`
- `ADMIN_REVIEWED_PORTFOLIO`
- `SHAREK_CONTRIBUTION_VERIFIED`
- `HIGH_TRUST_PROFILE` — post-MVP unless separately approved

### Rules

- A profile may hold several trust signals simultaneously.
- Each badge or label must explain why it exists.
- A user may participate while unverified.
- Admin review is not mandatory before applying or contributing.
- Admin-reviewed external projects and ShareK-verified contributions remain separate.
- Fraud reports may suspend or remove a trust signal.
- Historical audit records must not be silently deleted.
- A contributor is not globally “verified” merely because one external project was approved.

---

## DM-004 — Skill Evidence and Human Review Are Separate Dimensions

**Status:** APPROVED

### Decision

A skill record must separate:

1. How the skill was inferred or demonstrated.
2. Whether a human reviewed the evidence.

### Evidence types

- `SELF_DECLARED`
- `AI_INFERRED`
- `CONTRIBUTION_DEMONSTRATED`
- `EXTERNAL_PROJECT_EVIDENCE`
- `REPOSITORY_EVIDENCE`

### Review statuses

- `UNREVIEWED`
- `ADMIN_REVIEWED`
- `OWNER_REVIEWED`
- `DISPUTED`
- `REJECTED`

### Example

A skill may be:

- Evidence type: `EXTERNAL_PROJECT_EVIDENCE`
- Review status: `ADMIN_REVIEWED`

`ADMIN_REVIEWED` is not itself an evidence source.

---

## SEC-001 — Repository Ownership and Maintainer Authorization

**Status:** APPROVED

### Decision

A GitHub repository may be linked as the official project repository only when the authenticated GitHub user has sufficient repository permission.

### Accepted permission levels for MVP

- `admin`
- `maintain`
- `push`

NestJS verifies repository permission through GitHub after OAuth.

### Failure behavior

When authorization cannot be proven:

- The repository cannot be linked as the official repository.
- The user may still create a ShareK project without a repository.
- The user may include a GitHub URL in an external-project evidence submission, but it must not be presented as an officially owned ShareK project repository.
- The user may not claim official maintainer status without authorization.

### Repository created later

A repository-free project may link an authorized repository later through the same verification workflow.

---

## DM-005 — One Primary Contributor Assignment per Task in MVP

**Status:** APPROVED

### Decision

A project may contain many contributors.

For MVP, each task has one primary accepted contributor assignment.

Different tasks may be assigned to different contributors.

### Reason

This keeps the following unambiguous:

- Evidence ownership.
- Deadline responsibility.
- Delivery verdict.
- Review eligibility.
- Reputation attribution.

### Post-MVP

Collaborative tasks and multiple independent assignments may be added later using explicit per-contributor assignments and individual evidence.

---

## SEC-002 — Email Verification Without Fixed Product Roles

**Status:** APPROVED

### Decision

Owner and contributor are not fixed registration roles.

A user becomes:

- An owner by publishing or managing a project.
- A contributor by applying to or joining a project.

### Email verification

For email/password registration:

- Email verification is required before publishing projects, applying to tasks, or accessing private collaboration.

For GitHub OAuth:

- A verified email returned by GitHub may satisfy email verification.
- If GitHub does not provide a usable verified email, ShareK requests and verifies one separately.

Email verification does not assign a product role.

---

## API-001 — Public Profile API Route

**Status:** APPROVED

### Public route

`GET /api/v1/profiles/:username`

### Authenticated routes

- `GET /api/v1/me/profile`
- `PATCH /api/v1/me/profile`

### Rules

- Public profiles use stable unique usernames.
- Internal UUIDs are not required in public URLs.
- Private fields must never appear in the public response.
- Trust labels, external projects, reputation, and evidence follow visibility rules.

---

## PD-002 — Blind Review Window and Rating Rules

**Status:** APPROVED

### Review window

The review window lasts 14 days after contribution approval or formal collaboration closure.

### Publication

Reviews remain hidden until:

- Both eligible parties submit, or
- The 14-day window expires.

At expiry:

- Submitted reviews become visible.
- Missing reviews do not automatically reduce reputation.
- Non-response may be recorded as an operational metric.

### Rating scale

Ratings use integer values from 1 to 5.

Ratings of 1 or 5 require a written explanation.

### Contributor dimensions

- Delivery quality.
- Reliability.
- Communication.
- Collaboration.

### Owner dimensions

- Requirement clarity.
- Responsiveness.
- Fairness.
- Review quality.

Keep the MVP review form small and testable.

---

## DM-006 — Allowed External and Contribution Evidence Types

**Status:** APPROVED

### Evidence types

- `PULL_REQUEST`
- `COMMIT_RANGE`
- `ISSUE`
- `DOCUMENT`
- `DESIGN`
- `DEPLOYMENT`
- `DEMO_VIDEO`
- `IMAGE`
- `FILE`
- `URL`
- `GITHUB_REPOSITORY`
- `OTHER`

### Rules

Repository evidence may support `REPOSITORY_BACKED_CONTRIBUTION`.

Non-repository evidence approved by a ShareK project owner may support `OWNER_ATTESTED_CONTRIBUTION`.

Evidence submitted as an external project and approved by an admin may support `ADMIN_REVIEWED_EXTERNAL_PROJECT`.

External evidence does not require admin review unless it is submitted through the external-project verification workflow, disputed, reported, suspicious, or used to request an elevated trust badge.

Every evidence item must include:

- Contributor.
- Related task assignment or external-project submission.
- Evidence type.
- Version.
- URL or file reference.
- Description of individual work.
- Submission time.
- Review status.
- Reviewer.
- Audit history.

---

## PD-003 — Minimum Deliverable Scope for 2026-08-30

**Status:** APPROVED

### Required release scope

The required release must demonstrate one complete evidence and reputation loop with MVP AI capabilities:

1. Register and verify account.
2. Create public profile.
3. Connect GitHub.
4. Generate an evidence-backed AI skill profile.
5. Allow the contributor to review and dispute AI inferences.
6. Publish a project.
7. Optionally link an authorized GitHub repository.
8. Create one task.
9. Contributor applies.
10. Generate advisory AI application-fit analysis.
11. Send the valid application to the owner.
12. Owner accepts or rejects.
13. Accepted contributor receives an assignment.
14. Contributor submits versioned individual evidence.
15. Owner approves, rejects, or requests changes.
16. Approved contribution creates an immutable reputation event.
17. Public profile shows approved contribution evidence and its verification tier.
18. Owner provides a contributor rating.
19. Contributor may submit an external project for admin review.
20. Approved external projects appear with the correct `ADMIN_REVIEWED_EXTERNAL_PROJECT` label.

### Required supporting capabilities

- Authorization.
- State validation.
- Basic notifications.
- Admin external-project review.
- AI inference audit data.
- Evidence and review audit history.
- Essential tests.
- Seeded demonstration data.
- Stable local setup.

### Secondary scope after the required loop works

- Blind bilateral reviews.
- Project discussion.
- Minimal real-time chat.
- GitHub synchronization beyond initial analysis.
- Beginner recommendation feed.
- First-contribution checklist.
- AI project assistant.
- AI commit summaries.

### Deferred

- Strict AI rejection.
- Multi-agent orchestration unless the ITI checklist makes it mandatory.
- Real payments.
- Subscriptions.
- Organizations.
- Team hiring.
- Advanced Kanban.
- Multimodal portfolio analysis.
- Speech-to-text.
- MCP.
- Advanced semantic matching.

### Release principle

The manual trust loop, AI skill inference, and advisory application fit must work end to end.

Advanced AI decoration must not replace a functioning contribution and reputation system.

---

## DX-001 — Delivery Capacity

**Status:** OPEN

The following must be filled with real team information:

- Actual active developers.
- Frontend developers.
- Backend developers.
- AI developers.
- Available working days per week.
- Average hours per developer per day.
- Final submission date.
- Current implementation status by module.

Until this information is supplied, detailed sprint estimates remain provisional.

---

## OQ-001 — External Evidence File Handling

**Status:** OPEN

External-project submissions must support images, screenshots, and optional supporting files or URLs under DM-002. The approved decisions do not yet select the upload transport, storage provider, size/type limits, retention policy, malware scanning, or removal process.

No documentation may infer an object-storage implementation until this question is resolved. This does not remove the approved product requirement to support the evidence fields.

---

## Required Follow-Up

After recording these decisions:

1. Search all active documentation for conflicting decisions.
2. Mark older conflicting decisions as superseded.
3. Keep archived history unchanged.
4. Do not rewrite the full documentation yet.
5. Prepare a separate decision-log commit only when explicitly requested; do not combine it with consolidation work.
