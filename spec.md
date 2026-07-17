# Spec: ShareK Frontend — MVP Alignment (Verified-Contribution Loop)

**Status:** `PROPOSED` (ready-for-agent — pending issue-tracker setup)
**Scope:** `sharek-frontend/**` only. The backend contract and root-level product docs are ratified elsewhere; this spec assumes the locked MVP decisions from the strategic-grilling session.
**Supersedes:** the old BMAD frontend direction in `bmad/_bmad-output/**` (premium tiers, AI validation gating, fixed account roles, admin-approval onboarding gate, subscription/usage entities) and the legacy `Sharek_Comprehensive_documentation.pdf`.

---

## Problem Statement

The current ShareK frontend was built toward an earlier product vision that the team has since rejected. As a user of this codebase (and of the product it renders), the problems are:

- **The app renders features the product no longer has.** There are routes and modules for a subscription/settings tier system, an admin-approval onboarding gate, a skill-profiles area that treats AI-inferred skills as first-class, and a role-typed account model — none of which belong to the agreed MVP.
- **The account model is wrong.** `AuthUserDto.role` is a fixed enum (`contributor | owner | admin`). The agreed product is a **capability model**: one person can own a project *and* contribute to another. A fixed role splits a real human into two accounts and blocks the core loop.
- **The core journey is not expressible end-to-end.** A contributor cannot today walk from *discover a task → see an advisory AI fit note → apply → get accepted → submit links-only evidence → receive an owner review → watch reputation update → see the verified contribution on a public profile*. Pieces exist in isolation; the loop does not close.
- **The public profile — the product's single most important output — is not built as a public, trust-carrying artifact.** It is auth-gated and does not surface evidence, PR merge state, blind-review results, or evidence-state labels in a way a logged-out hiring manager could read and believe.
- **There is no shared, product-truth vocabulary in the UI.** Copy and states drift from the locked domain terms (verified contribution, evidence state, blind review, advisory fit analysis, reputation event).

The team has a **fixed deadline (2026-08-30)** and **6 people**. Scope is the release valve; quality is not. The frontend must be reshaped to render exactly one complete, reliable loop and nothing that does not serve it.

## Solution

Reshape the existing TanStack Start frontend so it renders **one complete verified-contribution loop** and treats the **public contributor profile as the highest-priority screen**.

From the user's perspective, after this work:

- A visitor can **register, log in, and optionally connect GitHub**, and lands as a single account that can both own and contribute — no account-type choice, no admin-approval wait.
- A contributor can **discover projects and tasks** with plain filters, open a task, see an **advisory AI fit analysis** (a range, cited evidence, confidence — never a block), and **apply** with a message.
- An owner can **publish a project (with or without a repo), define tasks**, see incoming **applications with the AI fit note attached**, and **accept or reject with a reason**.
- An accepted contributor can **coordinate through task/submission comments** (no chat) and **submit links-only evidence** (PR, issue, deployment, Figma, Drive, video, docs, other) with an explicit type and a role description.
- An owner can **review submitted evidence** (approve / request changes / reject); if the owner goes silent, the submission auto-expires to **UNREVIEWED after 14 days** with reminders, and nobody's reputation is harmed.
- On approval, a **blind bilateral review** window opens (3 dimensions per side); reviews publish when both submit or the window expires — a lone submitted review still publishes, labelled that the counterpart did not review.
- Every approved contribution creates an **immutable reputation event**, and the **public profile** (no login required) shows the verified-contribution count, per-dimension ratings **with sample size**, demonstrated skills (from approved evidence only), and every claim **one click from its evidence**, with visible **evidence-state labels** (`MERGED`, `ACCEPTED_NOT_MERGED`, `OPEN`, `CLOSED_WITHOUT_MERGE`, `UNVERIFIED`, `FLAGGED`) and clear separation between AI-inferred and contribution-demonstrated skills.
- Removed features (subscriptions, tiers, chat, file uploads, AI gating, per-account admin approval) simply are not present.

## User Stories

**Authentication & account (capability model)**

