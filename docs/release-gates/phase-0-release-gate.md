# Phase 0 Release Gate — the eligibility gate (P0-Q01 / #119)

## Decision

Phase 0 passes at the revisions below and is **shippable on its own**. The gate
blocks an under-levelled contributor with a named, actionable reason on both
contribution paths, the block is recoverable by nothing more than an admin
approving a higher level, and the whole phase reaches its verdicts with no
subscription row, no payments module, and no paid task anywhere in the picture.

| Repository | Reviewed revision | Delivery state |
| --- | --- | --- |
| `ITI-Sharek/Sharek` | working revision of this gate PR, on `3c06f00` | Phase 0 backend merged to `main` |
| `ITI-Sharek/Frontend` | `5c5011565d7809652a9dbe5f94f97d3d1ed4e7d8` | PR #43 merged to `master` |
| `ITI-Sharek/AI_Agents` | `4206eb011c0f455f3ba89696e60bd422a1011fc5` | PR #13 merged to `main` |

Run date: **2026-08-15**.

## What this gate is, and is not

It is a machine-run contract gate, not a browser walkthrough. Every suite uses a
mocked database, a **controlled clock** (`2026-08-14T12:00:00.000Z`), and
stubbed providers, so a rerun months from now produces the same evidence and
**no paid model call is ever made**. A live provider is never release authority.

```bash
pnpm run test:release-gate:p0

SHAREK_FRONTEND_ROOT=../Frontend SHAREK_AI_ROOT=../AI_Agents \
  pnpm run test:release-gate:p0:cross-repo
```

Cross-repository mode additionally runs the Frontend suites that render the
block and the AI suite that owns the inference contract, so the three
repositories are proven against each other rather than each against its own
mocks.

## The journey

1. An owner's draft gains required skill levels — inferred by the agent,
   correctable by the owner, frozen at publication. Publishing with no
   `required` row is refused, because a Request with no bar is one every
   contributor passes.
2. A contributor whose **approved** React is `beginner` submits against a
   Request needing `advanced`. The submission is refused `403
   APPLICATION_BLOCKED_SKILL_GAP`, naming the skill, the level required, and
   the level held.
3. The refusal leaves **no Application row, no audit row, no snapshot, and no
   spent daily allowance**. It records exactly one `EligibilityEvaluation` with
   `outcome: blocked`, and returns that evaluation's id so the UI can ask for
   guidance about this exact block.
4. Guidance answers **immediately** with the deterministic blocking-skill list;
   the narrative arrives on a queue. When the provider fails, the row becomes
   `failed` and the blocking skills are untouched — a contributor is never left
   with only "you are blocked".
5. An admin approves React at `advanced`. The same contributor submits again
   and succeeds. **Nothing else is done** — no retry token, no new Request, no
   owner action.
6. The Contribution Proposal path is blocked and unblocked identically, with
   one deliberate asymmetry: inference failure there **fails open** with a
   retriable `503`, never a verdict, because the provider is on that path's
   critical path and an outage must never read as a judgement about a person.

## Independence gate

The criterion that makes Phase 0 shippable without Phases 1-3. All of it holds,
and each line is an executed assertion rather than a claim:

| Criterion | How it is proven |
| --- | --- |
| Passes with **no subscription rows** | `subscription.findFirst` returns `null` throughout `test/phase-0-release-gate.e2e-spec.ts`; the block and the recovery both complete |
| Passes with **no payments module configured** | no Phase 0 surface imports `modules/subscriptions` or `modules/payments` — asserted by the gate script over the import graph |
| Passes with **no paid task, no funding, no commission** | the Request under test carries no reward, and the submission context has no `reward` key at all |
| **No surface mentions plans, tiers, upgrades or money** | eight Phase 0 source files are read and checked for `gold`, `upgrade`, `paymob`, `checkout`, `commission`, `payout`, `escrow` — comments included |
| **Guidance is free for every contributor** (DEC-076) | a guidance request performs **zero** subscription lookups; asserted directly |
| **Pre-Phase-0 workflows are unchanged** | an eligible submission still writes both snapshots, the audit row, the allowance and the notification; and a Request published before Phase 0 has no bar and blocks nobody |

The source check counts comments deliberately. A `TODO: gate this behind Gold`
is still a surface that mentions a tier, and it is how the next person learns
one is expected. Verified by mutation: adding exactly that comment to
`eligibility.controller.ts` fails the gate and names the file.

## Evidence

### Backend — `ITI-Sharek/Sharek`

| Gate | Command | Result |
| --- | --- | --- |
| Architecture | `node scripts/check-architecture.mjs` | passed, 20 modules |
| Lint | `pnpm exec eslint "{src,test}/**/*.ts"` | clean |
| Types | `pnpm exec tsc --noEmit` | clean |
| Tests | `pnpm exec jest` | **1194 passed**, 2 skipped, 156 suites |
| Build | `pnpm exec nest build` | passed |
| REST contract | `node scripts/validate-postman-coverage.mjs` | 156 routes, 0 missing |
| **Phase 0 gate** | `pnpm run test:release-gate:p0` | **273 passed**, 15 suites |

### Frontend — `ITI-Sharek/Frontend`

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | clean |
| Types | `pnpm typecheck` | clean |
| Tests | `pnpm test` | **633 passed**, 120 files |

### AI — `ITI-Sharek/AI_Agents`

| Gate | Command | Result |
| --- | --- | --- |
| Tests | `PYTHONPATH=src python -m pytest -q` | **125 passed** |
| Compile | `python -m compileall -q src` | clean |

### Cross-repository

```json
{
  "gate": "P0-Q01",
  "mode": "cross-repository",
  "independenceChecks": "passed",
  "backendSuites": 15,
  "frontendSuites": 3,
  "aiSuites": 1
}
```

273 backend + 43 frontend + 54 AI assertions, all deterministic.

## Decisions this gate depends on

`DEC-078` (the gate as a hard block), `DEC-079` (daily allowance — Phase 1, and
independent of this one), `DEC-076` (guidance is never tier-gated), `ADR 0015`
(AI-inferred levels are an authorization input with a human override),
`ADR 0014` (explicit, source-scoped guidance), `ADR 0002` (append-only audit
without event sourcing).

## Known limitations, stated rather than buried

- **A blocked Proposal *create* records no `EligibilityEvaluation`.** The CHECK
  permits exactly one target and the Proposal it would point at was never
  written. The `403` still names every blocking skill, so the refusal is fully
  explained; only the durable record is unavailable, and only a stored Proposal
  could anchor one. A blocked *version* does record it. Closing this needs a
  deliberate schema decision, not a workaround.
- **`MatchRanker` remains an unbound port** for Phase 1 matching. It is not on
  any Phase 0 path and its absence is a supported state.
- The gate proves contracts and behaviour, not visual rendering. Browser-level
  accessibility verification against the documented AT matrix (NVDA/Firefox,
  VoiceOver/Safari) is still a manual step; the automated assertions cover
  accessible names, live-region politeness, list semantics, and the absence of
  colour-only meaning.
