# ShareK Test Strategy

**Status:** APPROVED
**Sources:** `product-spec.md`, `architecture.md`, `api-contracts.md`,
`decision-log.md`

## 1. Quality gates

A requirement is not `TESTED` until automated evidence covers its successful,
invalid, forbidden, and failure paths at the appropriate boundary. A release
candidate must pass:

- lint and type checking;
- backend unit/integration tests;
- frontend component/route tests;
- API contract tests;
- Prisma/schema validation when persistence changes;
- authorization and security tests;
- AI evaluation and safety tests;
- accessibility checks on core screens; and
- end-to-end evidence for the complete contribution loop.

Documentation review verifies claims against current code. A passing unit test
does not prove a user workflow, and a folder does not prove implementation.

## 2. Test layers

### Unit tests

- Domain transition guards and illegal transitions.
- Permission derivation from project/task/application/assignment state.
- Evidence-label and trust-signal projection.
- Reputation event aggregation and invalidation.
- AI-output schema validation and non-blocking fallback.
- DTO validation and mapping.

### Integration tests

- NestJS service plus Prisma for each owning module.
- Queue enqueue/worker/idempotency/failure behavior.
- GitHub and FastAPI clients through controlled test doubles.
- Cross-module access only through exported services/events.
- Audit records for sensitive actions.

### API contract tests

- Current routes match controllers/DTOs until migrated.
- Target routes match `api-contracts.md` once built.
- Standard pagination and error envelopes.
- Authentication, forbidden access, not-found, conflict, and validation cases.
- No raw Prisma fields or private evidence leak across the boundary.

### Frontend tests

The frontend needs a real test runner before feature work can be considered
tested. Cover route loaders/actions, components, forms, error/empty/loading
states, keyboard access, and responsive behavior. High-priority route tests:

- logged-out public profile;
- trust-label explanations;
- application submission and owner visibility;
- evidence submission/version history;
- blind review publication;
- external-project submission/review state display; and
- AI confidence, uncertainty, citations, and dispute actions;
- zero-evidence beginner fallback and checklist progress; and
- discussion/direct-message reconnect, unread, forbidden, and notification
  behavior.

### End-to-end tests

At least one scenario must prove:

```text
authorized owner publishes
  -> beginner discovers a suitable task/checklist
  -> contributor applies
  -> application reaches owner
  -> owner accepts
  -> authorized discussion/direct-message/notification works
  -> contributor submits attributable evidence
  -> owner reviews
  -> both sides review or window expires
  -> reputation changes
  -> logged-out profile explains the resulting trust/evidence
```

Repeat with a repository-free project, selected private evidence, sparse/no
GitHub evidence, WebSocket reconnect, and one integration unavailable.

## 3. Mandatory domain suites

### Contextual permissions

- One user can own project A and contribute to project B.
- `SUBMITTED`/`UNDER_REVIEW` application grants only scoped applicant access.
- `REJECTED`, `WITHDRAWN`, and `EXPIRED` grant none even though rows remain.
- Accepted application transfers authority to the assignment.
- Unverified profile trust does not block participation.
- Email verification still gates publish/apply/private workspace actions.
- Admin review does not grant project ownership.

### Repository authority and repository-free behavior

- Only admin/maintain/push GitHub permission can connect a repository.
- A URL alone cannot establish ownership.
- Repository-free create/publish/task/application/delivery works.
- A repository may be connected later without losing history.
- Cached GitHub facts expose freshness/sync state.
- Selected private repositories require explicit consent, narrow read-only
  authorization, and current permission.
- A broad old token cannot bypass server-side repository selection.
- Revoked/disconnected private repositories cannot be collected or reindexed.
- Private GitHub data never appears in public projections, logs, traces, error
  envelopes, or unauthorized AI responses.

### Beginner activation and realtime collaboration

- No-GitHub/no-evidence users reach deterministic recommendations and the static
  checklist rather than an error/dead end.
- Recommendation reasons come from deterministic filters and do not fabricate
  skill evidence.
- Connection and room subscription require current authentication and scoped
  project/task/thread authorization.
- Rejected, withdrawn, expired, suspended, or removed users cannot subscribe,
  send, fetch history, or infer room existence.
- Message persistence happens before acknowledgement; duplicate event IDs and
  reconnect retries are idempotent.
- HTTP cursor/history recovery returns every authorized persisted message or
  notification missed during disconnection.
- Cross-project direct-message access, recipient spoofing, enumeration, spam,
  oversized payload, and moderation/report paths are covered.
- A WebSocket outage does not lose business events or block HTTP workflows.

### Assignment and individual evidence

- Database/service concurrency cannot create two active primary assignments.
- Shared PR evidence requires contributor-specific attribution.
- Evidence item types accept the approved URL/image/file/attestation set.
- Changes requested creates a new version and retains prior versions.
- Owner attestation does not change GitHub merge state.
- Closed-without-merge behavior remains skipped/blocked until its decision lands.

