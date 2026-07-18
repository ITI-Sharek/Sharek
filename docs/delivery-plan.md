# ShareK Delivery Plan

**Status:** APPROVED
**Scope checkpoint:** 2026-07-30
**Target:** Minimum demonstrable release by 2026-08-30
**Capacity basis:** APPROVED — approximately eight hours per person per working
day; member availability and ownership remain OPEN under DX-001

## 1. Planning method

ShareK plans implementation as end-to-end vertical slices. The only planning
inputs are:

- `product-spec.md` for required outcomes;
- `architecture.md` for boundaries and domain rules;
- `api-contracts.md` for interfaces;
- `decision-log.md` for approved/open decisions;
- `test-strategy.md` for release evidence; and
- `audits/codebase-gap-report.md` for current repository facts.

Folders, module files, and old plans do not establish progress. A slice advances
only when its user outcome, authorization, persistence, API, UI, tests, and
operational behavior are demonstrated.

### Issue regeneration rule

The owner creates replacement implementation issues from this approved plan and
the other canonical documents. Existing issue manifests and created-issue
snapshots under `docs/audits/` are historical evidence and must not be copied or
reopened as current scope. Every replacement issue must reference its slice and
applicable decision IDs, use the approved public/private repository, WebSocket,
RAG, single-agent, beginner-activation, review, and notification boundaries, and
retain the release gates below.

## 2. Release gates

A slice is complete only when:

1. its requirement and decision IDs are identified;
2. product and domain behavior are unambiguous;
3. authorization and ownership are enforced;
4. request/response/error contracts are verified;
5. migrations are forward-safe and reviewed when persistence changes;
6. unit/integration/contract tests cover success, failure, and forbidden paths;
7. audit, retry, fallback, and privacy behavior are addressed;
8. the relevant module and operations documentation is current;
9. current-state evidence is refreshed in the codebase gap report; and
10. no AI result is given authority beyond the advisory boundary.

“Implemented” means repository evidence exists. “Tested” requires passing
automated evidence. “Deployed” requires a verified environment, not a plan.

## 3. Vertical slices

### Slice 1 — Foundation and least-privilege identity

Outcome: one account can authenticate safely and acquire contextual capabilities
without a permanent owner/contributor split.

Includes:

- registration, login, refresh, logout, password reset, social login;
- email-verification policy from SEC-002;
- removal/migration of fixed product roles while retaining `ADMIN`;
- least-privilege GitHub connection for public evidence and explicitly selected,
  read-only private evidence;
- current-versus-target route compatibility; and
- security/audit tests.

Exit evidence:

- contextual role tests;
- terminal applications cannot grant access;
- no write-capable or automatically broad private GitHub access; selected private
  evidence requires consent and cannot leak publicly;
- authentication and verification tests pass.

### Slice 2 — Project and task publication

Outcome: an authorized maintainer publishes a project and one scoped task.

Includes:

- repository-backed project with permission verification;
- repository-free project creation and later connection;
- task requirements and evidence expectations;
- one-primary-assignment constraint; and
- public discovery/detail surfaces with deterministic beginner-friendly filters
  and templated fit reasons.

Exit evidence:

- unauthorized repository import fails;
- repository-free project succeeds;
- published task can be discovered;
- no ownerless project or task is created.

### Slice 3 — Application and owner decision

Outcome: a contributor applies and the owner makes the final decision.

Includes:

- application creation/withdrawal;
- active-status-only applicant permissions;
- owner accept/reject;
- assignment creation; and
- persisted notifications/audit records with WebSocket delivery and HTTP
  recovery.

Exit evidence:

- every valid application reaches the owner;
- one active primary assignment is enforced;
- rejected, withdrawn, and expired applications grant no access.

### Slice 4 — Individual delivery evidence and owner review

Outcome: the assigned contributor submits attributable evidence and the owner
reviews a versioned delivery.

Includes:

- typed evidence items and individual attribution;
- GitHub validation snapshots when connected;
- non-repository evidence;
- changes-requested resubmission/version history;
- owner review and 14-day silence handling; and
- accepted contribution evidence label.

Exit evidence:

- shared-PR contributors must each show individual evidence;
- GitHub facts remain authoritative;
- owner attestation is visibly distinct;
- old evidence versions and audit actions remain available.

The closed-without-merge outcome cannot be finalized until its open decision is
resolved.

### Slice 5 — Blind reviews and reputation

Outcome: both parties review one another and reputation changes from traceable
events.