1. As a visitor, I want to register with email and password, so that I can create a ShareK account.
2. As a visitor, I want to log in and be returned to where I intended to go, so that I can resume quickly.
3. As a user who forgot my password, I want to request a reset link, so that I can regain access.
4. As a registered user, I want a single account that can both own projects and contribute to others, so that I am not forced to pick an account type.
5. As a registered user, I want to optionally connect my GitHub account, so that my public activity can inform my profile — without it being mandatory to use the app.
6. As a user, I want to reach the app immediately after registering (no admin-approval wait), so that I am not blocked by a review queue.
7. As a user, I want my access token kept in memory and refreshed silently, so that my session persists without me re-logging in constantly.
8. As a user, I want to log out from anywhere, so that I can end my session on a shared machine.

**Onboarding**

9. As a new user, I want a short onboarding that offers GitHub connection and basic profile setup, so that I can start with a usable profile.
10. As a new contributor, I want a static first-contribution checklist with per-item progress I can tick, so that I understand the steps to a first open-source contribution.
11. As a new user, I want to skip optional onboarding steps, so that I can get to browsing projects fast.

**Public contributor profile (highest priority)**

12. As a logged-out hiring manager, I want to open a contributor's public profile by URL without signing in, so that I can evaluate a candidate directly from a link.
13. As a profile visitor, I want to see the contributor's verified-contribution count, so that I know how much real, approved work exists.
14. As a profile visitor, I want each contribution to link to its concrete evidence (e.g. the merged PR), so that I can verify the claim myself in one click.
15. As a profile visitor, I want to see the PR/evidence state label on each item (merged, accepted-not-merged, open, closed-without-merge, unverified, flagged), so that I can weigh how strong each piece of evidence is.
16. As a profile visitor, I want AI-inferred skills and contribution-demonstrated skills shown as visibly separate, so that I never mistake a guess for proof.
17. As a profile visitor, I want per-dimension ratings shown with their sample size, so that I can judge reliability of the average (and see raw reviews when the sample is tiny).
18. As a profile visitor, I want written reviews with dates, so that I can read qualitative signal, not just numbers.
19. As a profile visitor, I want unreviewed or disputed evidence clearly labelled, so that I do not over-trust unresolved items.
20. As a contributor, I want to control which optional fields on my profile are public, so that I manage my own exposure.
21. As a contributor, I want a shareable public profile link, so that I can paste it into a job application.

**Project discovery**

22. As a contributor, I want to browse a list of published projects, so that I can find somewhere to contribute.
23. As a contributor, I want to filter projects by technology, difficulty, beginner-friendly, and open-task availability, so that I can narrow to relevant work.
24. As a beginner, I want beginner-friendly projects flagged with a short "why this fits you" line, so that I can start where I have a chance of success.
25. As a contributor, I want to see whether a project has a linked repository or is pre-repository, so that I know what kind of work and evidence to expect.
26. As a contributor, I want to open a project and see its description, tasks, members, and comments, so that I can understand the context before applying.

**Project & task authoring (owner capability)**

27. As an owner, I want to create a project with or without an existing GitHub repository, so that I can start before code exists.
28. As an owner, I want to link a public GitHub repository and have metadata imported, so that I do not retype what GitHub already knows.
29. As an owner, I want to save a project as a draft and publish it when ready, so that I control visibility.
30. As an owner, I want to define tasks with title, description, required/optional skills, difficulty, deadline, beginner-friendly flag, and max contributors, so that applications target something concrete.
31. As an owner, I want to see and manage my own projects in one place, so that I can track what I have published.
32. As an owner, I want to edit or close a task, so that I can keep the board honest as work progresses.
33. As an owner, I want the task's state to be visible (open, assigned, in progress, in review, completed, cancelled), so that everyone sees where it stands.

**Application & advisory AI**

34. As a contributor, I want to apply to a task with an optional message and my relevant evidence, so that I can express interest against a defined scope.
35. As a contributor, I want to see an advisory AI fit analysis before/while applying — a match range, my strong skills, missing/uncertain requirements, cited evidence, and a confidence level — so that I understand my fit.
36. As a contributor, I want the AI to never block my application, so that a thin public history does not silently exclude me.
37. As a contributor, I want the AI note to state uncertainty and cite evidence, so that I can trust and, if needed, contest it.
38. As a contributor, I want to withdraw a pending application, so that I can change my mind before acceptance.
39. As an owner, I want an applications inbox for each task showing each applicant with their AI fit note attached, so that I can triage quickly.
40. As an owner, I want to accept or reject an application with a reason, so that the decision is accountable and the contributor gets feedback.
41. As a contributor, I want to be notified when my application is accepted or rejected, so that I know where I stand.

