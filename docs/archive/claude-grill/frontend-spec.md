# ShareK — Frontend Spec

**Status:** APPROVED
**Date:** 2026-07-17
**Depends on:** `product-brief.md`, `prd.md`, `architecture.md`, `data-model-and-erd.md`
**Primary source:** `/spec.md` — a frontend-focused spec from a separate session. Its product/testing/API decisions are carried forward below; its paths are corrected (`sharek-frontend/**` → `frontend/**`, `bmad/_bmad-output/**` → `docs/archive/bmad-output/**`); its FR references are updated to this run's `prd.md` numbering (FR-06/07/08 added, FR-15 expanded with `CONTRIBUTION_DEMONSTRATED`, FR-40/42 extended with the rationale and n=3 rules).

**Important correction to `spec.md`'s framing.** `frontend/` is currently a bare TanStack Start scaffold: `router.tsx` plus two route files (`routes/index.tsx`, `routes/__root.tsx`), and `package.json` has only `@tanstack/react-router`, `@tanstack/react-start`, `react`, `react-dom` — no TanStack Query, no Zustand, no Tailwind, no shadcn/ui, no React Hook Form, no Zod, no Axios, no `modules/` folder at all. `spec.md` was written against a more-built, pre-monorepo-merge frontend (its "Modules — modify" list and cited prior art — `login.helpers.ts`, `profile-route-state.ts` — don't exist in this codebase; confirmed by search). Its diagnosis (fixed `AuthUserDto.role` enum, auth-gated public profile, subscription UI) described real problems in code that no longer exists. **Everything below is fresh build, informed by that diagnosis so the same mistakes aren't repeated — not a refactor.**

---

## 1. Screens (11 MVP, ranked)

1. **Public contributor profile** (`/profile/$username`, no auth) — highest priority, see §2.
2. Register / log in / password reset (FR-01, FR-04, FR-06)
3. Onboarding — optional GitHub connect, static checklist entry (FR-02, FR-17, FR-51)
4. Project discovery / list + filters (FR-25, FR-26)
5. Project detail — description, tasks, members (derived, no `ProjectMember` table — see `data-model-and-erd.md` §1), flat comments (FR-19–22, FR-24)
6. Task detail — apply + advisory AI fit note (FR-23, FR-27, FR-29, FR-30)
7. Owner: create/edit project, with-or-without-repo (FR-19, FR-20, FR-22)
8. Owner: applications inbox, accept/reject with reason (FR-28)
9. Workspace: evidence submission, links-only, typed (FR-31–33)
10. Owner: delivery review — approve / request changes / reject, PR-state display (FR-34, FR-35, FR-37)
11. Blind bilateral review form, 3 dimensions per side (FR-40)

Secondary/utility, not counted above: notifications list (FR-43), account settings (FR-08), minimal admin flag queue (FR-44, FR-45).

## 2. Public contributor profile — detailed spec

No login required. Fields, per `prd.md` FR-18/FR-42:

- Name, username, avatar, optional bio/location/languages.
- Skills, each showing its evidence state (`SELF_DECLARED` / `AI_INFERRED` / `CONTRIBUTION_DEMONSTRATED` / `ADMIN_REVIEWED`) — AI-inferred and contribution-demonstrated skills rendered **visibly separate**, never merged into one list, and the word "verified" never applied to an AI-inferred skill.
- Verified-contribution count (from `ReputationEvent`, computed at read time — never a stored counter).
- Per contribution: link to its evidence, the evidence type, and — for PR evidence — the `prState` label (`MERGED` / `ACCEPTED_NOT_MERGED` / `OPEN` / `CLOSED_WITHOUT_MERGE` / `UNVERIFIED` / `FLAGGED`), one click away from the claim it backs.
- Per-dimension ratings **with sample size**; below n=3 reviews for a dimension, show the raw individual reviews instead of a computed average (FR-42).
- Written reviews, with dates.
- Explicit labels for unreviewed (`UNREVIEWED` evidence) or flagged/contested items — never silently hidden.
- Contributor controls which optional fields (bio, location, availability) are public.
- Shareable URL, safe to paste into a job application.

## 3. Module map (fresh build, aligned to backend modules)

`frontend/src/modules/`:

| Module | Backend counterpart | Covers |
|---|---|---|
| `auth` | `identity` | Register/login/logout/refresh/settings (FR-01–08). Capability model from day one — no fixed `role` field to design around, since `data-model-and-erd.md` never has one. |
| `profiles` | `contributor-profiles`, `skill-profiles` | Public profile (§2), skill display with evidence-state ladder. |
| `projects` | `projects` | Create/edit/publish, with-or-without-repo, discovery/filters. |
| `tasks` | `contribution-tasks` | Task authoring, detail, flat comments. |
| `applications` | `applications` | Apply, withdraw, owner inbox, accept/reject, AI fit display. |
| `contributions` | `delivery-reviews` | Evidence submit (links-only, typed), owner delivery review, `UNREVIEWED` display. |
| `reviews` | `reviews` | Blind bilateral review form, window/expiry states. |
| `reputation` | `reputation` | Profile aggregation display (events → counts, n=3 rule). |
| `notifications` | `notifications` | Polled list, unread state. No WebSocket client. |
| `admin` | `admin` | Flag queue, invalidate-with-note, ban. |
| `github` | `github` | OAuth connect, repository listing for linking/profile context. On-demand only — no webhook UI, no activity feed. |

