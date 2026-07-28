# Sprint 4 Backend — Contribution Workflows

## Problem Statement

Share-k cannot yet run its core collaboration workflow end to end. Projects can
be published, but the backend modules that should own Contribution Requests and
Applications are still placeholders. The persisted Application model also
contains the superseded AI eligibility-gate states, while the accepted product
contract requires every otherwise-valid Application to reach the Project owner
immediately.

Project owners need a reliable way to publish independently assignable work,
review every Application, optionally request evidence-backed Advisory Fit
Assessments, and make explicit human decisions. Contributors also need a
private, attributed way to propose new Project work without gaining an
Assignment or selection advantage.

The final Sprint 4 stretch outcome adds safe Materials and owner-initiated AI
Draft Suggestions. It must not weaken or delay the core collaboration workflow.

## Solution

Build the backend-owned Sprint 4 workflow around canonical Contribution
Requests, Applications, Owner Decisions, Assignments, Advisory Fit Assessments,
and Contribution Proposals.

The NestJS backend owns authorization, state transitions, deterministic policy,
transactions, audit records, and all final business decisions. FastAPI may
return structured evidence analysis, but it cannot hide, rank, accept, decline,
or otherwise transition an Application.

Implement the safe Materials and AI-assisted drafting capability only after the
complete core workflow passes its release gate. Upload, sharing, AI
authorization, analysis, and suggestion adoption remain separate actions.

## User Stories