**Workspace coordination (no chat)**

42. As an accepted contributor, I want to join the project workspace and see my assigned task, so that I know what to do.
43. As a project member, I want to post and read comments on a task, so that I can coordinate without real-time chat.
44. As a project member, I want to comment on a submission, so that clarifications live next to the work.
45. As a project member, I want an activity history for the task, so that I can see what happened and when.

**Evidence submission (links-only)**

46. As a contributor, I want to submit evidence as an external link with an explicit type (GitHub PR, GitHub issue, live deployment, Figma, Google Drive, video, documentation, other), so that I can prove work without file uploads.
47. As a contributor, I want to add a short description of my individual role, so that shared work is attributed correctly.
48. As a contributor submitting a PR link, I want the system to show the detected PR state (merged / open / closed) and merge date, so that my evidence's strength is transparent.
49. As a contributor, I want to see my submission's review deadline and status, so that I know when to expect a decision.
50. As a contributor, I want to update or resubmit evidence when changes are requested, so that I can respond to owner feedback.

**Owner delivery review & owner-silence**

51. As an owner, I want to review a contributor's evidence and approve it, request changes, or reject it, so that I gate quality.
52. As an owner rejecting evidence tied to a PR that is actually merged, I want the item auto-flagged for admin review, so that I cannot quietly take free labor.
53. As an owner, I want to attest that non-code or not-yet-merged work was accepted, so that legitimate contributions still count, clearly labelled as owner-attested.
54. As a contributor, I want reminders sent to the owner before the 14-day review deadline, so that my work is less likely to be ignored.
55. As a contributor, I want my submission to become UNREVIEWED (with no reputation penalty) if the owner never responds within 14 days, so that owner silence does not harm me.
56. As a contributor, I want the profile to be able to show that an owner did not review a submission, so that the record is honest about what happened.

**Blind bilateral reviews**

57. As an owner, after approving a contribution, I want to submit a blind review of the contributor across three dimensions (quality, communication, reliability), so that I record structured feedback.
58. As a contributor, I want to submit a blind review of the owner across three dimensions (clarity, responsiveness, fairness), so that owners are also held accountable.
59. As a reviewer, I want my review hidden until both sides submit or the window expires, so that I am not influenced or retaliated against.
60. As a reviewer giving an extreme rating, I want to be required to write a rationale, so that outliers are explained.
61. As a participant, I want a lone submitted review to still publish at window expiry (labelled that the counterpart did not review), so that negative feedback cannot be hidden by refusing to reciprocate.
62. As a participant, I want published reviews to be immutable, so that the record cannot be quietly edited.

**Reputation & notifications**

63. As a contributor, I want an approved contribution to create a permanent reputation event reflected on my profile, so that my proof accumulates.
64. As a user, I want in-app notifications (polled, no websockets) for application decisions, evidence submitted, changes requested, contribution approved, review window opened, and review deadline approaching, so that I stay informed.
65. As a user, I want a notifications view I can open and mark items read, so that I can manage what needs attention.

**Skills**

66. As a contributor, I want my skills shown with explicit evidence states (self-declared, AI-inferred, contribution-demonstrated), so that viewers understand each skill's basis.
67. As a contributor, I want to add self-declared skills, so that I can represent skills GitHub cannot show.
68. As a contributor, I want to contest an AI-inferred skill I disagree with, so that I can flag it for correction.
69. As a contributor, I want the word "verified" to never be applied to an AI guess in the UI, so that my profile stays honest.

**Minimal admin**

70. As an admin, I want to see items flagged for review (e.g. rejected-but-merged evidence), so that I can investigate integrity issues.
71. As an admin, I want to invalidate a fraudulent review or evidence item with an audit note, so that the reputation record stays trustworthy.
72. As an admin, I want to ban an abusive user, so that I can protect the platform.

**Internationalization readiness**

73. As a developer, I want all user-facing strings externalized behind translation keys, so that Arabic/RTL can be added later without rewriting components.
74. As a user, I want to be able to enter Arabic content in names, descriptions, and comments, so that Arabic data works even while the UI is English-only.

## Implementation Decisions

