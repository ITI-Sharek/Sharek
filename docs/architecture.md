# ShareK Architecture and Domain Model

**Status:** PROPOSED
**Decision authority:** `decision-log.md`
**Scope:** Target architecture and domain model, with current implementation
facts explicitly labelled

## 1. System context

```text
Browser / TanStack Start
          |
          v
NestJS modular monolith
  |       |        |
  v       v        v
PostgreSQL GitHub  Redis/BullMQ
  |
  +------ bounded authenticated calls ------> FastAPI AI service
```

NestJS is the authoritative backend. It owns authentication, authorization,
business rules, persistence, queues, final state transitions, public APIs, audit
records, and reputation events. FastAPI performs bounded analysis for AI Skill
Inference and advisory Application Screening Fit. It cannot accept or reject an
application, approve evidence, change membership, publish a review, moderate a
user, or create a final reputation event.

## 2. Technology decisions

| Concern | Target | Current evidence |
|---|---|---|
| Frontend | TanStack Start, React 19, TypeScript | Scaffold dependencies exist; no real test runner or feature surface |
| Core backend | NestJS 11 feature-first modular monolith | Implemented foundation and several working modules |
| Persistence | PostgreSQL with Prisma 6 | Implemented; ten migration directories exist |
| Jobs | Redis and BullMQ | Implemented for skill-profile generation |
| AI analysis | Bounded FastAPI service called by NestJS | Skill-profile client exists; application-fit workflow does not |
| GitHub | OAuth and API integration | Implemented, with excessive contributor `repo` scope |
| Realtime | No required WebSocket infrastructure in MVP | None present |
| Evidence files | Images, URLs, and optional files | Approved target; storage/scanning design is open |
| Vector search | Not required unless external checklist classification demands it | No current pgvector schema |

The backend uses standard controllers, services, DTOs, Prisma, integration
clients, and jobs. A one-implementation port/use-case layer is not required.
Cross-module access uses exported NestJS services or completed-fact events.

## 3. Current implementation map

This table describes repository evidence, not product completion:

| Module | Current status | Evidence |
|---|---|---|
| `identity` | IN DEVELOPMENT | Substantial auth/session/social/email code; fixed product role remains a gap |
| `github` | IN DEVELOPMENT | OAuth and repository/evidence services; least-privilege gap remains |
| `projects` | IN DEVELOPMENT | Controller, service, DTOs, tests; repository-free target is not established |
| `contributor-profiles` | IN DEVELOPMENT | Controller/service/tests; public route is still guarded |
| `skill-profiles` | IN DEVELOPMENT | Generation service, worker/client integration, tests |
| `ai` | IN DEVELOPMENT | NestJS AI facade and FastAPI skill client exist |
| `reputation` | IN DEVELOPMENT | Service exists; approved event model is incomplete |
| `contribution-tasks` | PROPOSED | Module and README only |
| `applications` | PROPOSED | Module and README only |
| `delivery-reviews` | PROPOSED | Module and README only |
| `admin` | PROPOSED | Module and README only |
| `reviews` | PROPOSED | No module |
| `notifications` | PROPOSED | No module |
| `health` | IMPLEMENTED | Health controller and module |

The detailed, refreshable evidence inventory belongs in
`audits/codebase-gap-report.md`.

## 4. Module boundaries

1. A business capability has one owning module.
2. A module writes only its own tables.
3. Controllers bind HTTP and delegate; they do not contain persistence or
   external-client workflows.
4. Services own authorization, deterministic validation, workflow, and final
   decisions.
5. Cross-module synchronous calls use exported services.
6. Events describe completed facts; listeners update only their own state.
7. `shared/` contains technical cross-cutting concerns, not business workflows.
8. Optional folders are created only for real implementation.

Recommended ownership:

| Context | NestJS owner |
|---|---|
| Accounts, sessions, email verification, admin role | `identity` |
| GitHub connection and authoritative code evidence | `github` |
| Projects and repository connection | `projects` |
| Tasks and assignments | `contribution-tasks` |
| Applications and owner decisions | `applications` |
| Public profile projection | `contributor-profiles` |
| Skill claims and evidence mapping | `skill-profiles` |
| Delivery evidence and owner review | `delivery-reviews` |
| Blind bilateral review | `reviews` or a clearly isolated delivery subdomain |
| Reputation event aggregation | `reputation` |
| External-project review, flags, moderation | `admin` |
| AI orchestration and FastAPI clients | `ai` |
| Notification delivery | `notifications` |

## 5. AI boundary and failure behavior

