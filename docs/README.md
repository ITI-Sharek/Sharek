# ShareK Docs

Operating manual for the whole repo (`backend/` + `frontend/`).

## Product and planning

| File | Purpose |
| --- | --- |
| `product-brief.md` | Problem, personas, north-star metric, non-goals, risks. Start here. |
| `prd.md` | 51 functional requirements, NFRs, permission matrix, out-of-scope register. |
| `architecture.md` | Backend architecture, module map, `AiPort` design, known schema gaps. |
| `data-model-and-erd.md` | 14-entity target schema, state machines, relationship diagram. |
| `frontend-spec.md` | Frontend module map, 11 MVP screens, testing seam, i18n rules. |
| `api-contracts.md` | Documented real endpoints (corrected) + proposed core-loop endpoints. |
| `epics-and-stories.md` | 5 epics, ~50 FR-traced stories, sequencing. |
| `adr/` | 13 ADRs, numbered continuing from the archived `bmad-output` set. |
| `test-strategy.md` | Backend/frontend test pyramid, 30-case AI golden set. |
| `seed-and-validation-plan.md` | Cold-start seeding checklist, hiring-manager profile validation. |
| `migration-notes.md` | The full contradiction → resolution log, code-reality findings, and doc-cleanup record for this whole run. Read this if you want to know *why* something changed. |

## Backend conventions (current, generic NestJS practice — not tied to product scope)

| File | Purpose |
| --- | --- |
| `developer-architecture-guide.md` | Where backend files belong and how to build a feature, step by step. |
| `backend-conventions.md` | Naming, controller/service responsibilities, DTO safety, Prisma rules. |
| `folder-structure.md` | Canonical module folder layout. |
| `ai-agent-rules.md` | Before-editing / implementation / verification / handoff checklist for coding agents. |
| `definition-of-done.md` | Checklist required before a backend task is considered complete. |
| `local-development.md` | Docker, environment, database, Redis, local startup. Its AI-service section still describes the pre-ADR-003 setup (real, current code) — will need updating once that migration actually happens, not before. |
| `team-onboarding.md` | First-run checklist and `.env` sharing rules. Same AI-service caveat as above. |
| `postman-api-guide.md` | Postman request catalog for the real, currently-implemented endpoints. |
| `sprint-template.md` | Template for planning a sprint. |
| `examples/module-skeleton.md` | Copyable sample module shape. |
| `skills/sharek-backend-architect/` | Repo-local Codex skill for backend agents. |
| `agents/issue-tracker.md`, `agents/domain.md` | Engineering-skill config (issue tracker, domain-doc layout) — see root `CLAUDE.md`. |

## Reference / open questions

- `Sharek_questions.txt` — the original 145-question strategic interview. `prd.md` §7 tracks which of these remain genuinely open after the LOCKED product decisions.

## Archive (superseded, kept for history — never authoritative)

- `archive/bmad-legacy-docs/` — the original "Gold Tier" pitch documents (PDF/DOCX).
- `archive/bmad-output/` — the first BMAD-generated PRD, 20-entity ERD, 2 ADRs, backlog, 8 sprint files, plus the AI architecture guide that first argued against Pinecone.
- `archive/ShareK_Master_Product_and_Technical_Brief_v2.md` — the intermediate product brief this run reconciled against.
- `archive/database-plan.md` — its central claim (pgvector active for MVP discovery/matching) contradicts ADR-011.
- `archive/member-ownership.md` + `archive/ai-agents/` (4 files) — the `M1`–`M6` anonymous role-code scheme, never reconciled with the real team allocation in `product-brief.md` §6; `m2`'s scope was entirely about owning the now-superseded separate FastAPI repo.
- `archive/sprint-01-backend-foundation.md` — cross-references (old FR-IDs, old backlog task IDs, links into the archived `ai-agents/`) were all broken; content is superseded by `epics-and-stories.md` E1.

Full accounting of every change, including what was corrected rather than just archived: `migration-notes.md`.

Three docs were deleted outright rather than archived, because their core content was wholesale wrong (not just stale), and there's no historical value in a doc that never described anything real: `current-state-and-next-steps.md` (claimed a Next.js frontend — never true), `module-development-tracker.md`, `selected-repos-ai-skill-profiling-plan.md`, `implementation-roadmap.md`. Recoverable from git history if ever needed.

## Source of truth order

1. `prd.md` functional requirement IDs (`FR-NN`).
2. `adr/` — architecturally significant, hard-to-reverse decisions.
3. `architecture.md` / `data-model-and-erd.md` / `api-contracts.md` / `frontend-spec.md`.
4. The backend-conventions docs listed above.
5. `archive/` — historical only, never authoritative.