1. As a Project owner, I want to create a draft Contribution Request for one of my published Projects, so that I can define independently assignable work.
2. As a Project owner, I want to record a title and description, so that contributors understand the requested outcome.
3. As a Project owner, I want to classify Requirements as Required or Preferred, so that essential capabilities are distinct from helpful ones.
4. As a Project owner, I want to add technology tags without substituting them for Requirements, so that discovery metadata does not replace the work contract.
5. As a Project owner, I want to set an Applications Close Time separately from an optional Target Completion Date, so that selection and delivery expectations are not confused.
6. As a Project owner, I want to edit or discard an unpublished draft, so that incomplete work is never publicly actionable.
7. As a Project owner, I want publication to be explicit and entitlement-checked, so that request limits remain enforceable.
8. As a Project owner, I want to cancel a published Contribution Request without deleting history, so that prior Applications and decisions remain auditable.
9. As a contributor, I want to discover published Contribution Requests that still accept Applications, so that I can find open collaboration work.
10. As a contributor, I want to inspect Required and Preferred Requirements before applying, so that I can make an informed choice.
11. As a contributor, I want to submit one Application with a Contribution Approach and Proposed Delivery Duration, so that the owner can consider my plan.
12. As a contributor, I want my otherwise-valid Application to enter owner review immediately, so that an AI result never blocks my visibility.
13. As a contributor, I want duplicate, closed, cancelled, terminal, and unauthorized submissions to fail with explicit non-AI errors, so that rejection reasons are predictable.
14. As a contributor, I want to withdraw before an Owner Decision, so that I control whether I remain under consideration.
15. As a Project owner, I want every pending Application in one queue, so that no candidate is hidden by an assessment.
16. As a Project owner, I want to accept an Application without requesting an assessment, so that selection remains a human choice.
17. As a Project owner, I want acceptance to create one immutable Assignment, so that the selected contributor and agreed duration are fixed.
18. As a Project owner, I want sibling pending Applications to become `NOT_SELECTED`, so that closure is clear without implying rejection or poor capability.
19. As a Project owner, I want to decline an Application explicitly, so that `DECLINED_BY_OWNER` is distinguishable from `NOT_SELECTED`.
20. As a contributor, I want an Owner Decision to affect only the current Application, so that it does not change my profile, eligibility, reputation, or other Applications.
21. As a contributor, I want abusive decision feedback to be reportable without reopening the Application, so that moderation and workflow state remain separate.
22. As a Project owner, I want an owner-review reminder and expiry policy, so that unattended Applications do not remain pending forever.
23. As a contributor, I want expiry to be decision-neutral, so that owner silence does not harm my reputation.
24. As a Project owner, I want to request an Advisory Fit Assessment for a pending Application, so that I can inspect evidence against each Requirement.
25. As a Project owner, I want the assessment to use fixed Requirement and Evidence Snapshots, so that later edits do not silently change its basis.
26. As a Project owner, I want one finding per Requirement with citations, confidence, uncertainty, and explanation, so that I can understand the evidence.
27. As a Project owner, I want NestJS to derive the Fit Band deterministically, so that a model never supplies the overall result.
28. As a Project owner, I want to see no-assessable-evidence, system-limit, cancelled, unavailable, and inconclusive states, so that technical conditions are not presented as contributor judgments.
29. As a Project owner, I want to decide while assessment work is pending or unavailable, so that AI is never a prerequisite.
30. As an auditor, I want immutable Assessment Attempts and first-presentation records, so that retries and user-visible use are traceable.
31. As a contributor, I want to submit a private Contribution Proposal to an active published Project, so that I can suggest useful new work.
32. As a contributor, I want every submitted Proposal Version and timestamp preserved immutably, so that authorship evidence cannot be silently rewritten.
33. As a contributor, I want to withdraw a pending Proposal, so that I can end consideration before acceptance.
34. As a Project owner, I want to request a revision without editing contributor-authored content, so that suggested changes require contributor confirmation.
35. As a Project owner, I want to accept a Proposal into an attributed draft Contribution Request, so that the idea can enter the normal owner-controlled workflow.
36. As a contributor, I want acceptance to grant attribution but no Assignment or selection priority, so that credit is not confused with entitlement to perform the work.
37. As a Project owner, I want to decline with a contributor-visible reason, so that a terminal response is clear and auditable.
38. As a contributor, I want to report suspected Proposal misuse, so that moderation can inspect preserved evidence without the platform declaring legal ownership or copying.
39. As a Project owner, I want to attach versioned Project and Request Materials under explicit visibility rules, so that collaborators receive authorized context.
40. As a Project owner, I want restricted Material access to be revocable and server-enforced, so that trusted access is explicit rather than inferred from a broad role.
41. As a Project owner, I want uploaded files quarantined until a managed malware scan passes, so that unsafe content is never downloadable.
42. As a Project owner, I want upload to perform no extraction, embedding, or model call, so that storage is not treated as AI consent.
43. As a Project owner with the required entitlement, I want to select exact Material Versions into an Analysis Set and start an Analysis Run, so that AI processing is explicit and reproducible.
44. As a Project owner, I want AI output stored as private Draft Suggestions, so that no Project or Contribution Request changes automatically.
45. As a Project owner, I want to adopt suggestions individually, so that I retain control of every mutation.
46. As a privacy reviewer, I want raw content and embeddings isolated from discovery, matching, training, and Advisory Fit Assessments, so that one consent purpose never leaks into another.
47. As a Project owner, I want deletion to revoke access immediately and purge content asynchronously, so that retention behavior is explicit.

## Implementation Decisions

- The accepted domain language is binding. Backend services, DTOs, audit
  records, and documentation use Contribution Request, Application,
  Contribution Proposal, Advisory Fit Assessment, Owner Decision, Assignment,
  and Material. Existing transport routes using `/tasks` may remain temporarily
  compatible, but must not preserve superseded eligibility semantics.
- The current placeholder contribution-work module becomes the owner of
  Contribution Request lifecycle and Requirement persistence. It requests
  Project ownership and publication facts through the exported Projects
  service and writes only its own records.
- The Applications module owns Application submission, immutable submission
  snapshots, withdrawals, expiry, Owner Decisions, Assignment creation, and
  sibling `NOT_SELECTED` transitions.
- Application submission runs only deterministic authorization and lifecycle
  checks. It creates `PENDING_OWNER_REVIEW` immediately and performs no
  automatic AI call or contributor-attempt quota mutation.
- The persisted Application state model is migrated to
  `PENDING_OWNER_REVIEW`, `ACCEPTED`, `DECLINED_BY_OWNER`, `NOT_SELECTED`,
  `EXPIRED`, `WITHDRAWN`, and `REQUEST_CANCELLED`.