```text
owning NestJS service
  -> authorization and deterministic checks
  -> enqueue analysis job
  -> NestJS AI facade
  -> authenticated FastAPI call
  -> validate structured response
  -> persist evidence, confidence, uncertainty, model/prompt version
  -> owning module presents advisory output
```

- AI output never directly mutates final business state.
- A timeout, unavailable service, malformed response, or low confidence does not
  block an application or participation.
- Repository text and diffs are untrusted data, never executable instructions.
- The AI service receives only data permitted for the feature; MVP inference is
  limited to accessible public GitHub evidence.
- Audit records avoid raw secrets and unnecessary personal data.
- Re-analysis preserves prior output, model/prompt version, evidence snapshot,
  and dispute history.

Target jobs include:

- `skill-profile-generation`
- `application-fit-analysis`
- `pr-validation`
- `delivery-review-expiry`
- `notification-dispatch`

Only skill-profile generation has repository evidence of a current durable job.

## 6. GitHub and repository authority

- A connected repository requires verified `admin`, `maintain`, or `push`
  permission for the account attaching it to a project.
- A public repository URL establishes evidence location, not ownership.
- A project may be created with `repositoryConnection = NONE` and connected
  later.
- GitHub owns repository ID, canonical URL, visibility, pull-request state,
  merge metadata, commits, and observed permission.
- Cached GitHub facts include source ID, canonical URL, sync time, and sync
  status; the UI must not present stale data as live.
- The current contributor OAuth scope `read:user user:email repo` exposes private
  access and write capability. It is a security gap. The target must use a
  least-privilege public-evidence mechanism.

## 7. Domain glossary

| Term | Definition |
|---|---|
| Account | Authentication identity and account-level administration state |
| Contextual capability | Permission derived from a relationship to a project/task, not a fixed user role |
| Project | Owner-published collaboration container, optionally connected to a repository |
| Contribution task | Scoped unit of requested work with requirements and evidence expectations |
| Application | Contributor request to perform one task |
| Assignment | Owner acceptance binding one primary contributor to a task |
| Evidence item | Attributable URL, repository fact, image, file, demo, document, or attestation |
| Evidence submission | Versioned collection of evidence items for a task delivery or external project |
| Verification tier | Strength of the platform’s support for a claim |
| Review status | Human/admin assessment state, independent of evidence source |
| Skill claim | A normalized skill supported by zero or more mapped evidence records |
| AI output | Advisory, versioned analysis with confidence, uncertainty, and citations |
| Trust signal | Source-explained profile indicator; several may coexist |
| Reputation event | Immutable input to a derived reputation projection |
| Flag | Auditable integrity or safety concern about a specific subject |

## 8. Bounded contexts

### Identity and access

Owns accounts, credentials, sessions, social connections, email verification,
and the account-level `ADMIN` role. It does not store owner/contributor/applicant
as permanent identities.

### Project and task management

Owns projects, repository connections, tasks, task status, and primary
assignments. Repository-free projects are first-class.

### Application and assignment

Owns applications, advisory fit results, owner decisions, and the accepted
assignment. It grants only scoped, status-sensitive capabilities.

### Evidence and delivery

Owns versioned delivery submissions, evidence items, GitHub validation snapshots,
owner review, review deadlines, and accepted outcomes.

### Profile, skills, and external projects

Owns public profile projection, external-project submissions, skill claims,
evidence mappings, review status, verification tier, and trust signals.

### Reviews and reputation

Owns blind review windows, review publication, immutable reputation events, and
derived public summaries.

### AI analysis

Owns AI requests and auditable outputs. It does not own the business subject it
analyzes.

### Administration and integrity

Owns external-project review actions, flags, moderation outcomes, and audit
visibility. It cannot rewrite GitHub facts or collapse evidence tiers.

## 9. Entities and relationships

### Core entities

- `User`: account identity, email-verification facts, admin status, suspension
  state, and public-profile link.
- `AuthSession`: refresh-session lifecycle and revocation.
- `GitHubAccount`: connected GitHub identity, encrypted token metadata, scopes,
  and last synchronization.
- `ContributorProfile`: public biography, visibility, and derived projections.
- `Project`: owner, descriptive fields, publication state, optional repository
  connection, and dates.
- `RepositoryConnection`: GitHub repository ID, permission snapshot, connection
  status, and sync metadata.
- `ContributionTask`: project, requirements, expected evidence, status, and
  capacity fixed to one primary assignment in MVP.
- `Application`: task, applicant, statement, status, timestamps, and optional
  advisory AI output.