Includes:

- 14-day blind review window;
- immediate publication when both submit;
- expiry publication when only one submits;
- rating dimensions and extreme-rating rationale;
- append-only reputation events; and
- invalidation/recalculation hooks.

Exit evidence:

- no review leaks early;
- both-submit publication does not wait for expiry;
- one-submit expiry works;
- invalidated evidence no longer affects the projection but remains auditable.

### Slice 6 — Public trust profile and external-project review

Outcome: a logged-out viewer can distinguish every major evidence source and
trust signal.

Includes:

- unauthenticated `/api/v1/profiles/:username`;
- multiple simultaneous trust signals;
- external-project DRAFT-to-review workflow;
- admin approve/reject/request-changes/flag actions;
- evidence/version audit history;
- explicit skill-evidence mapping; and
- contributor dispute/withdraw behavior.

Exit evidence:

- no ambiguous verified boolean;
- admin-reviewed external evidence is not shown as ShareK/repository verified;
- rejected evidence does not reduce public reputation;
- contributors can participate without admin review.

File transport implementation is gated by OQ-001. URL-only and metadata work may
proceed, but the approved product requirement for images/files must not be
silently removed.

### Slice 7 — Beginner activation and realtime collaboration

Outcome: a beginner can enter the product without GitHub evidence and authorized
participants can coordinate without losing durable history.

Includes:

- static first-contribution checklist with per-user progress;
- zero-evidence fallback to checklist and deterministic recommendations;
- beginner-friendly discovery filters and templated fit reasons;
- durable project/task discussion threads;
- project-scoped direct-message threads for active authorized participants;
- NestJS WebSocket delivery for discussion messages, direct messages, and
  persisted notifications;
- HTTP history/cursor recovery and reconnect behavior; and
- authorization revocation, reporting, moderation, rate limits, and audit.

Exit evidence:

- a contributor with no usable GitHub evidence reaches useful tasks and the
  checklist rather than a dead end;
- rejected/withdrawn/expired applicants cannot join private rooms;
- access is revoked when the project relationship ends;
- acknowledged messages and notifications survive reconnect/restart; and
- WebSocket unavailability does not break the manual contribution workflow or
  HTTP recovery.

### Slice 8 — AI Skill Inference, bounded RAG, and one agent

Outcome: authorized GitHub evidence produces a disputable, permission-aware,
evidence-backed skill inference through bounded RAG and one agent.

Includes:

- public repositories, contribution history, PRs, and accessible diffs;
- explicitly selected private repositories under SEC-003;
- compact permission-filtered evidence documents indexed through pgvector;
- one bounded agentic workflow using deterministic evidence/retrieval tools;
- confidence, uncertainty, citations, freshness, and versions;
- `AI_INFERRED` source display;
- insufficient-evidence behavior;
- contributor dispute; and
- FastAPI failure fallback.

Exit evidence:

- locked evaluation cases meet approved thresholds;
- prompt-injection and secret-redaction tests pass;
- no repository code executes;
- no private evidence appears publicly;
- RAG retrieval respects contributor/repository/visibility filters;
- private evidence revocation/retention behavior is demonstrated;
- agent tools cannot mutate business state;
- disputed output remains auditable.

### Slice 9 — Advisory AI Application Screening Fit

Outcome: an owner sees evidence-linked fit advice beside every valid application.

Includes:

- requirement/evidence comparison;
- matching, missing, and uncertain requirements;
- confidence and citations;
- no-result fallback; and
- owner-visible audit metadata.

Exit evidence:

- valid applications are visible before/without AI completion;
- low confidence, failure, or negative fit cannot hide or reject;
- the owner performs the only acceptance/rejection transition.

### Slice 10 — Integrity, accessibility, and release hardening

Outcome: the complete loop is safe, observable, usable, and demonstrable.

Includes:

- fraud/ring detection hooks and moderation audit;
- rate limits and failure recovery;
- accessibility and responsive UI;
- privacy/retention decisions required for release;
- deployment/runbook verification;
- seed projects owned by authorized maintainers; and
- external profile validation with at least three hiring-adjacent reviewers.

## 4. Dependency order

```text
Slice 1
  -> Slice 2
    -> Slice 3
      -> Slice 4
        -> Slice 5
          -> Slice 6

Slice 1 -> checklist shell
Slice 2 + Slice 3 -> Slice 7 collaboration authorization
Slice 1 + authorized GitHub evidence -> Slice 8
Slice 3 + Slice 8                    -> Slice 9
All required slices                  -> Slice 10
```

