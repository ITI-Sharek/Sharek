# Contribution Proposals Module

Owns Contribution Proposals: contributor-authored suggestions of new Project
work, their immutable version history, owner responses (revision request,
decline, accept), withdrawal, per-Project proposal intake, and misuse reports.
Implements S4-B09 and S4-B10 under the Sprint 4 backend specification (see
`specs/005-sprint-4-contribution-workflows/spec.md`) and ADR 0003 (`accepted
proposals create attributed owner drafts`).

A Contribution Proposal is not an Application and grants no Assignment or
selection priority. Owner acceptance creates an owner-controlled draft
Contribution Request from the latest Proposal Version with immutable proposer
attribution, and nothing else — no Assignment, Application, reserved place, quota
use, ownership claim, or selection priority. The draft is created through the
exported `ContributionTasksService.createDraftFromAcceptedProposal` inside the
acceptance transaction; this module never writes Contribution Request tables.

## Current API

All routes require an authenticated user (`AccessTokenGuard`); role and status
are enforced in the service.

- `POST /contribution-proposals`: active contributor submits a proposal to an
  active published Project. Requires the attribution-and-assignment disclosure
  acknowledgement and a UUID idempotency key. Creates the proposal plus an
  immutable version 1 with title, problem or opportunity, proposed outcome, and
  Project benefit.
- `GET /contribution-proposals/mine`: proposer cursor-pages through their own
  proposals.
- `GET /contribution-proposals/for-project/:projectId`: Project owner lists the
  proposals submitted to their Project with the same cursor contract.
- `PUT /contribution-proposals/for-project/:projectId/intake`: Project owner
  enables or disables proposal intake for their Project.
- `GET /contribution-proposals/:proposalId`: proposer or Project owner reads the
  full proposal, its version history, its revision requests, and the resulting
  Contribution Request lifecycle status when one exists.
- `POST /contribution-proposals/:proposalId/versions`: proposer answers an
  outstanding owner revision request by submitting a new immutable version.
- `POST /contribution-proposals/:proposalId/revision-requests`: Project owner
  appends a revision request without editing contributor-authored content.
- `POST /contribution-proposals/:proposalId/accept`: Project owner accepts a
  pending proposal. Transactionally creates an attributed owner-controlled draft
  Contribution Request. Terminal and idempotent.
- `POST /contribution-proposals/:proposalId/decline`: Project owner declines a
  pending proposal with a contributor-visible reason. Terminal and idempotent.
- `POST /contribution-proposals/:proposalId/misuse-reports`: a participant (the
  proposer or the Project owner) preserves authorship evidence and timestamps for
  moderation. The platform records the claim only and makes no automatic copying,
  ownership, or legal finding.
- `POST /contribution-proposals/:proposalId/withdraw`: proposer withdraws a
  pending proposal. Idempotent through the optional `Idempotency-Key` header.

## Rules

- **Privacy**: while pending, a proposal is visible only to its proposer and the
  Project owner. All read and write paths re-check this.
- **Immutable authorship**: every `ContributionProposalVersion` is
  contributor-authored, timestamped, and never mutated. Owners request revisions
  but never author them; only the proposer can answer with a new version, and
  only when a revision has been requested.
