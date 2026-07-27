<!--
Sync Impact Report
Version change: 3.0.0 -> 3.1.0
Version rationale: MINOR because the GitHub principle now defines the optional,
post-registration profile journey and the explicit consent boundary for skill
analysis while preserving the existing GitHub App private-access rule.
Modified principles:
- IV. GitHub Identity and Repository Access: GitHub repository access is an
  optional profile capability, separate from registration and social identity;
  installation, explicit selection, consent, and an explicit start action are
  required before skill analysis.
Modified sections:
- Delivery Workflow: plans must separate registration, identity linkage,
  repository installation, selection/consent, and analysis triggers.
Added sections: None
Removed sections: None
Templates and guidance synchronized:
- ✅ .specify/templates/plan-template.md
- ✅ .specify/templates/spec-template.md (reviewed; no change required)
- ✅ .specify/templates/tasks-template.md (reviewed; no change required)
- ✅ .specify/templates/checklist-template.md (reviewed; no change required)
- ✅ .specify/templates/constitution-template.md (reviewed; no change required)
- ✅ bmad/_bmad-output/planning-artifacts/prds/prd-Grad_Project-2026-06-17/prd.md
- ✅ bmad/_bmad-output/sharek-backlog.md
- ✅ bmad/_bmad-output/user-stories-and-journeys/sprint-1-foundation-platform-setup.md
- ✅ bmad/_bmad-output/user-stories-and-journeys/sprint-2-onboarding-admin-review-project-publishing.md
- ✅ bmad/_bmad-output/user-stories-and-journeys/sprint-3-skill-profiling-and-discovery.md
- ✅ .specify/templates/commands/*.md (directory not present)
Follow-up TODOs:
- Plan and implement migration from the current broad repository OAuth grant
  to the approved GitHub App installation boundary.
- Preserve optional GitHub social sign-in as identity-only or retire it through
  an explicit compatibility plan; do not reuse it for repository evidence.
-->
# ShareK Backend Constitution

## Core Principles

### I. Source Authority and Traceability

Approved project-wide decisions and accepted, non-superseded ADRs MUST control
legacy PDFs, historical backlogs, stale plans, and informal notes. Every feature
artifact MUST distinguish current implemented behavior, approved target
behavior, assumptions, and unresolved decisions. Specifications, plans, tasks,
and handoffs MUST reference the relevant Jira key, PRD requirement IDs, and
decision or ADR IDs when they exist.

Conflicts MUST be surfaced and reconciled; a lower-authority artifact MUST NOT
silently redefine an approved rule. This keeps implementation traceable to an
explicit decision rather than whichever document was read last.

### II. Account Roles and Contextual Authorization

ShareK has exactly three account-level roles: `OWNER`, `CONTRIBUTOR`, and
`ADMIN`. Public registration MUST require the user to select `OWNER` or
`CONTRIBUTOR`; it MUST reject `ADMIN`. The backend MUST validate and persist the
role. Role changes after registration MUST occur only through an approved,
authenticated workflow; no new role-change path may be inferred from this
constitution.

The selected role controls the account's primary product journey, defaults, and
role-specific actions only where an approved workflow says so; it is not an
exclusive capability silo. Both `OWNER` and `CONTRIBUTOR` accounts MUST be able
to create and own projects and to contribute to projects they do not own without
changing account role. Contribution still requires the same contextual
application and assignment checks for either role. `ADMIN` is privileged and
MUST never be created by public registration.

Account role alone never authorizes a specific resource:

- Project creation MUST require an eligible authenticated `OWNER` or
  `CONTRIBUTOR`, not a role change.
- A project mutation MUST verify the persisted `Project.ownerId` matches the
  authenticated user, unless an explicit Admin path applies.
- A private project workspace MUST require a persisted accepted contributor
  assignment.
- Applicant access MUST require a persisted active application in an allowed
  state.
- Terminal application or assignment states MUST revoke the related access.
- An Admin bypass MUST be explicit, auditable, and covered by authorization
  tests.

Request data such as `userId`, `ownerId`, `role`, or an Admin flag MUST NOT be
accepted as authorization evidence. Identity and privilege come from the
authenticated session and persisted backend relationships.

### III. Standard NestJS Module Ownership

ShareK is a NestJS feature-first modular monolith governed by ADR-002. Features
MUST use standard NestJS controllers, services, DTOs, Prisma, and only the
optional technical folders required by real files. Controllers handle HTTP
binding and delegate; services own authorization, workflow, validation, state
transitions, and final business decisions.

Each business table has one owning module, and only that module may write it.
Cross-module behavior MUST use services exported by the owning NestJS module or
events describing completed facts. A module MUST NOT import another module's
private repositories, integrations, security code, jobs, controllers, mappers,
validators, or utilities. `shared/` MUST remain technical and reusable.

`application/`, `domain/`, `infrastructure/`, and `presentation/` layer folders,
use-case classes, reader ports, and one-implementation abstract repositories
MUST NOT be introduced as architecture ceremony. This rule preserves the
accepted, navigable module shape without weakening ownership.

### IV. GitHub Identity and Repository Access

Registration, email verification, profile access, and unrelated browsing MUST
NOT require GitHub. GitHub repository access is an optional capability started
from the authenticated user's normal profile; it MUST NOT be embedded as a
mandatory registration or single-screen onboarding step. Optional GitHub social
authorization establishes identity only and MUST remain separate from repository
evidence authorization.

Repository evidence access MUST require an active GitHub App installation and
explicit repository selection. Skill analysis MUST NOT begin merely because an
account registered, linked a GitHub identity, or installed the app. It MUST
require the contributor to select repositories, give analysis consent, and
explicitly start generation. Access MUST be read-only, revocable, and
least-privilege; OAuth identity, a repository name supplied by a client, an
unverified installation ID, or historical access MUST NOT authorize a read.

For public-source publication control, OAuth identity MAY prove only that an
authenticated GitHub account matches a personal repository owner; it does not
authorize repository access. Organization or shared repository control MUST
require an active GitHub App installation and explicit repository selection.

Only the `github` module may decrypt provider credentials or write GitHub-owned
tables. Other modules MUST consume typed services and DTOs exported by that
module; provider clients, token/encryption details, installation state, and
GitHub persistence remain private. GitHub-connected and repository-free product
workflows MUST coexist, so GitHub availability cannot become an unrelated
platform prerequisite.

### V. Evidence Privacy and Public Contracts

Evidence handling MUST preserve, where applicable, evidence ID, source,
visibility, permission or selection metadata, freshness, version, provenance,
confidence, uncertainty, and redaction state across persistence, jobs, module
contracts, indexing, and AI calls. Revocation or visibility changes MUST stop
later unauthorized use.

Private repository evidence MUST NOT leak into public projects, public
profiles, public retrieval paths, logs, or AI responses. Public API responses
MUST use explicit DTO allowlists and MUST NOT expose raw Prisma records,
provider objects, credentials, private evidence payloads, or internal
moderation/security metadata. Backend query and service boundaries, not only
frontend filtering, MUST enforce public visibility.

### VI. Advisory, Evidence-Bound AI

AI output is advisory. It MUST NOT automatically accept, reject, hide, rank out,
or eliminate an application. An owning NestJS service MUST validate structured
AI output, apply approved deterministic and human-review policy, make the final
workflow decision, and store the required audit snapshot.

Every AI claim or recommendation MUST remain traceable to evidence permitted
for that consumer. Insufficient, stale, conflicting, or inaccessible evidence
MUST produce explicit uncertainty, retry, manual review, or a safe failure; it
MUST NOT produce invented certainty. Audit data MUST include the applicable
provider/model and contract versions, confidence, evidence IDs, recommendation,
backend outcome, failure reason, and timestamp.

### VII. Explicit State and Forward-Only Persistence

Business workflows MUST use explicit states and validated transitions. Services
MUST reject invalid or unauthorized transitions, and terminal relationship
states MUST revoke capabilities derived from those relationships. Public state
MUST be enforced in backend reads and writes.

Prisma owns schema and migrations. Migrations MUST be forward-only, preserve
existing data, and include a safe repair or rollback-forward strategy for risky
changes; deployed migration history MUST NOT be rewritten. Multi-write business
decisions MUST use transactions when partial persistence would violate an
invariant.

### VIII. Specification-Driven Brownfield Delivery

A specification defines what users need and why. A plan defines the technical
implementation. Tasks MUST be small, dependency-ordered, independently
testable, and traceable to requirements and acceptance scenarios. Planning and
specification work MUST NOT implement product code.

Before planning or editing, contributors and agents MUST inspect the current
code, tests, contracts, schema, migrations, module documentation, and
uncommitted changes. They MUST reuse completed features and existing modules;
duplicate modules, parallel contracts, and speculative reimplementation are
prohibited. Implementation MUST stay on the current feature branch and use
atomic Conventional Commits when commits are authorized; automation MUST NOT
commit, push, merge, or switch branches without explicit authorization.

### IX. Verification and Resilient Integrations

Every backend feature MUST plan and provide unit, integration,
authorization/security, API contract, and relevant E2E coverage. Tests MUST
cover important state transitions, public/private visibility, Admin bypasses,
and evidence redaction where applicable.

External-provider and AI integrations MUST define and test failure, timeout,
rate-limit, revocation, retry, idempotency, concurrency, and partial-failure
behavior. Retries MUST be safe and bounded; a dependency failure MUST NOT
silently create unsupported trust or corrupt an otherwise valid business state.

## Project Constraints

NestJS owns authentication, authorization, platform business state,
persistence, background jobs, and public APIs. External providers and the
separate FastAPI AI service operate only behind explicit typed contracts and do
not write platform business state.

The backend stack is TypeScript, NestJS, Prisma, PostgreSQL with pgvector,
BullMQ, Redis, and Docker Compose. Provider keys, tokens, URLs, model secrets,
and encryption material MUST come from validated configuration and MUST NOT be
hardcoded, returned, or logged.

## Delivery Workflow

Every implementation plan MUST identify account-mode journey rules, contextual
capabilities and authorization, owning modules/tables, public DTOs, state
transitions, migration impact, evidence/privacy impact, external failure
behavior, and required tests. GitHub-related plans MUST distinguish registration,
optional social identity, GitHub App installation, repository selection,
analysis consent, and the explicit workflow trigger.
Exceptions require concrete repository evidence, the rejected compliant
alternative, risk and migration analysis, an accountable owner, and approval in
the governing decision record before implementation.

A backend change is complete only when applicable architecture checks, lint,
type-check, focused and full tests, Prisma validation, API contract review, and
build checks pass or are reported with precise blockers. Module documentation
and the development tracker MUST be updated when implementation changes module
behavior, ownership, contracts, or persistence.

## Governance

This constitution compiles approved project-wide policy. Later explicitly
approved decisions supersede earlier ones. When artifacts conflict, apply this
order and stop for reconciliation when the result is still ambiguous:

1. the latest explicitly approved project-wide decision, recorded in the
   canonical decision log or in a ratified constitution amendment pending
   prompt synchronization back to that log;
2. an accepted, non-superseded ADR for architecture and technology decisions;
3. this constitution;
4. the approved active feature specification and task acceptance criteria;
5. current API contracts, schema, code, and tests as evidence of current
   behavior, not automatic approval of that behavior;
6. PRD/backlog/business documents that have not been superseded;
7. legacy PDFs, historical plans, and informal notes.

Amendments require an explicit reason, approval, SemVer update, Sync Impact
Report, and review of dependent Spec Kit templates and runtime guidance.
Versioning is MAJOR for incompatible principle redefinitions, MINOR for new or
materially expanded governance, and PATCH for non-semantic clarification.

Compliance MUST be reviewed during specification, planning, implementation
review, and final handoff. A violation MUST be fixed or approved through the
documented exception process before the affected implementation is considered
complete.

**Version**: 3.1.0 | **Ratified**: 2026-07-10 | **Last Amended**: 2026-07-26