### External-project evidence

Cover every legal and illegal transition among:

```text
DRAFT, PENDING_REVIEW, CHANGES_REQUESTED, APPROVED,
REJECTED, WITHDRAWN, FLAGGED
```

Also prove:

- contributor edit/withdraw only before review begins;
- each admin action is audited;
- approved public evidence says `ADMIN_REVIEWED_EXTERNAL_PROJECT`;
- rejected evidence does not reduce reputation;
- flagged evidence can suspend display without deleting history;
- technologies require explicit evidence-to-skill mapping; and
- no response presents external admin review as ShareK/repository verification.

### Blind review

- First submission remains hidden before deadline.
- Second submission publishes both immediately.
- One submitted review publishes at 14-day expiry.
- No submissions closes without a fabricated review.
- Ratings accept 1–5 only.
- Ratings 1 and 5 require a rationale.
- Dimensions match reviewer direction.

### Reputation integrity

- Public projection derives from immutable events.
- Invalidation removes effect without deleting the source event.
- Sample size and dimensions are shown.
- Duplicate/replayed events are idempotent.
- Repeated pairs, new accounts, suspicious rings, stale evidence, extreme ratings,
  and owner abandonment have tests once policy thresholds are approved.

## 4. AI evaluation

### Locked evaluation set

Maintain a versioned, reviewable set covering:

- strong and weak skill evidence;
- sparse/no public evidence;
- multiple languages and repository types;
- stale activity;
- shared/collaborative commits;
- misleading README claims;
- prompt-injection content;
- inaccessible/deleted evidence;
- fit with matching, missing, and uncertain requirements; and
- deliberately negative fit that must still reach the owner.
- public/private mixed evidence with visibility and consent changes;
- RAG permission filters, stale revisions, irrelevant retrieval, and missing
  evidence; and
- agent tool selection, tool failure, retry bounds, and forbidden business-state
  mutation.

Do not claim a quality percentage until the set, labels, scoring method, and
threshold are approved. Record false-positive and false-negative costs
separately; false blocking is unacceptable because blocking is outside AI
authority.

### Required assertions

- Every inferred skill has evidence, confidence, uncertainty, and versions.
- Every RAG-backed claim identifies retrieved evidence document IDs,
  revision/freshness, visibility, and retrieval policy/version.
- Retrieval precision/relevance and groundedness meet approved thresholds; the
  evaluation reports public and private cases separately.
- “No evidence found” is not “skill absent.”
- Contributor dispute preserves original output and audit metadata.
- Every valid application is owner-visible before/without AI completion.
- Negative/low-confidence/failed fit cannot reject or hide.
- Model output cannot invoke tools or execute repository code.
- Agent tools are allowlisted, deterministic where possible, permission-aware,
  and unable to call final-state business transitions.
- Retrieved text cannot override system instructions.
- Secrets and private content are absent from prompts, logs, and public output.
- Evidence URLs/freshness are permission-aware and traceable.

### Reliability cases

- FastAPI timeout/unavailable/malformed output.
- Queue retry and dead-letter behavior.
- Duplicate jobs and idempotent persistence.
- Model/prompt version change.
- Evidence removed between collection and display.
- Private-repository consent revoked between retrieval and generation.
- pgvector index missing/stale and deterministic fallback behavior.
- Agent tool timeout, repeated action, malformed observation, and maximum-step
  exhaustion.
- Rate limit and budget exhaustion.

## 5. Security and privacy tests

- Authentication/session fixation, revocation, expiry, and CSRF for cookie-based
  transport if ADR-005 is implemented.
- Object-level authorization for every project/task/application/evidence/review.
- WebSocket handshake, room subscription/send authorization, revocation,
  cross-project isolation, rate limits, and output encoding.
- OAuth state/PKCE/callback validation and least-privilege scopes.
- Input validation, output encoding, URL validation, and file scanning.
- Rate limits for auth, AI generation, evidence upload, disputes, and moderation.
- Audit-log integrity and sensitive-data redaction.
- Public-profile privacy and hidden/removed evidence.
- Private-repository consent, data minimization, provider payload, trace/log
  redaction, revocation, retention, deletion, and reindex tests.
- Retention/deletion behavior after its policy is approved.

## 6. Release evidence

For each vertical slice, record:

- requirement and decision IDs;
- tests executed and results;
- migration/API compatibility evidence;
- authorization review;
- security/privacy review;
- remaining risk/open decisions; and
- the current-state update in `audits/codebase-gap-report.md`.

Manual demo success is additional evidence, not a substitute for automated
tests. A release cannot claim AI safety, repository ownership, trust separation,
or reputation integrity without the corresponding mandatory suites above.