- **Intake and eligibility**: submission requires a published Project with
  intake enabled (`ProjectProposalIntake`, default enabled). A Project owner
  cannot propose to their own Project. The DEC-078 proposal gate is the next
  Phase 0 slice (`P0-B04`, #117); its `EligibilityEvaluation` target column is
  already present, but Proposal creation and versioning do not yet invoke the
  gate.
- **Transactional invariants**: submission takes a transaction-scoped shared
  Project lock, materializes and locks the intake row, and serializes commands
  per proposer before rechecking the daily limit. Distinct pending suggestions
  to the same Project are allowed within that limit.
- **Revision concurrency**: an incrementing revision-request sequence prevents a
  contributor version from clearing an owner Revision Request that arrived
  concurrently. Accept, decline, and version commands flip state under an
  optimistic `updateMany` guarded by both `current_version` and
  `revision_request_sequence`, so exactly one command wins a race.
- **Terminal owner responses**: accept and decline move a pending proposal to a
  terminal state under a transaction-scoped Project lock and owner check.
  Acceptance creates exactly one attributed draft Request; the unique
  `origin_proposal_id` on Contribution Request backstops duplicate creation.
  Discarding the resulting draft never reopens the proposal.
- **Durable responses**: revision requests, acceptance, and decline write a
  deduplicated contributor notification in the same transaction. Realtime
  delivery is deferred until commit.
- **Misuse reports**: a participant's report captures an immutable evidence
  snapshot of the reported version, authorship, and timestamps in
  `ContributionProposalMisuseReport`; no automatic similarity, copying, or legal
  judgement is made.
- **No quota, decision-neutral**: pending proposals do not expire and consume no
  Application or subscription quota. A per-contributor daily submission limit
  provides anti-spam rate limiting.
- **Append-only audit + idempotency**: submission, versioning, revision requests,
  accept, decline, withdrawal, and misuse reports append immutable
  `ContributionProposalAudit` records carrying an idempotency key and command
  fingerprint, so retries never duplicate records (ADR 0002).

## Structure

```text
contribution-proposals.module.ts
contribution-proposals.controller.ts
contribution-proposals.service.ts
contribution-proposals.service.spec.ts
dto/
mappers/
README.md
```

The service owns its tables (`ContributionProposal`,
`ContributionProposalVersion`, `ContributionProposalAudit`,
`ProjectProposalIntake`, `ContributionProposalMisuseReport`). It reads Project
facts through the exported `ProjectsService`
(`getProposalProjectContext` / `lockProposalProjectContext`) and creates accepted
drafts through `ContributionTasksService.createDraftFromAcceptedProposal`; it
never writes another module's tables.

`ContributionProposalsController` validates HTTP input and delegates to
`ContributionProposalsService`. The service owns authorization, state
transitions, transactions, and audit writes over its own tables
(`ContributionProposal`, `ContributionProposalVersion`,
`ContributionProposalAudit`, `ProjectProposalIntake`). It reads Project
publication and ownership facts only through the exported `ProjectsService`
(`getProposalProjectContext` for reads and `lockProposalProjectContext` for
transaction-scoped commands) and never touches Project tables directly.

## Implemented: the eligibility gate on proposals (#117, P0-B04)

The second contribution path is gated on the same evaluation as Applications,
so the gate cannot be walked around by *proposing* the work instead of applying
for it.

A proposer has no owner-authored Request to be measured against — they wrote the
work themselves. So the bar is inferred from the **proposal content** (title,
proposed outcome, and the problem/benefit framing), then compared against the
proposer's approved skills by the same `EligibilityService` the Application path
uses. One comparison, one payload shape, two triggers:
`PROPOSAL_BLOCKED_SKILL_GAP` is the Application block's `403` with the same
`metadata.blockingSkills`.

- Applies to **`POST /contribution-proposals` and `POST /:proposalId/versions`**,
  because a new version can escalate scope beyond what the proposer can
  evidence. The bar is re-inferred from the new content rather than reused.
- Inference runs **outside** the transaction (it is an HTTP call; holding a
  database connection across one would tie up the pool). Nothing can make it
  stale — the bar comes from content submitted in the same request.
- The comparison runs **inside** the transaction, before any row is written, so
  a refusal leaves the aggregate untouched: no Proposal, no version row, no
  audit row, and a blocked version leaves the prior version as the latest.

### The deliberate asymmetry with the Application path

**Inference failure fails open.** A provider outage raises
`PROPOSAL_ELIGIBILITY_UNAVAILABLE` (**503**, `metadata.retriable: true`), never a
verdict — distinguishable from a block by both code *and* status, so a client
cannot conflate them even by accident.

The Application path has no equivalent because it needs no provider at submit
time: its bar was frozen onto the Request at publication. Here the provider is
on the critical path, and an outage rendered as "your skills are insufficient"
would be a false statement about a person that they can neither act on nor
appeal.

### One gap, stated plainly

A blocked **create** records no `EligibilityEvaluation`. The CHECK permits
exactly one target and the Proposal it would point at was never created — that
is the constraint working as intended, not a bug to route around. The `403`
still names every blocking skill, so the refusal is fully explained; what a
blocked create cannot leave is the *durable* record. A blocked **version** does
record one, because there the Proposal exists.

### Running without it

`PROPOSAL_ELIGIBILITY_GATE_ENABLED=false` skips inference and the gate entirely
— no provider call, no evaluation row. It defaults on outside tests and off in
them, because this path needs a live provider on the request thread and the
existing proposal suite is about the proposal lifecycle, not the gate.
