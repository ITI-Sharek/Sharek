# ShareK Product Specification

**Status:** PROPOSED
**Decision authority:** `decision-log.md`
**Target release:** 2026-08-30, subject to the open capacity decision DX-001

## 1. Product purpose

ShareK helps beginner and early-career contributors build credible professional
reputation through attributable work on real projects. Its core outcome is not a
social network, job board, or generic portfolio. It is an evidence chain:

```text
owner publishes work
  -> contributor applies
  -> owner decides
  -> contributor delivers attributable evidence
  -> owner and contributor review one another
  -> reputation and the public profile update
```

The public profile must let a third party understand what was claimed, what was
reviewed, what GitHub confirms, what ShareK verified, and what AI merely
inferred.

## 2. Users and capabilities

- **Contributor:** discovers tasks, applies, submits attributable evidence,
  receives reviews, submits external-project evidence, disputes inaccurate AI
  claims, and presents a public profile.
- **Project owner or maintainer:** publishes an authorized project and tasks,
  reviews applications and delivery evidence, and participates in blind review.
- **Administrator:** reviews external-project claims, handles flags, and manages
  platform safety. Admin review is not a participation prerequisite.
- **Public profile viewer:** views a contributor profile without logging in.

`OWNER`, `CONTRIBUTOR`, and `APPLICANT` are contextual capabilities, not fixed
account identities. `ADMIN` is the only account-level privileged role. Profile
trust is also not an account role.

## 3. Product invariants

1. A user may own one project and contribute to another using one account.
2. Contributors may participate without portfolio or profile verification.
3. Email verification protects sensitive actions but is distinct from admin
   review and profile trust.
4. GitHub is authoritative for connected code facts.
5. Projects without repositories are supported.
6. Connecting a repository requires actual admin, maintain, or push authority;
   ShareK staff cannot claim arbitrary repositories.
7. Individual contribution evidence is mandatory, including when multiple
   people worked through one pull request.
8. One primary accepted contributor per task is the MVP default.
9. Reviews remain blind until both parties submit or the review window expires.
10. AI is advisory and never owns application acceptance, evidence approval,
    moderation, or reputation decisions.
11. Evidence source, review status, verification tier, and derived skill claims
    remain separate.
12. No ambiguous global `verified` boolean is permitted.

## 4. MVP requirements

### 4.1 Identity and access

- Register, sign in, refresh, sign out, reset a password, and connect supported
  social identities.
- Verify email before publishing a project, applying to a task, or accessing
  private workspace content. A verified email returned by GitHub may satisfy
  this requirement.
- Allow browsing and other public participation without admin approval.
- Derive project-scoped capabilities from ownership, active applications, and
  accepted assignments. Terminal applications do not confer continuing access.
- Publish contributor profiles at `GET /api/v1/profiles/:username` without an
  access token.

### 4.2 Projects and tasks

- An authorized maintainer can create and publish a project with a repository.
- A project can also be created without a repository and connected later.
- Repository connection must verify GitHub permission; a public URL alone does
  not establish ownership.
- Projects contain scoped contribution tasks with requirements, expected
  evidence, status, dates, and one primary assignment in MVP.
- Collaboration features remain subordinate to the task/application/delivery
  loop. Minimal task discussion may be added only after the required loop works.

### 4.3 Applications and owner decisions

- A contributor applies with a statement and relevant evidence.
- Every valid application is delivered to the owner.
- The owner accepts or rejects the application and remains accountable for that
  decision.
- AI fit analysis may summarize matching evidence and uncertainty but cannot
  hide, reject, block, or make an irreversible decision.
- Applicant-only access exists only for active application statuses and the
  relevant project/task scope.

### 4.4 Delivery and individual evidence

A ShareK-verified contribution requires all of the following:

1. a published project and task;
2. an accepted primary assignment;
3. attributable evidence submitted by the assigned contributor;
4. owner review of that evidence;
5. a successful accepted outcome;
6. preserved evidence and audit history; and
7. no unresolved integrity flag that invalidates the claim.

Allowed evidence includes repository pull requests and commits, URLs, images,
files, demos, documents, and owner attestations. Evidence items record their
source, contributor attribution, submission time, and audit trail. When GitHub
is connected, GitHub controls merge/close and commit facts; an owner attestation
does not rewrite GitHub history.

### 4.5 Blind reviews and reputation

- The contributor and owner review one another within a 14-day window.
- Reviews publish immediately when both submit.
- At window expiry, a submitted review publishes even if its counterpart is
  absent.
- Ratings use a 1–5 scale. A rating of 1 or 5 requires a rationale.
- Contributor dimensions: quality, reliability, communication, and task fit.
- Owner dimensions: task clarity, responsiveness, fairness, and support.
- Reputation is derived from append-only events and exposes dimensions, sample
  size, evidence provenance, reversals, and flags rather than one unexplained
  score.
- Repeated pairs, new accounts, suspicious review rings, stale evidence, owner
  abandonment, and evidence invalidation require integrity controls. Exact
  thresholds remain open.

### 4.6 AI Skill Inference — required MVP