- `Assignment`: accepted application, primary contributor, start/end state, and
  audit history.
- `EvidenceSubmission`: versioned delivery attempt or external-project claim.
- `EvidenceItem`: typed evidence, contributor attribution, source metadata,
  visibility, validation snapshot, and audit data.
- `DeliveryReview`: owner assessment of one evidence-submission version.
- `BlindReviewWindow`: participant pair, deadline, submission/publication facts.
- `Review`: reviewer, subject, dimensions, rationale, submitted/published times.
- `ExternalProjectSubmission`: contributor claim, project metadata, status,
  review-start marker, and audit timestamps.
- `ExternalProjectReviewAction`: admin actor, action, notes, and timestamp.
- `SkillClaim`: normalized skill displayed on a profile.
- `SkillEvidence`: mapping from skill claim to evidence source, confidence,
  review status, and verification tier.
- `AiOutput`: subject, type, structured result, evidence references, confidence,
  uncertainty, prompt/model versions, and timestamps.
- `TrustSignal`: type, source subject, active/suspended state, reason, and audit
  history.
- `ReputationEvent`: immutable event type, subject, source, dimensions, weight,
  and invalidation link.
- `Flag`: reporter, subject type/id, reason, status, resolution, and audit data.

### Principal relationships

```text
User 1---* Project (owner)
Project 1---* ContributionTask
Project 0---1 RepositoryConnection
ContributionTask 1---* Application
Application 0---1 Assignment
Assignment 1---* EvidenceSubmission
EvidenceSubmission 1---* EvidenceItem
EvidenceSubmission 0---* DeliveryReview
User 1---* ExternalProjectSubmission
ExternalProjectSubmission 1---* ExternalProjectReviewAction
ContributorProfile 1---* SkillClaim
SkillClaim 1---* SkillEvidence
SkillEvidence *---1 EvidenceItem or ExternalProjectSubmission or AiOutput
BlindReviewWindow 1---0..2 Review
Review/DeliveryReview/Evidence 1---* ReputationEvent
ContributorProfile 1---* TrustSignal
Any auditable subject 1---* Flag
```

## 10. State machines

### Project

```text
DRAFT -> PUBLISHED -> CLOSED
  |          |
  +-> ARCHIVED <-+
```

Repository connection is independent: `NONE -> PENDING_VERIFICATION -> CONNECTED
-> DISCONNECTED`. A project can publish while the connection is `NONE`.

### Contribution task

```text
DRAFT -> OPEN -> ASSIGNED -> IN_PROGRESS -> SUBMITTED -> COMPLETED
             \-> CANCELLED      \-> CANCELLED      \-> CHANGES_REQUESTED
```

Exact storage names may change during implementation, but a task cannot acquire
two active primary assignments in MVP.

### Application

```text
SUBMITTED -> UNDER_REVIEW -> ACCEPTED
     |             |        -> WITHDRAWN only before assignment work begins
     +-> WITHDRAWN +-> REJECTED
     +-> EXPIRED
```

Only `SUBMITTED` and `UNDER_REVIEW` confer applicant access. `ACCEPTED` transfers
access to the assignment/contributor capability. `REJECTED`, `WITHDRAWN`, and
`EXPIRED` confer none.

### External-project submission

```text
DRAFT -> PENDING_REVIEW -> APPROVED
  |             |-------> REJECTED
  |             |-------> CHANGES_REQUESTED -> PENDING_REVIEW
  |             |-------> FLAGGED
  +-> WITHDRAWN          FLAGGED -> APPROVED | REJECTED | CHANGES_REQUESTED
```

“Review begins” is represented by an auditable timestamp/action rather than an
extra status unless the open decision approves one. Edits create a new evidence
version; prior reviewed material is retained.

### Delivery evidence

```text
DRAFT -> SUBMITTED -> APPROVED
             |------> CHANGES_REQUESTED -> SUBMITTED (new version)
             |------> REJECTED
             +------> UNREVIEWED (14-day owner silence)
```

Pull-request source facts are independent from delivery outcome. The unresolved
closed-without-merge attestation rule remains `OPEN`; implementation must not
invent a transition.

### Blind review

```text
OPEN
  -> BOTH_SUBMITTED -> PUBLISHED_IMMEDIATELY
  -> DEADLINE_EXPIRED + one submitted -> submitted review PUBLISHED
  -> DEADLINE_EXPIRED + none submitted -> CLOSED_EMPTY
```

### Flag

```text
OPEN -> UNDER_REVIEW -> RESOLVED | DISMISSED
```

