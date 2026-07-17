# ShareK — Migration Notes

**Status:** APPROVED — this document is the record itself, not a proposal
**Date:** 2026-07-17
**Purpose:** one place to see exactly what changed, from what, and why, so any reviewer can trust that `product-brief.md` through `docs/adr/` supersedes everything older — not by assertion, but by a traceable contradiction → resolution accounting.

---

## 1. Document lineage

| Era | Location now | Vintage | Authority |
|---|---|---|---|
| Legacy "Gold Tier" pitch (PDF/DOCX) | `docs/archive/bmad-legacy-docs/` | January 2026 | Historical only |
| First BMAD-generated set (PRD, 20-entity ERD, 2 ADRs, backlog, 8 sprints) | `docs/archive/bmad-output/` | Locked 2026-06-17 | Historical only |
| — including its own self-correction | `docs/archive/bmad-output/sharek-ai-architecture-token-efficient-guide.md` | 2026-07-11 | Historical, but credited below — it already argued for pgvector over Pinecone and a cost-optimized advisory cascade before this run existed |
| ShareK Master Product and Technical Brief v2 | `docs/archive/ShareK_Master_Product_and_Technical_Brief_v2.md` | July 2026, self-labelled "draft for strategic grilling" | Historical only — see §2, it's also partially superseded by LOCKED DECISIONS |
| `/spec.md` (separate frontend-focused session) | Repo root | July 2026, predates the monorepo merge | Decisions absorbed into `frontend-spec.md`; its stale paths (`sharek-frontend/**`, `bmad/_bmad-output/**`) were corrected, not carried forward |
| LOCKED DECISIONS (this `/grill-with-docs` run's brief, plus four grilled resolutions) | Embodied across every document below | 2026-07-17 | **Authoritative** |

## 2. Contradiction → resolution (condensed from the full Reconciliation Report)

Full detail was presented and confirmed at the start of this run; this is the durable record.

| Topic | Old position | Survives | Recorded in |
|---|---|---|---|
| AI application gating | Binary block (legacy PDF's "core differentiator," old BMAD's hard ERD constraint) | Advisory only, never blocks | `prd.md` FR-29/30, ADR-014 |
| Contributor account activation | Admin pre-approves ≥1 skill before active (old BMAD `USER.status`) | No per-account gate; admin review only relabels a skill's evidence state | `prd.md` FR-16 (Q1), ADR-014 |
| AI agent count | 4 named agents, LangGraph Supervisor (legacy PDF, old BMAD) | 1 advisory fit-analysis feature (+ optional skill-narrative call), behind `AiPort` | `architecture.md` §3, ADR-003 |
| Vector DB | Pinecone (legacy PDF, old BMAD ERD/backlog/sprints 1-3) | pgvector, dormant — SQL filters only | `data-model-and-erd.md`, ADR-011 |
| Subscriptions/tiers | Bronze/Silver/Gold, hard limits, entire Sprint 6 (legacy PDF, old BMAD) | Rejected outright | `prd.md` §6, ADR-013 |
| Real-time chat | Absent from old BMAD; **added** by the v2 Brief | Rejected | `prd.md` §6, ADR-007 |
| Evidence type | PR link + uploaded portfolio files (legacy PDF); PR link only (old BMAD); files reintroduced (v2 Brief) | Links-only, typed, expanded taxonomy | `prd.md` FR-31/32 (Q3), ADR-006 |
| Owner review timeout | No field exists anywhere in old BMAD | Net-new: 14-day auto-`UNREVIEWED` | `prd.md` FR-38, ADR-009 |
| Reviews | Unilateral, non-blind, 1 number (old BMAD) → bilateral/blind/7-dim (v2 Brief) | Bilateral/blind/3-dim, expiry-publish-one | `prd.md` FR-40, ADR-010 |
| Reputation display | Single `overall_rating` float (old BMAD) | Multi-signal, n=3 floor before showing an average | `prd.md` FR-42 |
| Disputes | Rich 5-state `DISPUTE` entity, OQ-003 left the mechanics open (old BMAD) | Simplified: contest flag + reason + admin note — **resolves old PRD's OQ-003** | `prd.md` FR-45, `data-model-and-erd.md` `Flag` |
| Multimodal AI | Vision + Speech-to-Text, claimed "✅Complete" (legacy PDF only — never in old BMAD's actual data model) | Deferred pending rubric verification | `prd.md` §6 |
| Arabic/RTL | Full bilingual + RTL as MVP (legacy PDF, old BMAD, v2 Brief all agree) | Deferred; i18n-ready, English-only ship; `preferredLanguage` field itself kept | `prd.md` NFR-05, ADR-012 |
| Admin dashboard depth | Old PRD's OQ-001, left open | Minimal (invalidate/ban/view flags) — **resolves OQ-001** | `prd.md` FR-44 |
| Payment provider | Old PRD's OQ-002, left open | Real payments rejected; simulated only if rubric-forced — **resolves OQ-002** | `prd.md` §6, ADR-013 |
| Module count | 23 modules (v2 Brief) vs. legacy's implied sprawl | ~12–14, matching what's actually buildable | `architecture.md` §2 |

## 3. Code-reality findings — verified, not assumed

These required reading actual code/schema, not just comparing documents. Two were confirmed real gaps; two were corrections in the *other* direction (an old doc, or an earlier claim made mid-session, turned out to be wrong about what the code does).

| Finding | Verdict | Where tracked |
|---|---|---|
| A live `FastApiSkillProfileClient` calling a separate FastAPI service, no `AiPort` anywhere | **Real, confirmed gap** | ADR-003 |
| `User.role` required fixed enum (`owner\|contributor\|admin`), set directly from the registration payload | **Real, confirmed gap** — also independently flagged by `/spec.md`'s frontend session, converging on the same defect from two directions | ADR-015 |
| `POST /auth/refresh` reads the refresh token from the request body, not an httpOnly cookie | **Real, confirmed gap** | ADR-005 |
| `User.status` defaults to `pending` on registration | **Corrected mid-session** — this is an email-verification gate with a deliberate contributor carve-out, not an admin-approval gate. Nothing reads `SkillProfile.status` to block anything, because `applications` has no code yet. Not a contradiction of FR-16. | `architecture.md` §5 (includes the correction inline, transparently) |
| Contributor GitHub OAuth scope | **The old version of `api-contracts.md` was wrong**, not the code — it claimed the broad `repo` scope; the real default is `public_repo` (public repos only), already consistent with NFR-04 | `api-contracts.md` §4 |
| `Subscription`, `UsageTracker`, `AiMatchResult`, `SkillGapGuidance`, `Dispute` models exist in `schema.prisma` | Confirmed **zero references** anywhere in `src/modules/**` — dead weight, droppable with no application-code impact | `architecture.md` §7, ADR-013 |
| `AiValidationResult`/`AiValidationDecision` (binary gating shape) exists in `schema.prisma` | Confirmed **anticipated but never built** — `applications` has no service/controller at all | `architecture.md` §7, ADR-014 |

No schema or code changes were made in this documentation run — every item above is tracked as a concrete task for whoever picks up that module next, cross-referenced from `epics-and-stories.md` E1/E2.

## 4. Grilling resolutions (2026-07-17, `product-brief.md` review)

Four product questions came up when the human reviewer read the first draft and pushed back with real ideas. Each was resolved by grilling — recommendation given, confirmed, one at a time — not decided unilaterally.

| # | Question | Resolution |
|---|---|---|
| Q1 | Does admin review of a GitHub-derived skill gate the account? | No — it relabels the skill's evidence state (`AI_INFERRED → ADMIN_REVIEWED`) only. `prd.md` FR-16. |
| Q2 | Auto-import external GitHub repos when there aren't enough real owners? | Bounded, staff-curated — reuses the ordinary project-creation flow, staff/trusted owner becomes owner of record, full loop applies. Not an automated, ongoing, ownerless feature. `prd.md` FR-21. |
| Q3 | Should contributors be able to upload a CV/work-sample file? | No — covered by the existing evidence-type taxonomy as links (title + description + URL), consistent with the links-only decision. `prd.md` FR-32. |
| Q4 | What happens to a contributor with zero GitHub evidence? | Routes into the existing static checklist + templated recommendations — no new roadmap-generation feature. `prd.md` FR-17. |

## 5. Docs folder cleanup

Two passes. The first (while writing this doc set) was grep-only for several files — treating "no keyword hit" as "fine" wasn't a real review, and the user caught that. The second pass actually read every remaining file in full and reconciled a naming-scheme inconsistency neither pass had caught until the file was read end to end.

**Deleted** (`git rm`, recoverable from history — not archived, because their core content was wholesale wrong, not just stale in places): `current-state-and-next-steps.md` (falsely claimed a Next.js frontend), `module-development-tracker.md`, `selected-repos-ai-skill-profiling-plan.md`, `implementation-roadmap.md` (all built around the rejected admin-gating model).

**Archived, pass 1** (moved, real historical value): `docs/bmad/docs/*` → `docs/archive/bmad-legacy-docs/`; `docs/bmad/_bmad-output/*` → `docs/archive/bmad-output/`; `ShareK_Master_Product_and_Technical_Brief_v2.md` → `docs/archive/`.

**Archived, pass 2** (moved after being read in full):

- `database-plan.md` → `docs/archive/database-plan.md` — its central claim ("pgvector is enough for MVP semantic use cases: project discovery... matching") directly contradicts ADR-011. Not a reference to fix, its thesis is wrong now.
- `docs/ai-agents/` (all 4 files) + `member-ownership.md` → `docs/archive/ai-agents/`, `docs/archive/member-ownership.md` — the whole set organizes the team as anonymous `M1`–`M6` role codes, never reconciled with the real names in `product-brief.md` §6 (confirmed with the user this scheme is simply old, not a parallel system to merge). `m2-ai-engineer.md`'s entire scope was owning the separate FastAPI repo — core content, not incidental.
- `sprints/sprint-01-backend-foundation.md` → `docs/archive/sprint-01-backend-foundation.md` — cross-references (old FR-IDs from the archived PRD, old backlog task IDs, links into the now-archived `ai-agents/`) were all broken; its actual content (Docker/Prisma/health-endpoint foundation) is superseded by `epics-and-stories.md` E1.

**Fixed in place, pass 2** (small reference corrections — the surrounding content was current and worth keeping): `backend-conventions.md` and `definition-of-done.md` (removed dead references to the deleted module-development-tracker.md); `developer-architecture-guide.md` and `ai-agent-rules.md` (the "AI calls a FastAPI client" line updated to describe the `AiPort` target instead — both are practical how-to-build guidance, so they should describe the direction being built toward, unlike the two operational docs below); `sprint-template.md` (removed the hardcoded `M2/M4/M5/M6` owners table, genericized it, removed the dead tracker section); `postman-api-guide.md` (fixed a broken path into the now-moved `bmad-output` ADR, and corrected the "pending until admin approves" sentence to match `api-contracts.md` §5's precise language — the underlying job-status behavior was always fine, only the description of it implied a gate that doesn't exist).

**Left in place, deliberately not fixed:** `ai-agent-rules.md`'s and this pass's remaining mentions are corrected above; `docs/local-development.md` and `docs/team-onboarding.md` still describe the current, real `AI_SERVICE_URL`/FastAPI local-dev setup — accurate to what's actually running today. Unlike the "how to build" guidance docs, these are "how to run what exists right now" docs — rewriting them before the ADR-003 code change actually happens would describe a setup that doesn't exist yet, which is worse than being one step behind.

**Untouched by design:** `docs/bmad/.agents/`, `docs/bmad/_bmad/`, `docs/skills/sharek-backend-architect/` — tool scaffolding, not documentation content.

## 6. The new doc set

| Doc | Purpose |
|---|---|
| `product-brief.md` | Problem, personas, north-star metric, non-goals, risks |
| `prd.md` | FR-01–51, NFR-01–06, permission matrix, out-of-scope register |
| `architecture.md` | Ratified stack, module map, `AiPort` design, domain events, known schema gaps |
| `data-model-and-erd.md` | 14-entity target schema, 5 state machines, relationship diagram |
| `frontend-spec.md` | 11 MVP screens, module map, testing seam, i18n rules |
| `api-contracts.md` | Implemented-endpoint documentation (corrected) + `PROPOSED` core-loop endpoints |
| `epics-and-stories.md` | E1–E5, ~50 stories, every one FR-traced |
| `docs/adr/` (13 ADRs + index) | Every architecturally-significant decision, individually justified |
| `test-strategy.md` | Backend/frontend pyramid, 30-case AI golden set |
| `seed-and-validation-plan.md` | Cold-start checklist, hiring-manager validation protocol |
| `migration-notes.md` | This document |

## 7. What's still genuinely open

- All the real code/schema changes listed in §3 — none were made in this documentation-only pass.
- The follow-up doc edits listed in §5.
- `prd.md` §7's list of strategic questions (from `Sharek_questions.txt`) that remain unanswered even after LOCKED DECISIONS — business model, exact GitHub permission scopes, matching-philosophy tradeoffs, reputation decay, most of privacy/governance, all scale/cost numbers. None block MVP build; all matter before any post-MVP planning.
