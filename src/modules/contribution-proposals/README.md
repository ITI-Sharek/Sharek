# Contribution Proposals Module

Owns Contribution Proposals: contributor-authored suggestions of new Project
work, their immutable version history, owner revision requests, withdrawal, and
per-Project proposal intake. Implements S4-B09 under the Sprint 4 backend
specification (see `specs/005-sprint-4-contribution-workflows/spec.md`) and
ADR 0003 (`accepted proposals create attributed owner drafts`).

A Contribution Proposal is not an Application and grants no Assignment or
selection priority. Acceptance into an attributed draft Contribution Request is
out of scope for this module today and belongs to S4-B10.

## Current API

All routes require an authenticated user (`AccessTokenGuard`); role and status
are enforced in the service.

- `POST /contribution-proposals`: active contributor submits a proposal to an
  active published Project. Requires the attribution-and-assignment disclosure
  acknowledgement and a UUID idempotency key. Creates the proposal plus an
  immutable version 1.
- `GET /contribution-proposals/mine`: proposer lists their own proposals.
- `GET /contribution-proposals/for-project/:projectId`: Project owner lists the
  proposals submitted to their Project.
- `PUT /contribution-proposals/for-project/:projectId/intake`: Project owner
  enables or disables proposal intake for their Project.
- `GET /contribution-proposals/:proposalId`: proposer or Project owner reads the
  full proposal, its version history, and its revision requests.
- `POST /contribution-proposals/:proposalId/versions`: proposer answers an
  outstanding owner revision request by submitting a new immutable version.
- `POST /contribution-proposals/:proposalId/revision-requests`: Project owner
  appends a revision request without editing contributor-authored content.
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
  cannot propose to their own Project.
- **No quota, decision-neutral**: pending proposals do not expire and consume no
  Application or subscription quota. A per-contributor daily submission limit and
  a one-pending-proposal-per-Project rule provide anti-spam rate limiting.
- **Append-only audit + idempotency**: submission, versioning, revision requests,
  and withdrawal append immutable `ContributionProposalAudit` records carrying an
  idempotency key and command fingerprint, so retries never duplicate records
  (ADR 0002).

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

`ContributionProposalsController` validates HTTP input and delegates to
`ContributionProposalsService`. The service owns authorization, state
transitions, transactions, and audit writes over its own tables
(`ContributionProposal`, `ContributionProposalVersion`,
`ContributionProposalAudit`, `ProjectProposalIntake`). It reads Project
publication and ownership facts only through the exported `ProjectsService`
(`getProposalProjectContext`) and never touches Project tables directly.
