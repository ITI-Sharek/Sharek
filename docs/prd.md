# ShareK — Product Requirements Document

**Status:** APPROVED
**Date:** 2026-07-17
**Replaces:** `docs/archive/bmad-output/planning-artifacts/prds/prd-Grad_Project-2026-06-17/prd.md`
**Depends on:** `product-brief.md`

Status vocabulary used throughout: `PROPOSED`, `APPROVED`, `DESIGNED`, `IN_DEVELOPMENT`, `IMPLEMENTED`, `TESTED`, `DEPLOYED`, `DEFERRED`, `REJECTED`. Nothing below is marked `IMPLEMENTED`/`TESTED`/`DEPLOYED` without file-level code evidence cited inline; where I've directly verified something against the running `backend/` code, that's noted.

---

## 1. Goals and background

ShareK proves one loop: owner publishes → contributor discovers → AI advises → owner accepts → contributor delivers evidence → owner reviews → peers review each other → reputation updates → public profile shows it. Everything in this PRD either advances that loop directly (MVP), advances it in a cheaper form (Simplify), is explicitly deferred (Post-MVP), or is explicitly cut (Rejected) — see §7 for the full register. Full problem framing, personas, and north-star metric: `product-brief.md`.

This PRD also resolves four open product questions raised during grilling (2026-07-17), each referenced by tag below:

- **[Q1]** Admin review of AI-inferred skills relabels evidence state; it does not gate account activation.
- **[Q2]** Cold-start project sourcing from external GitHub repos is staff-curated (staff/trusted early owners become the owner of record), not an automated ownerless import.
- **[Q3]** CV and work-sample evidence are links (title + description + URL), not uploaded files.
- **[Q4]** A contributor with no GitHub-derived skill evidence falls into the existing static checklist and templated beginner recommendations — no new roadmap-generation feature.

**Refined 2026-07-17** against `/spec.md` (a frontend-focused spec from a separate session, predating the monorepo merge — its path references to `sharek-frontend/**` and `bmad/_bmad-output/**` are stale, its product decisions are not). Added: password reset (FR-06), the capability model as an explicit FR (FR-07), account settings (FR-08), the `CONTRIBUTION_DEMONSTRATED` skill-evidence state (FR-15/16), extreme-rating rationale (FR-40), the n=3 reputation display floor (FR-42), and contestable skills (FR-45).

---

## 2. Personas and journeys

### Primary: Beginner contributor

Doesn't know which project fits, whether they're ready, or how to prove the result. Primary journey (the north-star loop, contributor side):

```text
Register / log in
  -> Connect GitHub (optional but recommended)
  -> System analyzes public repos -> AI-inferred skill profile [FR-14]
     (no usable GitHub evidence -> static checklist + templated recs instead [FR-17, Q4])
  -> Browse/discover projects and tasks [FR-24, FR-25]
  -> Apply to a task [FR-27]
  -> See advisory AI fit analysis [FR-29]
  -> Owner accepts
  -> Submit individual evidence (links only) [FR-33]
  -> Owner reviews evidence [FR-37]
  -> Blind bilateral review opens [FR-40]
  -> Reputation event created [FR-43]
  -> Public profile shows the verified contribution [FR-45]
```

### Secondary: Project owner

Needs structured publishing, a manageable applicant queue, and reliable evidence before trusting someone with real work.

```text
Register / log in -> connect GitHub (optional) or none
  -> Publish project (with or without a repo) [FR-19, FR-20]
  -> Create tasks [FR-23]
  -> Review applications (advisory AI fit analysis attached) [FR-28, FR-29]
  -> Accept / reject with reason [FR-28]
  -> Review submitted evidence [FR-37]
  -> Rate the contributor (blind, 3 dimensions) [FR-40]
```

### Later, not MVP: hiring manager / client

Consumes the public profile only. Validated pre-launch per `seed-and-validation-plan.md`; not an active account type.

---

## 3. Functional Requirements

Each FR: statement, status, which loop step it advances, acceptance criteria, priority.

### Authentication and accounts

**FR-01 — Email/password registration and login.**
Status: `APPROVED`. Loop step: entry point. AC: user registers with email+password, can log in, password is hashed (never plaintext). Priority: MVP.

**FR-02 — GitHub OAuth connection (read-only scopes only).**
Status: `IN_DEVELOPMENT` — `github/services/github-oauth.service.ts` and `github/controllers/github-oauth.controller.ts` exist in the running code; scope/permission-boundary not independently re-verified here. Loop step: enables skill inference. AC: no repository write scope requested; user can connect/disconnect. Priority: MVP.