- Forward migration of legacy states must preserve meaning:
  `pending_validation` and `eligible` become `PENDING_OWNER_REVIEW`;
  AI-produced `ineligible` never becomes an owner decline and returns to owner
  review when the parent Request is actionable; terminal parent state controls
  cancellation outcomes. A legacy `rejected` row becomes
  `DECLINED_BY_OWNER` only when an explicit owner action can be proven.
- Required and Preferred Requirements are stored as structured,
  independently snapshotable records. Technology tags remain separate
  discovery metadata.
- Applications Close Time and Target Completion Date are separate fields.
  Proposed Delivery Duration is captured on the Application. Acceptance
  derives the Assignment due date without silently changing the contributor's
  proposal.
- Acceptance is transactional: one Owner Decision and Assignment are created,
  the Contribution Request stops accepting new Applications, and every sibling
  pending Application becomes `NOT_SELECTED`. Concurrent accept commands must
  produce at most one Assignment.
- State-changing commands use idempotency where retries could duplicate
  records. Authorization and state validation run again inside the transaction.
- Audit behavior is append-only without event sourcing. Material commands,
  Proposal responses, Application transitions, assessment attempts, and Owner
  Decisions append immutable audit records while current-state tables remain
  authoritative.
- The Notifications module owns durable user notifications and is called
  through its exported service. It covers submission visibility, reminders,
  expiry, withdrawal, decisions, Proposal responses, and relevant Material
  access changes.
- The review window uses controlled-clock scheduling: owner reminder at day 3,
  overdue presentation at day 5, and terminal expiry at day 7. Jobs are
  idempotent and re-check terminal state before writing.
- The Applications module owns Assessment Request and Attempt persistence. The
  AI module remains the NestJS facade for authenticated FastAPI calls.
- One active Assessment Request per pending Application is allowed unless the
  approved retry policy explicitly creates a linked retry. The request points
  to fixed Requirement and Evidence Snapshots.
- `NOT_STARTED_SYSTEM_LIMIT` creates no provider attempt and is retriable.
  `NOT_STARTED_NO_ASSESSABLE_EVIDENCE` creates no attempt or Fit Band.
  `CANCELLED_NOT_NEEDED` is used when the Application becomes terminal before
  work needs to start. Bounded failed attempts may end as `UNAVAILABLE`.
- FastAPI returns Requirement Findings only. NestJS validates the schema,
  evidence identifiers, citation scope, and complete Requirement coverage,
  then derives the Fit Band according to ADR 0001. Preferred Requirements do
  not affect that band.
- Assessment state and errors never transition, hide, rank, accept, or decline
  an Application and never create an admin eligibility queue.
- The first authorized owner presentation of a completed assessment is
  recorded once. It is not described as a read receipt.
- Contribution Proposals are private to the proposer and Project owner while
  pending. Proposal Versions are immutable and contributor-authored.
- Owner revision requests are append-only responses and cannot mutate a
  Proposal Version. The contributor creates any revised version.
- Proposal acceptance transactionally creates an owner-controlled draft
  Contribution Request with immutable proposer attribution. It creates no
  Assignment, reserved position, Application, quota use, or selection priority.
- Proposal decline and withdrawal are terminal. Decline requires a
  contributor-visible reason. Pending Proposals do not expire automatically.
- Proposal Misuse Reports preserve restricted evidence for moderation but do
  not make automatic similarity, copying, ownership, or legal findings.
- The Materials capability is a final stretch slice. Core request,
  Application, decision, assessment, and Proposal release gates block it.
- Project Materials and Request Materials use immutable Material Versions.
  Public, Restricted Project, and Assignment Material visibility are fixed
  classes rather than arbitrary ACL combinations.
- Restricted Project Material requires an explicit revocable grant to a
  current active Project assignee. Assignment Material is owner-only before
  Assignment and owner-plus-assignee afterward.
- Raw files use private object storage and short-lived server-authorized
  download access. Supported formats and limits are configurable. Files remain
  quarantined until a managed malware scan marks them safe.
- Upload is storage consent only. AI processing requires an explicit,
  entitlement-checked Analysis Set of exact Project Material Versions and an
  owner-started Analysis Run.
- Analysis Runs may use DOCX, Markdown, and text-based PDF content. Images and
  scanned PDFs remain assets only in this sprint.
