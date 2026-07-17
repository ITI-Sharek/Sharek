# ShareK — Test Strategy

**Status:** `PROPOSED` throughout — targets, not achieved coverage
**Date:** 2026-07-17
**Depends on:** `decision-log.md`, `prd.md`, `architecture.md`, `data-model-and-erd.md`, `frontend-spec.md` §5

No fabricated coverage numbers. No LLM-as-judge, no Langfuse, no 5-metric dashboard — replaced by the 30-case golden set (§3) and ordinary test suites, proportionate to a 6-person team.

---

## 1. Backend (Jest — `backend/`)

`npm run test` runs unit and `*.e2e-spec.ts` files under one `testRegex`, no separate e2e script (`backend/AGENTS.md`).

**Unit** — the highest-value tier, since this is where the product's actual rules live:
- State-machine transitions: `Task`, `Application`, `ContributionEvidence` (+ its independent `prState`), `Review` (`data-model-and-erd.md` §3) — every legal and illegal transition.
- Reputation math: aggregation is always computed from the `ReputationEvent` log at read time (ADR pattern, `data-model-and-erd.md` §2) — test that a stored event never gets silently mutated, and that the n=3 raw-reviews-below-threshold rule (FR-42) holds at the boundary (2, 3, 4 reviews).
- Evidence validation: type/label/description required, `prState` only meaningful for `GITHUB_PR`, owner-attestation-vs-GitHub-state auto-flag logic (FR-35, ADR-008).
- Review eligibility: only accepted contributor/owner pairs can review each other; blind-window/expiry/lone-publish logic (FR-40, ADR-010).
- Advisory screening policy: every otherwise valid application reaches the owner; fit output never hides, rejects, blocks, or changes application state. Strict/automatic rejection has no MVP test path because it is deferred (`decision-log.md` AI-002/AI-003).
- Skill evidence dimensions: evidence source, human-review status, verification tier, and mapped skill claims change independently; admin review must not overwrite `AI_INFERRED` or promote every listed technology (`decision-log.md` DM-002/DM-004).
- External-project workflow: every allowed and forbidden transition across `DRAFT`, `PENDING_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, and `FLAGGED`; pre-review edit/withdraw rules; audit entry for every review action; rejection creates no public reputation.
- Profile trust: multiple simultaneous signals, source explanation for every public label, participation without admin approval, and trust-label suspension/removal without audit-record deletion (`decision-log.md` DM-003).

**Integration:**
- Prisma repositories against a real test database (not mocked — this repo's own convention, `CLAUDE.md`: "integration tests must hit a real database").
- GitHub adapter: PR-state fetch, repository metadata import, OAuth callback — against recorded fixtures, not live GitHub calls in CI.
- BullMQ job flow: `skill-profile-generation`, `application-fit-analysis`, `pr-validation`, `delivery-review-expiry` — enqueue → process → persisted-result round trip, including the failure/retry/dead-letter path.
- NestJS ↔ FastAPI contract: structured skill-inference and advisory-fit outputs, confidence/evidence references, authentication, timeouts, malformed-output handling, and proof that FastAPI cannot perform business state transitions (`architecture.md` §3).

**E2E** — focused critical paths, not a combinatorial matrix: (1) register → connect GitHub → infer skills from public evidence → display confidence/evidence → dispute an inference; (2) publish project → create task → apply → advisory fit attached → valid application reaches owner → accept → submit evidence → owner approval → reputation event → public profile shows its source and verification tier; (3) submit external project → admin review → public profile shows `ADMIN_REVIEWED_EXTERNAL_PROJECT` separately from ShareK/repository-backed contribution evidence.

## 2. Frontend (Vitest — `frontend/`)

Full approach: `frontend-spec.md` §5. In addition to focused helper tests, public-profile route/component tests must prove logged-out access, source-explained trust labels, distinct external/ShareK/repository-backed evidence, and the absence of a global verified boolean. Application tests must prove AI fit never blocks submission or owner visibility.

## 3. AI evaluation — 30-case golden set

Not a metrics dashboard — a fixed, versioned set of ~30 cases (stored as a spreadsheet or a checked-in fixture file, TBD by whoever builds E5-02) covering:

- Clear-match and clear-non-match skill profiles (unambiguous cases the deterministic layer should mostly handle before AI is even called — `architecture.md` §3).
- Sparse-evidence and no-public-repo contributors (must not equate "no evidence found" with "no skill" — `product-brief.md` risk register).
- Public-only source enforcement: private repositories and inaccessible diffs are never analyzed, and unavailable evidence is reported as uncertainty rather than inferred absence.
- Borderline/contradictory evidence, where `review_needed`/low-confidence is the correct output, not a forced decision.
- At least a few adversarial cases: prompt-injection attempts via README content, since repository content is untrusted input to the AI call.
- Application-fit cases prove matching evidence, missing/uncertain requirements, confidence, and citations while always leaving acceptance or rejection to the owner.

Run manually or in CI against the bounded AI service contract; a regression is a case that used to pass and now doesn't, not a global accuracy percentage — with 30 cases, per-metric percentages would be spurious precision.

## 4. Contract tests

- Frontend ↔ backend: the shapes in `api-contracts.md` §7 (once built) and `frontend-spec.md` §6, specifically the three records the frontend renders directly (`ContributionEvidence`, `Review`, `UserSkill`) — a contract test here is cheaper than finding the drift in a manual QA pass.
- Backend ↔ GitHub: recorded-fixture tests for the adapter (already covered under Integration above) — no live network calls in CI.

## 5. What this explicitly does not include

Per the LOCKED decisions this whole doc set encodes: no Langfuse, no LLM-as-judge, no 5-quality-metric dashboard (`prd.md` §6) — the golden set in §3 is the proportionate replacement. No load/performance testing infrastructure beyond the realistic targets already stated in `prd.md` NFR-01 — nothing to build before there's real traffic to model.