**FR-03 — Session transport: in-memory access token + httpOnly refresh cookie.**
Status: `DESIGNED`, **not yet matching code** — `POST /auth/refresh` currently reads `refreshToken` from the request body (`identity/dto/refresh-session.request.ts`), not a cookie. This FR requires a backend change: move refresh-token transport to an httpOnly cookie. See ADR-005. Loop step: entry point. AC: access token never touches persistent client storage; refresh token is httpOnly, not readable by JS. Priority: MVP.

**FR-04 — Logout / session revocation.**
Status: `IN_DEVELOPMENT` — `session.controller.ts` has a working `/auth/logout` endpoint gated by `AccessTokenGuard`. Loop step: entry point. Priority: MVP.

**FR-05 — Role assignment (USER / ADMIN).**
Status: `IN_DEVELOPMENT` — `PATCH /auth/users/:id/role` exists, admin-only via `RolesGuard`. Loop step: supports admin capability. Priority: MVP.

**FR-06 — Password reset.**
Status: `APPROVED`. Loop step: entry point. AC: user requests a reset link by email; link is single-use and time-limited. Priority: MVP.

**FR-07 — Capability model: `OWNER` / `CONTRIBUTOR` / `APPLICANT` are per-project contextual roles, not a fixed account type.**
Status: `APPROVED`. Loop step: entry point, cross-cutting. AC: one person can own a project and contribute to another simultaneously, on a single account — there is no account-type selection at registration and no separate owner/contributor account. `ADMIN` remains the only account-level (system) role; `OWNER`/`CONTRIBUTOR`/`APPLICANT` are derived per project from membership/application state, never stored as a fixed field on the user. Priority: MVP. This corrects a real defect already present in the existing frontend scaffold (`AuthUserDto.role` as a fixed `contributor | owner | admin` enum) — see `migration-notes.md`.

**FR-08 — Account settings: profile fields, GitHub connect/disconnect, account deletion.**
Status: `APPROVED`. Loop step: entry point. AC: no subscription/tier/premium settings exist anywhere in this surface. Priority: MVP.

### Skill profiling and onboarding

**FR-14 — Skill inference from GitHub stats + one labelled LLM call.**
Status: `APPROVED`. Loop step: enables discovery/matching/fit-analysis. AC: inference runs once per GitHub connect (not continuous polling); output includes skill name, estimated level, confidence, evidence references, model+prompt version. Priority: MVP (Simplify — cost-bounded to one LLM call, not a multi-agent pipeline).

**FR-15 — Skill evidence states: `SELF_DECLARED` / `AI_INFERRED` / `CONTRIBUTION_DEMONSTRATED` / `ADMIN_REVIEWED`.**
Status: `APPROVED`. Loop step: profile trust signal. AC: every skill on a profile shows exactly one state, reflecting its strongest evidence source. `SELF_DECLARED` is the floor (the contributor claims it, nothing backs it yet). `AI_INFERRED` comes from FR-14's GitHub-stats + LLM inference. `CONTRIBUTION_DEMONSTRATED` is set **automatically** the first time an approved contribution (FR-37) required that skill — no human action needed, it falls directly out of the loop closing. `ADMIN_REVIEWED` is set **manually** when an admin reviews an `AI_INFERRED` claim (FR-16). These last two are independent upgrade paths from `AI_INFERRED`, not a strict ladder — a skill can carry either or both. The word "verified" is never used for AI inference alone. Priority: MVP.

**FR-16 — Admin review of an AI-inferred skill relabels it `ADMIN_REVIEWED`; it does not gate account activation or task eligibility.** **[Q1]**
Status: `APPROVED`. Loop step: profile trust signal. AC: a contributor with zero admin-reviewed skills can register, browse, and apply immediately — no `pending` account state exists for contributors. Admin action changes only the skill's displayed evidence state. Priority: MVP. Explicitly supersedes the old BMAD model where `USER.status` stayed `pending` until admin approved ≥1 skill (`docs/archive/bmad-output/ERD/USER.md:58`) — see `migration-notes.md`.

