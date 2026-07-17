# ShareK — Epics and Stories

**Status:** APPROVED
**Date:** 2026-07-17
**Depends on:** `prd.md`, `architecture.md`, `data-model-and-erd.md`, `frontend-spec.md`, `api-contracts.md`
**Replaces:** `docs/archive/bmad-output/sharek-backlog.md` and `docs/archive/bmad-output/user-stories-and-journeys/sprint-{1..8}-*.md`

Five epics, sequenced by dependency and delivery slice. Every story cites the `prd.md` FR(s) it satisfies. Status is `PROPOSED` unless a specific note says otherwise — almost nothing in E2 onward exists in code yet (`architecture.md` §2). "Owner" is a role from the team allocation (`product-brief.md` §6: Frontend — Karim Muhammad, Ahmed Lotfi; Backend — Amr AboKhalid, Abdullah Elsaman, Hatem Mahmoud; AI — Tadrs, Amr AboKhalid; Testing — Ahmed Lotfi (UI), Abdullah Elsaman (backend); DevOps — Amr AboKhalid, Karim Muhammad), not a per-story individual assignment — that's a team scheduling decision, not this document's to make.

---

## E1 — Foundation

Goal: a user can register, optionally connect GitHub, and an owner can publish a project that a contributor can discover. Nothing here proves the loop yet — it makes the loop possible.

| ID | Story | FRs | Acceptance criteria | Status | Owner |
|---|---|---|---|---|---|
| E1-01 | Register with email/password | FR-01 | Account created, password hashed | `IN_DEVELOPMENT` — real endpoint exists | Backend |
| E1-02 | Log in, session established | FR-01, FR-04 | Access + refresh tokens issued | `IN_DEVELOPMENT` | Backend |
| E1-03 | Password reset | FR-06 | Single-use, time-limited reset link | `PROPOSED` | Backend |
| E1-04 | Capability model — no fixed `role` field | FR-07 | Registration payload has no `role`; `User.role` enum removed; `ADMIN` is the only account-level role | `PROPOSED` — confirmed real gap, `architecture.md` §5 | Backend |
| E1-05 | Auth transport: httpOnly refresh cookie | FR-03 | `/auth/refresh` reads the cookie, not the body | `PROPOSED` — confirmed real gap | Backend |
| E1-06 | Account settings (profile fields, GitHub connect/disconnect, delete) | FR-08 | No subscription/tier UI anywhere | `PROPOSED` | Frontend |
| E1-07 | GitHub OAuth connect, read-only/public scope | FR-02 | `public_repo` scope only, no private repo access | `IN_DEVELOPMENT` — real, already correct | Backend |
| E1-08 | Publish a project with a linked repo | FR-19 | Metadata imported, owner reviews before publish | `PROPOSED` | Backend |
| E1-09 | Publish a project without a repo (`PRE_REPOSITORY`) | FR-20 | Repo-dependent UI disabled until linked | `PROPOSED` | Backend |
| E1-10 | Staff-curated cold-start project sourcing | FR-21 | Uses E1-08's flow as-is; staff/trusted owner becomes owner of record, full loop applies | `PROPOSED` — process, not new code | Backend |
| E1-11 | Project/repository status fields | FR-22 | Full status enums present | `PROPOSED` | Backend |
| E1-12 | Discovery via SQL filters | FR-25 | No semantic search; filters by tech/difficulty/beginner-friendly/deadline | `PROPOSED` | Backend |
| E1-13 | Beginner-friendly recommendations | FR-26 | Templated one-line "why," no free-generated text | `PROPOSED` | Backend |
| E1-14 | Register/login/reset screens | FR-01, FR-04, FR-06 | — | `PROPOSED` | Frontend |
| E1-15 | GitHub connect UI | FR-02 | Optional, skippable | `PROPOSED` | Frontend |
| E1-16 | Project create/publish UI | FR-19, FR-20, FR-22 | Both with-repo and pre-repo paths | `PROPOSED` | Frontend |
| E1-17 | Discovery list + filters UI | FR-25, FR-26 | — | `PROPOSED` | Frontend |