AI work may be developed alongside the manual loop, but Slice 9 cannot redefine
or block Slice 3. Public-profile work may begin early, but trust claims cannot be
validated until real evidence exists. WebSocket infrastructure may begin after
the identity contract is stable, but private room authorization depends on real
project/application/assignment relationships.

## 5. Current prioritization

Based on repository evidence:

1. Fix identity/GitHub least-privilege and public-profile access gaps.
2. Build the task/application/assignment path, whose modules are scaffolds.
3. Build delivery evidence and owner review.
4. Build blind review and event-based reputation.
5. Build the checklist/discovery activation path and collaboration/realtime
   infrastructure against real project relationships.
6. Complete bounded RAG, the single agent, AI inference evaluation, and
   application fit.
7. Build external-project review and trust presentation.
8. Harden, seed, validate, and demonstrate.

The 2026-08-30 deadline is committed. DX-001 must still record actual
availability and slice ownership before the team treats per-slice estimates as
capacity-validated forecasts.

## 6. Scope controls

Do not start these before the required loop, restored collaboration paths, RAG,
and single-agent evaluation pass their release gates:

- voice/video calls, presence, typing indicators, reactions, and read receipts;
- advanced semantic project/contributor recommendation systems beyond bounded
  evidence RAG;
- three-or-more-agent orchestration;
- multimodal AI analysis;
- team/company hiring;
- payments or subscriptions;
- premium tiers;
- advanced trust automation; or
- autonomous AI decisions.

If schedule pressure requires cuts, cut collaboration polish, advanced AI, and
presentation polish before removing durable discussions/direct messages,
notifications, beginner activation, individual evidence, blind review integrity,
public trust explanation, required RAG/single-agent inference, or advisory
application fit.

## 7. Open delivery dependencies

- PD-001: ITI checklist classification.
- DX-001: capacity, availability, and ownership.
- SEC-003: selected private-repository authorization mechanism and existing broad
  token/snapshot remediation.
- COL-001: message retention, moderation limits, reconnect cursor, and deployment
  topology for WebSocket fan-out.
- OQ-001: file storage, scanning, limits, retention, and removal.
- Closed-without-merge owner-attestation outcome.
- External-project visibility and review-start representation.
- AI evaluation thresholds and supported languages.
- RAG chunk/document policy, embedding model, pgvector migration, and private
  evidence deletion/reindex behavior.
- Reputation fraud thresholds.
- Privacy and retention policy.

Open dependencies remain visible; the team must not invent answers inside
implementation tickets.

## 8. Provisional deadline gates

These gates use the confirmed 2026-07-30 discussion checkpoint, 2026-08-30 final
deadline, and the team's stated target of eight hours per person per working day.
They remain capacity assumptions until DX-001 records individual working days and
exceptions.

| Gate | Required outcome |
|---|---|
| 2026-07-18 through 2026-07-29 | Finish S1 foundation; freeze product/state/API contracts for private evidence, collaboration, RAG, and the manual loop; create issue-sized work for all required slices. |
| 2026-07-30 | Human scope/contract checkpoint. No new P0 feature enters after this date without removing or explicitly moving another item. |
| 2026-07-31 through 2026-08-09 | Backend/frontend vertical path for project, task, discovery, application, owner decision, assignment, and notification persistence; AI lane builds permission-filtered evidence documents/RAG fixtures in parallel. |
| 2026-08-10 through 2026-08-18 | Versioned evidence, owner review, blind review, reputation, public trust profile, checklist, discussions, direct messages, WebSocket recovery; AI lane integrates the single agent and skill inference. |
| 2026-08-19 through 2026-08-24 | Advisory application fit, external-project review, complete-loop E2E, private-data/security tests, seed data, deployment rehearsal, and hiring-side profile validation. |
| 2026-08-25 through 2026-08-27 | Defect-only stabilization, migration rehearsal, accessibility, privacy/retention evidence, load/failure checks, and final evaluation report. |
| 2026-08-28 | Code and schema freeze except release-blocking fixes. |
| 2026-08-29 | Final clean-environment deployment, smoke test, backup demo path, and presentation rehearsal. |
| 2026-08-30 | Final delivery. |

Multimodal analysis and three-or-more-agent orchestration may start only if every
required slice is green by 2026-08-24. They are not allowed to consume the final
stabilization window.