**FR-17 — Zero-evidence fallback: no usable GitHub signal routes to the static first-contribution checklist and templated beginner recommendations, not an error or dead end.** **[Q4]**
Status: `APPROVED`. Loop step: onboarding. AC: a contributor with no GitHub connection, or a connected account with no public repos/contribution history, sees the same static checklist (FR-51) and beginner-recommendation flow (FR-26) as everyone else — no separate "roadmap" content is generated for this case. Priority: MVP. Note: a dynamic, preference-sequenced learning roadmap is explicitly `DEFERRED` (Post-MVP "learning library + AI ranking" — see §7).

**FR-18 — Public profile.**
Status: `APPROVED`. Loop step: end of loop. AC: shows name/username, skills with evidence states, completed contributions, PR links + merge state, owner-attested contributions, ratings + written reviews, dates, technologies, and explicit labels for unreviewed/disputed evidence. No login required to view. Priority: MVP — flagged in `product-brief.md` and `seed-and-validation-plan.md` as the single highest-priority screen.

### Projects

**FR-19 — Publish a project with a linked GitHub repository.**
Status: `APPROVED`. Loop step: supply. AC: owner enters a public repo URL, system imports metadata (languages, description, stats) for owner review before publish. Priority: MVP.

**FR-20 — Publish a project without a repository (`PRE_REPOSITORY` status).**
Status: `APPROVED`. Loop step: supply. AC: owner can describe a project manually; commit/PR/activity features stay disabled until a repository is later linked. Priority: MVP.

**FR-21 — Staff/trusted-owner project sourcing from external GitHub repos during cold start.** **[Q2]**
Status: `APPROVED`. Loop step: supply, cold-start bridge. AC: a ShareK team member (or an early trusted owner) creates a project via the **same** FR-19 flow, pointing at a real external repo they've selected, and becomes the owner of record — full accept/review/rate/reputation loop applies with no exceptions. This is explicitly a bounded operational practice (see `seed-and-validation-plan.md`), not a standalone automated feature. No ownerless project state, no ownerless task, no ownerless reputation event exists anywhere in this model. Priority: MVP (as a process, using existing FR-19 — no new mechanism to build). An ongoing, automatic, loop-disconnected "here's something to try externally" suggestion feature is a separate, `DEFERRED` idea — see §7.

**FR-22 — Project statuses and repository statuses.**
Status: `APPROVED`. AC: project — `DRAFT/PUBLISHED/ACTIVE/PAUSED/COMPLETED/ARCHIVED/CANCELLED`; repository — `NONE/PENDING_LINK/CONNECTED/SYNC_ERROR/DISCONNECTED`. Priority: MVP.

### Tasks

**FR-23 — Task creation with skills, difficulty, deadline, beginner-friendly flag, states.**
Status: `IN_DEVELOPMENT` — `contribution-tasks` module exists in `backend/src/modules/`. Loop step: supply. AC: states `DRAFT/OPEN/SCREENING/ASSIGNED/IN_PROGRESS/IN_REVIEW/COMPLETED/CANCELLED/ARCHIVED`. Priority: MVP.

**FR-24 — Task comments (one flat thread per task).**
Status: `APPROVED`. Loop step: collaboration. AC: no nested/threaded replies — flat, chronological. Priority: MVP (Simplify — replaces "Discussion" as a full module).

### Discovery

**FR-25 — Discovery via SQL filters (technology, difficulty, beginner-friendly, deadline, open-task availability).**
Status: `APPROVED`. Loop step: discovery. AC: no semantic/vector search in MVP — pgvector stays dormant (ADR-011). Priority: MVP.

**FR-26 — Beginner-friendly recommendations: flag + filter + templated "why."**
Status: `APPROVED`. Loop step: discovery, onboarding. AC: every recommended task shows a templated one-line reason (e.g., "beginner-friendly, matches your React evidence"); no free-generated explanation text. Priority: MVP (Simplify).

### Applications and AI fit analysis

**FR-27 — Contributor applies to a task.**
Status: `APPROVED`. Loop step: core loop. AC: states `DRAFT/SUBMITTED/AI_ANALYSIS_PENDING/OWNER_REVIEW/ACCEPTED/REJECTED/WITHDRAWN/EXPIRED`. Priority: MVP.

**FR-28 — Owner accepts or rejects an application, with a reason.**
Status: `APPROVED`. Loop step: core loop. Priority: MVP.

**FR-29 — Advisory AI fit analysis (single feature; optional simpler skill-narrative call).**
Status: `APPROVED`. Loop step: core loop. AC: runs behind a NestJS `AiPort` (ADR-003), via BullMQ; stores score/range, matched/missing requirements, evidence references, confidence, model+prompt version; owner always sees the full application regardless of AI output — AI never blocks. Priority: MVP.