## E2 — Verified contribution loop

**This epic proves the product.** Everything else is secondary to closing this loop end-to-end at least once.

| ID | Story | FRs | Acceptance criteria | Status | Owner |
|---|---|---|---|---|---|
| E2-01 | Task creation and board | FR-23 | Skills/difficulty/deadline/beginner-flag/states | `PROPOSED` | Backend |
| E2-02 | `applications` module — build from scratch | FR-27, FR-28 | Apply/accept/reject-with-reason; **module currently has no service/controller** | `PROPOSED` | Backend |
| E2-03 | `AiPort` interface + in-process implementation | ADR-003 | Replaces `FastApiSkillProfileClient`; no separate service | `PROPOSED` | AI + Backend |
| E2-04 | Advisory application fit analysis | FR-29 | Range + evidence + confidence + prompt/model version; never blocks accept flow | `PROPOSED` | AI + Backend |
| E2-05 | Screening modes (`ADVISORY` default, `STRICT` opt-in) | FR-30 | Even in strict mode, no permanent auto-hide without owner override + audit trail | `PROPOSED` | Backend |
| E2-06 | Evidence submission, links-only, typed | FR-31, FR-32, FR-33 | 8 evidence types; CV/work-sample as links, not uploads | `PROPOSED` | Backend |
| E2-07 | PR evidence states + on-demand validation | FR-34, FR-36 | 6-state enum; no webhooks | `PROPOSED` | Backend |
| E2-08 | Auto-flag on owner-abuse pattern | FR-35 | Closed-without-merge + owner-accepted → `Flag` | `PROPOSED` | Backend |
| E2-09 | Owner delivery review | FR-37 | Approve / request changes / reject | `PROPOSED` | Backend |
| E2-10 | Owner-silence 14-day SLA | FR-38 | Scheduled expiry job, no reputation penalty on expiry, reminder notification | `PROPOSED` | Backend + DevOps (job scheduling) |
| E2-11 | `reviews` module — build from scratch | FR-39, FR-40 | **Module doesn't exist at all today** | `PROPOSED` | Backend |
| E2-12 | Blind bilateral review, 3 dims/side, expiry-publish-one | FR-40 | Extreme rating requires rationale; lone review still publishes | `PROPOSED` | Backend |
| E2-13 | Skill evidence-state ladder incl. `CONTRIBUTION_DEMONSTRATED` | FR-15, FR-16 | Auto-upgrade on approved contribution; admin review is independent, manual | `PROPOSED` | Backend |
| E2-14 | Immutable reputation events | FR-41 | Append-only, no mutable counters | `PROPOSED` | Backend |
| E2-15 | Public profile aggregation, n=3 rule | FR-42 | Raw reviews shown below sample size 3, never a bare average | `PROPOSED` | Backend |
| E2-16 | **Public contributor profile screen** | FR-18, FR-42 | No login required; evidence one click away; skill-state separation; unreviewed/flagged labels — see `frontend-spec.md` §2 | `PROPOSED` — highest-priority frontend screen | Frontend |
| E2-17 | Task detail + apply + AI fit note UI | FR-23, FR-27, FR-29, FR-30 | Apply button always enabled regardless of AI output | `PROPOSED` | Frontend |
| E2-18 | Owner applications inbox UI | FR-28 | AI fit note attached per applicant | `PROPOSED` | Frontend |
| E2-19 | Evidence submission UI | FR-31, FR-32, FR-33 | No file-upload control anywhere | `PROPOSED` | Frontend |
| E2-20 | Owner delivery review UI | FR-34, FR-37 | PR-state label visible | `PROPOSED` | Frontend |
| E2-21 | Blind bilateral review form UI | FR-40 | Hidden until window closes or both submit | `PROPOSED` | Frontend |