- Embeddings and retrieval are purpose-isolated to the selected Project and
  Analysis Set. They cannot feed public search, matching, model training, or
  Advisory Fit Assessment.
- AI Draft Suggestions are private and non-authoritative. Adoption is explicit
  and per suggestion; invalid output causes no partial business-state mutation.
- Deletion immediately revokes platform access and future retrieval, then
  asynchronously purges raw content, extracted text, and embeddings while
  retaining non-content audit metadata.
- No public API, database migration, or asynchronous job may weaken existing
  Project authorization, GitHub evidence privacy, or the standard NestJS
  feature-first module boundaries.

## Testing Decisions

- The highest backend seam is the NestJS HTTP contract. Supertest-based tests
  exercise controllers, validation pipes, guards, error serialization, and
  response DTOs while replacing external providers with deterministic fakes.
- State-machine and transaction tests exercise services through observable
  commands and results rather than private methods. They prove authorization,
  legal and illegal transitions, idempotency, concurrency, and emitted audit
  and notification effects.
- Migration tests use representative legacy Application rows and prove that AI
  `ineligible` data never becomes an owner decline, accepted rows remain
  selected, and terminal parent state is preserved.
- Contribution Request tests cover draft, publish, edit, discard, close-time,
  cancel, Requirement classification, Project ownership, and entitlement
  boundaries.
- Application tests cover immediate owner visibility, duplicate submission,
  snapshots, withdrawal, expiry, acceptance races, one Assignment, sibling
  `NOT_SELECTED`, decline, cancellation, and reputation neutrality.
- Advisory Fit contract tests cover authentication, fixed snapshots, complete
  Requirement coverage, citation validation, deterministic Fit Band derivation,
  preferred-Requirement neutrality, bounded attempts, unavailable states, and
  the ability to decide without an assessment.
- Proposal tests cover privacy, immutable versions, revision requests,
  withdrawal, decline reason, acceptance attribution, lack of assignment
  priority, disabled intake, and misuse-report evidence preservation.
- Material authorization tests cover every visibility class, grant and
  revocation, terminal Assignment changes, short-lived access, quarantine,
  limits, versioning, and deletion.
- Material analysis tests prove upload is not AI consent, the Analysis Set is
  version-fixed, retrieval cannot cross Project or purpose boundaries,
  suggestions require adoption, and failure produces no partial mutation.
- Controlled clocks and deterministic queues are used for reminders, expiry,
  retries, purge, and cancellation races.
- Prior art includes the repository's Supertest HTTP contract suites, focused
  service tests with fake database interfaces, strict FastAPI adapter tests,
  GitHub privacy tests, and Prisma migration validation.
- The core release gate runs before any Material analysis work. The final
  stretch gate runs the complete upload-to-private-suggestion-to-adoption flow.

## Out of Scope

- AI eligibility gates, automatic Application validation, AI ranking, AI
  acceptance or decline, contributor application-attempt quotas, and admin
  eligibility review queues.
- Multiple simultaneous assignees for one Contribution Request.
- Proposal ownership adjudication, plagiarism detection, legal infringement
  findings, or automatic similarity scoring.
- Chat, negotiation threads, kanban boards, discussions, or a general project
  management workspace.
- Payment checkout, billing-provider integration, or public plan purchasing.
  Material analysis may use seeded, demo, or admin-assigned entitlement only.
- OCR for scanned PDFs, image understanding, macros, remote document resources,
  executable files, archives, audio, or video.
- Public document search, cross-Project retrieval, model training, or reuse of
  Materials as contributor evidence.
- Shipping a partial Material foundation or embeddings without the complete
  stretch release gate.

## Further Notes

- This specification implements DEC 036 through DEC 039 and ADRs 0001 through
  0005. ADR 0006 controls documentation ownership.
- Historical Application validation entities and old UI-facing states are
  migration inputs, not current product requirements.
- Exact public endpoint naming may preserve the existing `/tasks` transport
  during migration, but public documentation and payload vocabulary must use
  Contribution Request consistently.
- Backend implementation must update module documentation, API contracts,
  database documentation, migration notes, and the module development tracker.
- No production behavior is implemented by this specification issue.