Cross-feature composition happens in route files only — a module never imports another module directly (repo-wide rule, `CLAUDE.md`). `routes/` stays routing/layout/loaders only, per the architecture already documented for this repo.

## 4. Cross-cutting decisions

- **Server state via TanStack Query; UI-only state via local React state or Zustand.** The auth mirror store is populated from the current-user query result, never fetched independently — no server data lives in Zustand otherwise.
- **Auth transport target: in-memory access token + httpOnly refresh cookie + refresh interceptor (FR-03).** This doesn't fully exist on the backend yet either (`/auth/refresh` currently expects the refresh token in the request body — `architecture.md` §1) — frontend should build against the target contract and coordinate the cutover with whoever picks up FR-03/ADR-005, not assume the cookie exists today.
- **Evidence is links-only.** No file-upload UI, no object storage, no signed URLs, no MIME/size validation anywhere in the frontend. Evidence type is a fixed enum with a label + short description per item (FR-31/32).
- **Advisory AI fit is display-only plus a triggering mutation — it never gates the apply action.** The apply button is always enabled; AI output shows a match range, cited evidence, and confidence, and is contestable (routes to `Flag`, FR-45).
- **No real-time surfaces.** Task comments, submission comments, and polled notifications are the entire coordination surface — no conversations, DMs, presence, typing indicators, or read receipts anywhere.
- **i18n-readiness now, translation later.** All user-facing strings behind translation keys, CSS logical properties throughout, no direction-specific styling. Ship English-only; Arabic user-entered content (names, descriptions, comments) must round-trip correctly even though the UI itself isn't localized yet (NFR-05).

## 5. Testing approach

A test asserts external, user-observable behavior — what a screen shows given a state, or the decision a helper makes — never internal call shapes.

**Seam:** extract route/orchestration decisions into `*.helpers.ts` / route-state modules, unit-tested with Vitest — no rendering, no MSW, by default. This establishes the convention `spec.md` described; there's no existing prior art in this codebase to point to yet, since `frontend/src` currently has no logic beyond a router shell. The first module built under this pattern becomes the reference for the rest.

**Modules needing a logic-seam test from day one** (each is a real decision, not incidental UI):

- Capability derivation (`OWNER`/`CONTRIBUTOR`/`APPLICANT` from project/application state — FR-07)
- Evidence-state → display-label mapping (FR-15)
- Blind-review window/expiry derivation, including lone-review-published labelling (FR-40)
- Reputation aggregation display rule — no average shown below n=3 (FR-42)
- "AI fit never blocks apply" gating logic (FR-29/30)
- Owner-silence / `UNREVIEWED` deadline derivation (FR-38)

If a component/MSW seam is added later, introduce it at the highest point (route/page rendered against a mocked HTTP layer) and only for the critical loop screens (apply, evidence submit, review) — keep seam count minimal. Coverage targets are `PROPOSED`, not asserted as achieved; full pyramid: `test-strategy.md` (pending).

## 6. API contract expectations (frontend's view — ratified in `api-contracts.md` next)

REST resources the frontend assumes exist: auth (register/login/logout/refresh/me, FR-01–06), github (connect/callback/repos), projects (CRUD/publish/link-repo), tasks (CRUD/comments), applications (submit/withdraw/list/accept/reject + AI fit output), contributions (evidence submit/update, delivery review approve/request-changes/reject), reviews (submit/list), reputation (`/users/:username/reputation`), public profile (`/users/:username`, unauthenticated), notifications (list/mark-read), admin (flags/invalidate/ban).

Record shapes the frontend renders directly (must match `data-model-and-erd.md` field-for-field):

- **ContributionEvidence**: `type, url, label, description, roleDescription, prState, ownerAttestationStatus, ownerAttestationAt, status, submittedAt, reviewDeadline, expiredAt`.
- **Review**: `scores (per-dimension), rationale, submittedAt, reviewWindowEndsAt, publishedAt, counterpartSubmitted, counterpartDidNotReview, publicationReason`.
- **UserSkill**: `skillName, evidenceState, confidence, contested`.

Any endpoint the frontend needs beyond this list is a gap to raise against `api-contracts.md` (next document), not something to invent client-side.

## 7. Out of scope

Matches `prd.md` §6 exactly — restated here for frontend-specific clarity: no real-time chat/WebSocket infrastructure of any kind; no file-upload/object-storage UI; no subscription/tier/premium/billing UI anywhere; no simulated-payment UI unless the rubric is later confirmed to require one; no AI-gating UI (no "blocked" state for an application); no multimodal/portfolio-vision or speech-to-text UI; no GitHub webhook-driven activity feed; no AI project assistant chat; no learning-roadmap generator (zero-evidence contributors get the static checklist, FR-17); no semantic/vector search UI (SQL-filter discovery only); no threaded discussions (flat task comments only); no full Arabic/RTL translation (readiness only).