Flag resolution may suspend a public trust signal or invalidate a reputation
event without deleting history.

## 11. Permissions

| Capability | Derivation | Scope |
|---|---|---|
| Public viewer | None | Published public data only |
| Owner | `Project.ownerId` or verified maintainer authority | One project and its tasks |
| Applicant | Active application (`SUBMITTED`, `UNDER_REVIEW`) | Relevant task/project only |
| Contributor | Active accepted assignment | Relevant task/project workspace |
| Profile subject | Profile ownership | Own profile, claims, disputes |
| Admin | Account-level role | Review/moderation actions, not GitHub fact rewriting |

Email verification is required for publishing, applying, and private workspace
access. Profile trust and admin-reviewed portfolio status never grant additional
business authority.

## 12. Evidence dimensions

The model never stores “verified” as one overloaded fact.

### Evidence source

Examples: `SELF_DECLARED`, `AI_INFERRED`, `EXTERNAL_PROJECT`, `SHAREK_DELIVERY`,
`GITHUB_REPOSITORY`, `OWNER_ATTESTATION`.

### Review status

Examples: `UNREVIEWED`, `PENDING_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`,
`REJECTED`, `FLAGGED`, `DISPUTED` as applicable to the subject.

### Verification tier / public label

- `SELF_DECLARED_PROJECT`
- `ADMIN_REVIEWED_EXTERNAL_PROJECT`
- `SHAREK_CONTRIBUTION_VERIFIED`
- `REPOSITORY_BACKED_CONTRIBUTION`
- `OWNER_ATTESTED_CONTRIBUTION`

### Skill mapping

A skill claim maps to specific evidence records. Admin approval of an external
project does not automatically approve every claimed technology. AI evidence
retains `AI_INFERRED` even if a human separately reviews it.

## 13. Reputation events

Reputation is derived from immutable events rather than directly edited totals.
Minimum event families:

- `CONTRIBUTION_ACCEPTED`
- `BLIND_REVIEW_PUBLISHED`
- `OWNER_REVIEW_PUBLISHED`
- `EVIDENCE_INVALIDATED`
- `REVIEW_INVALIDATED`
- `OWNER_ABANDONMENT_RECORDED`
- `TRUST_SIGNAL_SUSPENDED`

Each event records source subject, actor where applicable, dimensions, timestamp,
policy/version, and invalidation relationship. Recalculation ignores invalidated
events but retains them for audit. Public projections include sample size and
source explanation. Exact weighting and fraud thresholds remain open.

## 14. Domain invariants

1. No task has more than one active primary assignment in MVP.
2. No terminal application grants applicant access.
3. No AI output is a final business decision.
4. No external-project approval proves legal identity, total ownership, or a
   ShareK/repository-backed contribution.
5. No technology becomes a reviewed skill without an explicit evidence mapping.
6. No owner attestation changes a GitHub merge/close fact.
7. No repository is attached as owner-controlled without verified permission.
8. No reputation projection exists without traceable source events.
9. No invalidation deletes its historical event or review action.
10. No review becomes visible before both submit or the deadline expires.
11. No profile trust state is compressed into a global verified flag.
12. No absence of AI evidence is interpreted as evidence of absence.
13. No private GitHub data is made public by inference or evidence display.
14. No repository content is executed during AI analysis.

## 15. Reliability, security, and observability

- Queue jobs are idempotent and use bounded retry/dead-letter behavior.
- External integrations time out and degrade without corrupting business state.
- Authentication, AI generation, uploads, disputes, and moderation are rate
  limited.
- Tokens and secrets are encrypted or stored through the platform secret model,
  never logged.
- File evidence requires an approved storage/scanning/retention design before
  implementation.
- Sensitive actions produce audit records with actor, subject, old/new state,
  reason, and timestamp.
- AI calls record correlation ID, feature, timing, outcome, evidence count,
  confidence, model version, and prompt version without leaking raw secrets.

## 16. Known migration gaps

- Current `User.role` stores fixed owner/contributor/admin values.
- Current `User.status` combines lifecycle/email-verification representation;
  target persistence must preserve SEC-002 without an admin participation gate.
- Current contributor GitHub OAuth uses broad `repo` scope.
- Current public profile controller is authenticated.
- Current schema contains subscription and binary AI-validation shapes that are
  outside target scope.
- External-project submissions, evidence separation, assignments, blind review,
  and complete reputation events are not represented in the target form.
- Projects/tasks/applications/delivery/admin have major implementation gaps.

These are implementation gaps, not permission for schema or code changes during
documentation consolidation.