**FR-30 — Screening modes: `ADVISORY` (default) / `STRICT` (owner opt-in, later config flag) / no binary AI gating ever.**
Status: `APPROVED`. Loop step: core loop. AC: even in strict mode, AI cannot permanently hide an application without an explicit owner override and an audit trail. Priority: MVP (Simplify — `STRICT` as config flag only, `MANUAL_ONLY` mode deferred). Directly rejects the old BMAD model where ineligible applications were hard-blocked from the owner (`docs/archive/bmad-output/ERD/_ERD-Overview.md:464`) — see ADR-014 and `migration-notes.md`.

### Evidence and delivery review

**FR-31 — Evidence is links only; no file uploads.**
Status: `APPROVED`. Loop step: core loop. AC: every evidence item has an explicit type (`GITHUB_PR / GITHUB_ISSUE / LIVE_DEPLOYMENT / FIGMA / GOOGLE_DRIVE_DOC / VIDEO_DEMO / DOCUMENTATION_LINK / OTHER`), a label, a short description, and a URL. No storage/scanning/signed-URL infrastructure exists. Priority: MVP. See ADR-006.

**FR-32 — CV and work samples are links, not uploads.** **[Q3]**
Status: `APPROVED`. Loop step: profile trust signal / evidence. AC: a CV is an optional profile-level link field (e.g., hosted PDF on Drive/personal site). A "work sample" uses the same evidence-type taxonomy as FR-31 (title + description + URL, typically `LIVE_DEPLOYMENT`, `VIDEO_DEMO`, `GOOGLE_DRIVE_DOC`, or `OTHER`) — not a distinct upload mechanism. Priority: MVP.

**FR-33 — Contributor submits individual evidence per task assignment.**
Status: `APPROVED`. Loop step: core loop. AC: one evidence record belongs to one contributor; a shared PR may be linked by several contributors, each explaining their individual role. Priority: MVP.

**FR-34 — PR evidence states: `MERGED / ACCEPTED_NOT_MERGED / OPEN / CLOSED_WITHOUT_MERGE / UNVERIFIED / FLAGGED`.**
Status: `APPROVED`. Loop step: core loop. AC: a PR is strong evidence if merged OR the owner explicitly attests acceptance; state is always shown publicly. Priority: MVP. See ADR-008.

**FR-35 — PR-closed-but-owner-accepted auto-flags for admin review.**
Status: `APPROVED`. Loop step: integrity guard. AC: the combination (GitHub state = closed without merge) AND (owner attestation = accepted) creates a `FLAGGED` evidence state and a queue item for admin. Priority: MVP. See ADR-008.

