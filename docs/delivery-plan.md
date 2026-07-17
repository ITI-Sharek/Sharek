# ShareK Delivery Plan

**Status:** PROPOSED
**Target:** Minimum demonstrable release by 2026-08-30
**Capacity:** OPEN — DX-001 must be resolved before assigning dates or owners

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
- least-privilege GitHub connection for public evidence;
- current-versus-target route compatibility; and
- security/audit tests.

Exit evidence:

- contextual role tests;
- terminal applications cannot grant access;
- no private/write GitHub scope for public inference;
- authentication and verification tests pass.

### Slice 2 — Project and task publication

Outcome: an authorized maintainer publishes a project and one scoped task.

Includes:

- repository-backed project with permission verification;
- repository-free project creation and later connection;
- task requirements and evidence expectations;
- one-primary-assignment constraint; and
- public discovery/detail surfaces.

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
- notifications/audit records.

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

### Slice 7 — AI Skill Inference

Outcome: public GitHub evidence produces a disputable, evidence-backed skill
inference.

Includes:

- public repositories, contribution history, PRs, and accessible diffs;
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
- disputed output remains auditable.

### Slice 8 — Advisory AI Application Screening Fit

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

### Slice 9 — Integrity, accessibility, and release hardening

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

Slice 1 + public GitHub evidence -> Slice 7
Slice 3 + Slice 7               -> Slice 8
All required slices             -> Slice 9
```

AI work may be developed alongside the manual loop, but Slice 8 cannot redefine
or block Slice 3. Public-profile work may begin early, but trust claims cannot be
validated until real evidence exists.

## 5. Current prioritization

Based on repository evidence:

1. Fix identity/GitHub least-privilege and public-profile access gaps.
2. Build the task/application/assignment path, whose modules are scaffolds.
3. Build delivery evidence and owner review.
4. Build blind review and event-based reputation.
5. Build external-project review and trust presentation.
6. Complete required AI inference evaluation and application fit.
7. Harden, seed, validate, and demonstrate.

This order is not a date commitment. DX-001 must record actual availability and
slice ownership before the team publishes a sprint forecast.

## 6. Scope controls

Do not start these before the required loop passes its release gates:

- real-time chat;
- general project discussions;
- semantic/vector recommendation systems;
- team/company hiring;
- payments or subscriptions;
- premium tiers;
- advanced trust automation; or
- autonomous AI decisions.

If schedule pressure requires cuts, cut secondary collaboration and presentation
polish before removing individual evidence, blind review integrity, public trust
explanation, required AI inference, or advisory application fit.

## 7. Open delivery dependencies

- PD-001: ITI checklist classification.
- DX-001: capacity, availability, and ownership.
- OQ-001: file storage, scanning, limits, retention, and removal.
- Closed-without-merge owner-attestation outcome.
- External-project visibility and review-start representation.
- AI evaluation thresholds and supported languages.
- Reputation fraud thresholds.
- Privacy and retention policy.

Open dependencies remain visible; the team must not invent answers inside
implementation tickets.