**Modules — modify**
- `auth`: replace the fixed `role` account model with a **capability model**. A user is a single account; owner/contributor are contextual capabilities derived per project (project membership role: `OWNER | CONTRIBUTOR | APPLICANT`), not an account type. `admin` remains a system-level flag. Remove any owner-vs-contributor account-type branching (e.g. the login redirect that keys off account role) and re-express it in terms of capability/context. Existing `shouldEnsureContributorProfile`-style helpers must be re-derived from the new model.
- `contributors` / profile: make the **public profile route (`profile.$username`) accessible without authentication**. It becomes the highest-fidelity screen. Surface verified-contribution count, per-contribution evidence links, evidence-state labels, AI-inferred vs contribution-demonstrated skill separation, per-dimension ratings with sample size (no average shown below n=3), written reviews, and unreviewed/disputed labels.
- `skill-profiles`: realign to the evidence-state ladder (`SELF_DECLARED`, `AI_INFERRED`, `CONTRIBUTION_DEMONSTRATED`, and later states). Strip any "verified" language from AI inference. Keep it as a presentation of skills + states; the AI narrative call is a *simplify* item and may be deferred under the cut-order.
- `projects`: support create/edit with **pre-repository** as a status flag that disables repo-dependent UI; link-repository + metadata import; draft/publish; owner project management (`my-projects`). Project detail shows tasks, members, and a flat comment thread.
- `tasks`: task authoring (skills/difficulty/deadline/beginner-flag/max-contributors/states), task feed + filters, task detail with **apply** and the **advisory AI fit note**, and a flat task comment thread. No threaded discussion.
- `github`: OAuth connect + repository listing for linking and for profile context. On-demand only; **no webhooks, no activity feed** in MVP.
- `settings`: reduce to account basics (profile fields, GitHub connect/disconnect, account deletion). **Remove all subscription/tier/premium UI.**
- `dashboard`: reduce to a light post-login landing (my applications, my tasks, notifications summary) or fold into profile/explore — must not reintroduce owner/contributor dashboards from the old vision.

**Modules — add (frontend feature folders as needed)**
- `applications` (or within `tasks`): application submit, withdraw, owner inbox, accept/reject-with-reason, AI-fit display.
- `contributions` (evidence + delivery review): links-only evidence submit with type + role description; PR-state display; owner review (approve / request changes / reject); UNREVIEWED handling display.
- `reviews`: blind bilateral review form (3+3 dimensions), rationale-required-on-extreme, window/expiry states, lone-review-published labelling.
- `reputation`: profile aggregation display (events → counts, per-dimension averages with sample size).
- `notifications`: polled in-app notifications list + unread state. **No WebSocket client.**
- `admin`: minimal flag queue, invalidate-with-note, ban.

**Cross-cutting decisions**
- **Server state via TanStack Query**; UI-only state via local React state or Zustand; the auth mirror store stays populated from the current-user query for interceptors/route guards. No server data in Zustand.
- **Auth transport unchanged**: in-memory access token + httpOnly refresh cookie + refresh interceptor. Ratify, do not rebuild.
- Services stay thin framework-free HTTP calls; `api/queries` + `api/mutations` own caching/invalidation. Modules never import each other; cross-feature composition happens in route files. Import via module barrels only.
- **i18n readiness now, translation later**: externalize strings behind keys, use CSS logical properties, avoid direction-specific styles. Ship English-only; allow Arabic user content.
- **Evidence is links-only** — no file-upload UI, no object storage, no signed URLs, no MIME/size validation. Evidence type is an explicit enum with a label per item.
- **Advisory AI fit** is display + a mutation that requests analysis; it never gates the apply action. The apply button is always available. AI output shows range, cited evidence, and confidence, and is contestable.
- **No real-time surfaces**: task comments, submission comments, activity history, and polled notifications replace chat. No conversations/DMs/presence/typing/read-receipts.

**API contract (frontend expectations — to be ratified in the root/backend pass)**
- The frontend assumes REST endpoints for: auth (register/login/logout/refresh/me), github (connect/callback/repos), projects (CRUD/publish/link-repo/members), tasks (CRUD/comments), applications (submit/withdraw/list/accept/reject + assessment), contributions (evidence submit/update, delivery review approve/request-changes/reject), reviews (submit/list), reputation (`/users/:username/reputation`), public profile (`/users/:username` unauthenticated), notifications (list/mark-read), admin (flags/invalidate/ban).
- Evidence record shape carries: PR URL, PR state, merged flag, merge date, owner-attestation status, attestation date, verification status; and the state enum `MERGED | ACCEPTED_NOT_MERGED | OPEN | CLOSED_WITHOUT_MERGE | UNVERIFIED | FLAGGED`.
- Review record shape carries: `submittedAt`, `reviewWindowEndsAt`, `publishedAt`, `counterpartSubmitted`, `counterpartDidNotReview`, `publicationReason`.
- Submission carries: `submittedAt`, `reviewDeadline`, `expiredAt`, and an `UNREVIEWED` state.
- Any endpoint the frontend needs that is not yet in the contract goes to `docs/design/api-contract-additions.md` for backend handoff (existing convention in this repo).