**FR-36 — On-demand PR validation via GitHub API (no webhooks).**
Status: `APPROVED`. Loop step: core loop. AC: deterministic checks only (PR belongs to task's repo, contributor authored it, state/merge status) — not LLM-based. Priority: MVP (Simplify).

**FR-37 — Owner delivery review: approve / request changes / reject.**
Status: `IN_DEVELOPMENT` — `delivery-reviews` module exists in `backend/src/modules/`. Loop step: core loop. Priority: MVP.

**FR-38 — Owner-silence 14-day SLA.**
Status: `APPROVED`. Loop step: core loop, reliability. AC: fields `submittedAt, reviewDeadline, expiredAt`; scheduled expiry job flips unreviewed submissions to `UNREVIEWED`; no reputation event fires on expiry; reminder notification(s) sent before the deadline; repeated owner silence may trigger a reliability flag. Priority: MVP. See ADR-009. Net-new — no equivalent field exists anywhere in the old BMAD `DELIVERY_REVIEW` entity.

### Reviews

**FR-39 — Reviews module (peer bilateral review).**
Status: `PROPOSED` — no `reviews` module exists yet in `backend/src/modules/`; this is new build, not a rename. Loop step: core loop. Priority: MVP.

**FR-40 — Blind bilateral reviews, 3 dimensions per side, fixed window, publish-one-on-expiry.**
Status: `APPROVED`. Loop step: core loop. AC: reviews stay hidden until both parties submit or the window expires; if only one submits by expiry, it publishes labelled "Counterpart did not submit a review"; submitted reviews are never deleted for the other side's non-participation; non-submitters get no completion incentive; an extreme rating (top or bottom of scale) requires a written rationale before it can be submitted; published reviews are immutable except through admin invalidation (FR-44). Priority: MVP. See ADR-010.

### Reputation

**FR-41 — Immutable, append-only reputation events.**
Status: `APPROVED`. Loop step: end of loop. AC: `reputation` module exists in code; events are never overwritten, only appended — aggregate scores are always derived from the event log. Priority: MVP.

**FR-42 — Public profile reputation display with sample size, not a single number.**
Status: `APPROVED`. Loop step: end of loop. AC: shows multiple signals (approved contributions, ratings, written reviews) plus how many data points back each one — never collapses to one score. Concretely: no per-dimension numeric average is displayed below a sample size of 3 — below that threshold, the raw individual reviews are shown instead of a computed average, so a single review can't masquerade as a stable rating. Priority: MVP.

### Notifications

**FR-43 — In-app, polled notifications (no WebSocket, no email in MVP).**
Status: `APPROVED`. Loop step: cross-cutting. AC: covers application status, evidence submitted/approved, review window opened, deadline approaching, owner-silence reminder. Priority: MVP.

### Admin

**FR-44 — Minimal admin: invalidate review/evidence, ban user, view flags.**
Status: `IN_DEVELOPMENT` — `admin` module exists in `backend/src/modules/`. Loop step: integrity guard. Priority: MVP.

**FR-45 — Contest flag + reason + admin note (simplified dispute).**
Status: `APPROVED`. Loop step: integrity guard. AC: a contributor or owner can flag a specific evidence/review/AI-output item **or an AI-inferred skill claim** with a reason; an admin resolves with a note; no multi-stage dispute workflow (`open/under_review/upheld/overturned/dismissed`) — that richer old-BMAD model is explicitly simplified. Priority: MVP.

### Beginner onboarding

**FR-51 — Static first-contribution checklist with per-user checkboxes.**
Status: `APPROVED`. Loop step: onboarding. AC: fixed, curated content (not AI-generated); progress is per-user, optionally private. Priority: MVP (Simplify).

---

## 4. Non-Functional Requirements

**NFR-01 — Performance.** Non-AI API P95 < 500ms under normal demo load; search < 1s. Status: `PROPOSED` (targets, not yet measured — no fabricated SLAs).

**NFR-02 — Reliability.** GitHub outage does not stop non-GitHub workflows; AI outage falls back to manual owner review (AI is advisory, so "falls back" means the owner simply proceeds without a fit analysis); queue jobs use bounded retries + dead-letter queue. Status: `PROPOSED`.

**NFR-03 — Security.** Modern password hashing; rate limiting; input validation; least-privilege GitHub scopes (no repo-write); audit logging on admin actions. Status: `PROPOSED`.

**NFR-04 — Privacy.** Public-repo analysis only in MVP (no private repos); GitHub disconnect supported; data-deletion requests supported; no source code sent to an external AI provider beyond what's already public. Status: `PROPOSED`.

**NFR-05 — Accessibility / i18n-readiness (not full localization).** All UI strings externalized via translation keys, no hardcoded text; CSS logical properties used throughout (no hardcoded `left`/`right`); MVP UI ships English-only. Semantic HTML, keyboard navigation, visible focus, contrast compliance. Status: `PROPOSED`. Full Arabic/RTL is `DEFERRED` — see ADR-012.

**NFR-06 — Observability-lite.** API latency, error rate, queue depth, AI latency/cost/override rate tracked with correlation IDs across frontend → NestJS → queue → AI call. Status: `PROPOSED`. No Langfuse/5-metric dashboard — replaced by the 30-case golden set (`test-strategy.md`).

---

## 5. Permission matrix

Capability model (FR-07): system roles `USER`, `ADMIN` live on the account; `OWNER`, `CONTRIBUTOR`, `APPLICANT` are derived per project, never a fixed account type. The same person is `OWNER` on one project and `CONTRIBUTOR` on another, on one account.

| Capability | Guest | User | Applicant | Contributor | Owner | Admin |
|---|---:|---:|---:|---:|---:|---:|
| View public projects & profiles | Yes | Yes | Yes | Yes | Yes | Yes |
| Publish project | No | Yes | Yes | Yes | Yes | Yes |
| Apply to task | No | Yes | Yes | Yes | Yes | Yes |
| View private task workspace | No | No | Limited | Yes | Yes | Yes |
| Post task comment | No | No | Limited | Yes | Yes | Yes |
| Create task | No | No | No | No | Yes | Yes |
| Review applications / accept / reject | No | No | No | No | Yes | Yes |
| Submit evidence | No | No | No | Yes | No | Yes |
| Approve/reject delivery | No | No | No | No | Yes | Yes |
| Submit bilateral review | No | Eligible only | Eligible only | Eligible only | Eligible only | No |
| Flag / contest an item | No | Yes | Yes | Yes | Yes | Yes |
| Resolve a flag, ban, invalidate | No | No | No | No | No | Yes |
| Elevate a skill to `ADMIN_REVIEWED` | No | No | No | No | No | Yes |

---

## 6. Out-of-scope register

### Rejected (not MVP, not Post-MVP — cut deliberately)

| Item | Reason |
|---|---|
| Subscription tiers, commissions, daily/monthly caps | Removes schedule risk and a two-sided pricing problem the team hasn't validated demand for |
| Simulated payments (unless rubric-forced) | Real payments require providers, fraud checks, refunds, tax — far outside a fixed-deadline capstone; simulation only if literally required for evaluation |
| AI application gating (binary block) | Contradicts "AI advises, accountable humans decide" — the core trust principle of the whole product |
| Multi-agent Supervisor orchestration | One advisory fit-analysis feature is enough to prove the loop; 4-agent orchestration is unvalidated complexity |
| Multimodal portfolio/certificate vision, speech-to-text | No multimodal capability is needed to prove the loop; the old "Gold Tier" framing that required it is explicitly rejected (`product-brief.md` §8) |
| MCP/IDE extension | Stretch-goal scope with no bearing on the loop |
| Pinecone | pgvector (dormant) already covers eventual semantic-search needs without a second vector store |
| Per-account admin approval gate | Friction without loop benefit — trust comes from the evidence/review loop itself (see FR-16, **[Q1]**) |
| "Verified" label from AI inference alone | Evidence discipline — AI output is advisory and cited, never "verified" |
| Heavy LLM-as-judge / Langfuse / 5-metric dashboard | Replaced by a 30-case golden-set spreadsheet — proportionate to team size |
| CV/work-sample file uploads | Reintroduces the #1 cut-order item's cost (storage, scanning, access control) for a need already met by links (FR-32, **[Q3]**) |

### Post-MVP (deferred, not rejected)

| Item | Reason |
|---|---|
| Real-time chat / WebSockets | Coordination via task comments + notifications proves the loop first; chat is real schedule risk |
| GitHub webhooks + activity feed | On-demand validation (FR-36) is sufficient for MVP; webhooks add infra complexity |
| AI commit summaries, AI project assistant (RAG) | Neither is required to prove one complete contribution loop |
| Threaded discussions | Flat task comments (FR-24) are enough for MVP coordination |
| Learning library + AI ranking, dynamic personalized roadmap | Zero-evidence contributors use the existing static checklist instead (FR-17, **[Q4]**) |
| Ongoing automated ownerless GitHub-repo suggestions | Cold start is solved by staff-curated sourcing instead (FR-21, **[Q2]**); an automated, loop-disconnected version is a real feature for later, not a stopgap |
| Semantic/pgvector search | SQL filters (FR-25) are sufficient at MVP scale; pgvector stays dormant |
| Email notifications | In-app polling (FR-43) covers MVP; email adds a delivery-reliability dependency |
| Teammate endorsements | Not required to prove owner↔contributor trust |
| Full dispute workflow (5-state) | Contest flag + admin note (FR-45) is proportionate to expected MVP dispute volume |
| Strict screening as a first-class mode | `STRICT` exists as a config flag (FR-30); a fuller strict-mode UX is later work |
| Maintainer role, advanced project states | `OWNER`/`CONTRIBUTOR`/`APPLICANT` is enough to prove the loop |
| Full Arabic/RTL | i18n-readiness ships in MVP (NFR-05); full localization is a translation/QA pass, not architecture |

---

## 7. Open questions this PRD does not resolve

Carried forward from `docs/Sharek_questions.txt` (145-question original interview set) — genuinely unanswered even after LOCKED DECISIONS, listed here so they aren't silently lost: exact business model / who pays (Q10-17), precise GitHub permission scopes beyond "read-only, no repo-write" (Q63-75), matching-philosophy tradeoffs beyond skill-alignment (Q76-85), reputation decay/transfer across technologies (Q91-92), most of privacy/governance beyond what NFR-04 states (Q98-108), and all scale/cost/success-criteria numbers (Q127-145). None of these block MVP build — they're flagged for the team to answer before any post-MVP planning.