## E3 — Supporting

Goal: the loop can be coordinated and moderated without chat or a heavy dispute system.

| ID | Story | FRs | Acceptance criteria | Status | Owner |
|---|---|---|---|---|---|
| E3-01 | Task comments, flat thread | FR-24 | No nesting/threading | `PROPOSED` | Backend + Frontend |
| E3-02 | `notifications` module — build from scratch | FR-43 | **No distinct module exists today** | `PROPOSED` | Backend |
| E3-03 | Notification events wired to the loop | FR-43 | Application decisions, evidence submitted/approved, review window opened, deadline approaching | `PROPOSED` | Backend |
| E3-04 | Notifications list UI, polled | FR-43 | No WebSocket client | `PROPOSED` | Frontend |
| E3-05 | Contest flag (evidence / review / skill claim) | FR-45 | One flat `OPEN`/`RESOLVED` state, not a 5-state workflow | `PROPOSED` | Backend |
| E3-06 | Admin flag queue, invalidate, ban | FR-44 | Audit note required on invalidate | `PROPOSED` | Backend + Frontend |

## E4 — Beginner-lite

Goal: a contributor with nothing to show yet still has somewhere useful to go.

| ID | Story | FRs | Acceptance criteria | Status | Owner |
|---|---|---|---|---|---|
| E4-01 | Static first-contribution checklist | FR-51 | Fixed curated content, per-user checkbox progress, not AI-generated | `PROPOSED` | Backend + Frontend |
| E4-02 | Zero-evidence fallback routing | FR-17 | No GitHub signal → same checklist + templated recs as everyone else, no dead end | `PROPOSED` | Backend |
| E4-03 | Optional skill-narrative LLM call | FR-14 | Simpler than full skill inference; behind the same `AiPort` | `PROPOSED` | AI |

## E5 — Hardening

Goal: the loop is demonstrable against real data and holds up under scrutiny.

| ID | Story | FRs / refs | Acceptance criteria | Status | Owner |
|---|---|---|---|---|---|
| E5-01 | E2E test of the full loop | `test-strategy.md` (pending) | Register → publish → apply → accept → evidence → review → reputation → public profile | `PROPOSED` | Testing |
| E5-02 | 30-case AI golden set | FR-14, FR-29 | Covers skill inference + fit analysis | `PROPOSED` | AI + Testing |
| E5-03 | Cold-start seed data | `seed-and-validation-plan.md` (pending) | ≥5 owners, ≥10 projects, tasks each | `PROPOSED` | Backend + DevOps |
| E5-04 | i18n-readiness audit | NFR-05 | No hardcoded strings, logical CSS properties, Arabic content round-trips | `PROPOSED` | Frontend + Testing |
| E5-05 | Hiring-manager profile validation | `seed-and-validation-plan.md` (pending), `product-brief.md` §7 | ≥3 hiring-side reviewers, 5-question protocol, captured for the presentation | `PROPOSED` | Whole team |
| E5-06 | Security/NFR pass | NFR-03, NFR-04 | Rate limiting, least-privilege scopes, data-deletion support | `PROPOSED` | Backend + DevOps |
| E5-07 | CI pipeline | — | Lint/test/build on every push | `PROPOSED` | DevOps |
| E5-08 | Observability-lite | NFR-06 | Correlation IDs across frontend → NestJS → queue → AI call | `PROPOSED` | Backend + DevOps |

---

## Sequencing note

E1 has no dependency on E2. E2 depends on E1 (needs auth + a publishable project + a discoverable task). E3 depends on E2 existing (comments/notifications attach to tasks and applications that E2 creates). E4 depends only on E1 (the checklist/recommendations don't need the loop to be built, just discovery). E5 depends on E2 + E3 both being real, since it validates the loop and needs believable seed data flowing through it. Reasonable to run E1 and E4 in parallel; E2 is the critical path everything else waits on.