## Testing Decisions

- **A good test asserts external, user-observable behavior, not implementation details** — the decision a helper makes, or what a screen shows given a state, never internal call shapes.
- **Seam commitment is DEFERRED** (open decision). Default until decided: keep the repo's existing highest seam — **extract route/orchestration decisions into `*.helpers.ts` / route-state modules and unit-test them with Vitest**, no rendering, no MSW. Prior art: `src/routes/_authLayout/login.helpers.ts` + `login.test.tsx`, and `src/routes/_appLayout/profile-route-state.ts` / `profile-auth.helpers.ts` + `profile.$username.test.tsx` (these are already excluded from route generation via `tsr.config.json`).
- **Modules that must be tested at the logic seam:** the capability/redirect derivation replacing the old role logic; evidence-state → label mapping; blind-review window/expiry state derivation (including lone-review-published labelling); reputation aggregation display rules (no average below n=3); AI-fit "never blocks apply" gating logic; owner-silence/UNREVIEWED deadline derivation.
- If the deferred decision later adds a component/MSW seam, it should be introduced at the highest point (route/page rendered against a mocked HTTP layer) and only for the critical loop screens (apply, evidence submit, review), to keep seam count minimal.
- Targets are `PROPOSED`; do not assert coverage numbers as achieved.

## Out of Scope

- Real-time chat and all WebSocket infrastructure (conversations, DMs, presence, typing, read receipts, message attachments).
- File uploads / object storage / signed URLs (evidence is links-only).
- Subscription tiers, premium plans, commissions, usage/application caps, and any billing UI.
- Simulated payment flows (unless the ITI rubric is later confirmed to require a payment demo).
- AI application gating (binary ELIGIBLE/INELIGIBLE blocking) and any multi-agent orchestration UI.
- Multimodal portfolio/certificate vision analysis and speech-to-text UI.
- GitHub webhooks, activity feed, and AI commit summaries.
- AI project assistant (RAG chat) and learning-roadmap generation.
- Semantic/vector project search (SQL-filter discovery only in MVP).
- Threaded discussions (flat task comments only), teammate endorsements, strict screening mode, full dispute workflow, maintainer role.
- Full Arabic/RTL translation (readiness only: externalized strings, logical properties).
- Per-account admin approval / onboarding review gate.
- Backend implementation, Prisma schema, and the AI `AiPort` internals (owned by the backend/root passes; this spec only consumes the contract).

## Further Notes

- **Deletion/replacement:** the old BMAD frontend artifacts under `bmad/_bmad-output/**` (subscription/usage/AI-validation entities, premium-tier and AWS-deployment sprints, fixed-role journeys) are superseded by this spec but should not be deleted as part of this feature — flag them in the root pass's `migration-notes.md` instead.
- **Cold-start dependency:** the public profile and the loop screens are only demonstrable against real seeded data (≥5 owners, ≥10 projects, tasks). Seeding is a product/root task; the frontend must render believably with real content, and the profile must be presentable to ≥3 hiring-side reviewers before final submission (their answers become validation evidence in the presentation).
- **Cut-order under deadline pressure (2026-08-30):** if time runs short, drop in this order — (1) file uploads [already out], (2) real-time chat [already out], (3) premium/subscription [already out], (4) advanced AI skill inference (fall back to self-declared + rule-based skills), (5) non-essential AI (keep only advisory fit), (6) full Arabic/RTL [readiness only]. The public profile and the closing of the loop are the last things to cut.
- **Blocked skill step:** publishing to a project issue tracker with a `ready-for-agent` triage label is not possible until `/setup-matt-pocock-skills` is run (no tracker/label vocabulary configured; only remote is `github.com/ITI-Sharek/Frontend`). This spec is written to file; promote it to an issue when the tracker is set up.
