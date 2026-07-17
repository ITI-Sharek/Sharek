# ShareK — Test Strategy

**Status:** `PROPOSED` throughout — targets, not achieved coverage
**Date:** 2026-07-17
**Depends on:** `prd.md`, `architecture.md`, `data-model-and-erd.md`, `frontend-spec.md` §5

No fabricated coverage numbers. No LLM-as-judge, no Langfuse, no 5-metric dashboard — replaced by the 30-case golden set (§3) and ordinary test suites, proportionate to a 6-person team.

---

## 1. Backend (Jest — `backend/`)

`npm run test` runs unit and `*.e2e-spec.ts` files under one `testRegex`, no separate e2e script (`backend/AGENTS.md`).

**Unit** — the highest-value tier, since this is where the product's actual rules live:
- State-machine transitions: `Task`, `Application`, `ContributionEvidence` (+ its independent `prState`), `Review` (`data-model-and-erd.md` §3) — every legal and illegal transition.
- Reputation math: aggregation is always computed from the `ReputationEvent` log at read time (ADR pattern, `data-model-and-erd.md` §2) — test that a stored event never gets silently mutated, and that the n=3 raw-reviews-below-threshold rule (FR-42) holds at the boundary (2, 3, 4 reviews).
- Evidence validation: type/label/description required, `prState` only meaningful for `GITHUB_PR`, owner-attestation-vs-GitHub-state auto-flag logic (FR-35, ADR-008).
- Review eligibility: only accepted contributor/owner pairs can review each other; blind-window/expiry/lone-publish logic (FR-40, ADR-010).
- Screening policy: `ADVISORY` vs `STRICT` never produces a permanent auto-hide without an owner override (FR-30, ADR-014).
- Skill evidence-state transitions: `AI_INFERRED -> CONTRIBUTION_DEMONSTRATED` (automatic) vs `AI_INFERRED -> ADMIN_REVIEWED` (manual) as independent paths (FR-15).

**Integration:**
- Prisma repositories against a real test database (not mocked — this repo's own convention, `CLAUDE.md`: "integration tests must hit a real database").
- GitHub adapter: PR-state fetch, repository metadata import, OAuth callback — against recorded fixtures, not live GitHub calls in CI.
- BullMQ job flow: `skill-profile-generation`, `application-fit-analysis`, `pr-validation`, `delivery-review-expiry` — enqueue → process → persisted-result round trip, including the failure/retry/dead-letter path.
- `AiPort` contract: the interface boundary itself (`architecture.md` §3) gets a contract test independent of which model provider backs it — this is what makes swapping providers later safe.

**E2E** — one critical path, not a matrix: register → connect GitHub (optional) → publish project → create task → apply → advisory fit analysis attached → accept → submit evidence → owner review approves → blind reviews (both directions) → reputation event → public profile shows it. This is `epics-and-stories.md` E5-01.

## 2. Frontend (Vitest — `frontend/`)

Full approach: `frontend-spec.md` §5. Summary: extract route/orchestration decisions into `*.helpers.ts`, unit-test at that seam, no rendering/MSW by default. The modules that need a seam test from day one (capability derivation, evidence-state labels, review-window derivation, n=3 display rule, AI-fit never-blocks-apply, owner-silence deadline derivation) are listed there, not repeated here to avoid the two documents drifting apart.

## 3. AI evaluation — 30-case golden set

Not a metrics dashboard — a fixed, versioned set of ~30 cases (stored as a spreadsheet or a checked-in fixture file, TBD by whoever builds E5-02) covering:

- Clear-match and clear-non-match skill profiles (unambiguous cases the deterministic layer should mostly handle before AI is even called — `architecture.md` §3).
- Sparse-evidence and no-public-repo contributors (must not equate "no evidence found" with "no skill" — `product-brief.md` risk register).
- Borderline/contradictory evidence, where `review_needed`/low-confidence is the correct output, not a forced decision.
- At least a few adversarial cases: prompt-injection attempts via README content, since repository content is untrusted input to the AI call.

Run manually or in CI against `AiPort`; a regression is a case that used to pass and now doesn't, not a global accuracy percentage — with 30 cases, per-metric percentages would be spurious precision.

## 4. Contract tests

- Frontend ↔ backend: the shapes in `api-contracts.md` §7 (once built) and `frontend-spec.md` §6, specifically the three records the frontend renders directly (`ContributionEvidence`, `Review`, `UserSkill`) — a contract test here is cheaper than finding the drift in a manual QA pass.
- Backend ↔ GitHub: recorded-fixture tests for the adapter (already covered under Integration above) — no live network calls in CI.

## 5. What this explicitly does not include

Per the LOCKED decisions this whole doc set encodes: no Langfuse, no LLM-as-judge, no 5-quality-metric dashboard (`prd.md` §6) — the golden set in §3 is the proportionate replacement. No load/performance testing infrastructure beyond the realistic targets already stated in `prd.md` NFR-01 — nothing to build before there's real traffic to model.