ShareK analyzes accessible public GitHub evidence:

- public repositories;
- public contribution history;
- public pull requests; and
- public commit diffs when accessible.

Each inferred skill must include:

- normalized skill name;
- confidence and uncertainty;
- evidence references and relevant excerpts or locations;
- repository and activity freshness;
- model and prompt version; and
- a visible `AI_INFERRED` source label.

AI inference is neither human review nor verified contribution evidence. The
contributor can dispute an inaccurate inference, and the original output remains
auditable. Absence of public evidence means “insufficient evidence,” not “the
contributor lacks the skill.”

### 4.7 Advisory AI Application Screening Fit — required MVP

For every valid application, ShareK may compare contributor evidence with task
requirements and return:

- a concise fit summary;
- matching evidence;
- missing or uncertain requirements;
- confidence and uncertainty; and
- evidence citations.

The analysis is visible as advice. It never suppresses the application. AI
failure, timeout, or low confidence falls back to owner review with no AI result.
Strict or automatic rejection is deferred.

### 4.8 External-project evidence

A contributor can submit an external project with:

- title and description;
- images or screenshots;
- optional demo link and GitHub URL;
- technologies;
- claimed contributor role and contribution description;
- project date or period;
- optional supporting files or URLs; and
- visibility.

Submission statuses are exactly:

```text
DRAFT
PENDING_REVIEW
CHANGES_REQUESTED
APPROVED
REJECTED
WITHDRAWN
FLAGGED
```

The contributor may edit or withdraw before review begins. An admin may approve,
reject, request changes, or flag, and every action is auditable. Rejected
evidence does not reduce public reputation. Approved evidence may appear on the
public profile as `ADMIN_REVIEWED_EXTERNAL_PROJECT`; it is not legal identity,
full project ownership, a repository-backed contribution, or a completed ShareK
contribution. Claimed technologies support skills only through explicit evidence
mapping.

### 4.9 Public profile trust model

A profile may display several simultaneous signals:

- `UNVERIFIED_PROFILE`
- `GITHUB_CONNECTED`
- `ADMIN_REVIEWED_PORTFOLIO`
- `SHAREK_CONTRIBUTION_VERIFIED`
- `HIGH_TRUST_PROFILE` — post-MVP unless separately approved

Public evidence labels are:

- `SELF_DECLARED_PROJECT`
- `ADMIN_REVIEWED_EXTERNAL_PROJECT`
- `SHAREK_CONTRIBUTION_VERIFIED`
- `REPOSITORY_BACKED_CONTRIBUTION`
- `OWNER_ATTESTED_CONTRIBUTION`

The UI explains why each signal or label exists. Fraud handling may suspend or
remove a public trust signal while retaining historical audit records.

### 4.10 Supporting capabilities

- In-app notifications for application, evidence, review, and moderation events.
- Admin moderation of flags and external-project reviews.
- Audit records for sensitive status and trust changes.
- Accessible, responsive public profile and core workflow screens.
- English-first UI with future localization readiness; final checklist impact is
  still open.

## 5. Explicitly outside MVP

- Strict or automatic AI application rejection.
- AI-owned hiring, acceptance, moderation, or reputation decisions.
- Real payments, escrow, subscriptions, commissions, or premium tiers.
- Company accounts, team hiring, or an applicant-tracking system.
- A general social feed or collaboration suite.
- Mandatory real-time chat or WebSockets.
- Automatic import of repositories a user does not maintain.
- A single profile-verification flag.
- `HIGH_TRUST_PROFILE` automation.
- Semantic/vector matching unless the ITI checklist is classified as mandatory.

## 6. Security, privacy, and AI-safety requirements

- Request the least GitHub privilege necessary. The current contributor `repo`
  scope is an implementation gap, not an approved permission.
- Treat repository content, README text, diffs, URLs, and uploaded files as
  untrusted input.
- Never execute repository code as part of analysis.
- Redact secrets and personal data before model calls and audit storage.
- Separate system instructions from retrieved repository content.
- Persist evidence citations, prompt/model versions, failures, and disputes.
- Do not expose private repository data on public profiles.
- Do not use submitted data for provider training without compatible terms and
  explicit policy/consent.
- Rate-limit authentication, evidence submission, AI generation, disputes, and
  moderation actions.

## 7. Success evidence

The release is credible only when the team can demonstrate the complete loop
with individually attributable evidence and a public profile whose trust labels
are understandable to external reviewers. Before the final presentation, test
the profile with at least three hiring-adjacent reviewers and record whether they
can distinguish self-declared, admin-reviewed, repository-backed, owner-attested,
ShareK-verified, and AI-inferred claims.

Delivery detail belongs in `delivery-plan.md`; verification detail belongs in
`test-strategy.md`; technical and domain definitions belong in
`architecture.md`.

## 8. Open product decisions

Open items are owned by `decision-log.md`, particularly:

- ITI checklist classification;
- closed-without-merge owner attestation;
- external evidence storage and visibility;
- reputation fraud thresholds;
- AI evaluation thresholds and supported languages;
- privacy and retention policy; and
- confirmed team capacity.
