# ShareK — Product Brief

**Status:** APPROVED
**Date:** 2026-07-17
**Supersedes:** `docs/archive/bmad-legacy-docs/Sharek_Comprehensive_documentation.pdf` (legacy "Gold Tier" positioning) and the problem framing in `docs/archive/bmad-output/planning-artifacts/prds/prd-Grad_Project-2026-06-17/prd.md`. Full contradiction-by-contradiction accounting: `migration-notes.md`.

---

## 1. Problem

ShareK addresses a two-sided problem, not a single pain point:

- **Beginner contributors** cannot easily find real open-source work suited to their level, cannot tell in advance whether they're qualified, and have no credible way to prove they did the work once they've done it. A GitHub profile shows activity, not collaboration quality, review outcomes, or reliability.
- **Project owners** — the supply-side bottleneck — have more useful tasks than reliable help, and no fast, trustworthy way to screen who's actually capable versus who merely applied.

Without ShareK, a beginner's evidence of skill is scattered across repos nobody reviews for signal, and an owner's only screening tool is a cold GitHub profile.

## 2. Primary user and the supply bottleneck

- **Primary MVP user: the beginner contributor.** The product optimizes first for someone who doesn't know which project fits, whether their skills are enough, how to talk to a maintainer, or how to prove the result afterward.
- **Secondary MVP user / supply bottleneck: the project owner.** Owner capacity to publish tasks and review evidence gates the entire loop — there is no contributor-side success without an owner on the other end of it.
- **Later user (not MVP): hiring managers/clients** who consume the public reputation record. Their trust in that record is validated pre-launch (§7) but they are not an active MVP persona.

## 3. Differentiated artifact

Not a repo host, not a Slack clone, not a subscription marketplace. The artifact ShareK produces is **the structured, evidence-backed contribution record** — the audit trail connecting a specific task to a specific piece of individual evidence to an owner's approval to a peer-reviewed outcome to an immutable reputation event. This is the one thing GitHub, Upwork, and LinkedIn each partially show and none fully assembles.

The record is built by exactly one loop (the north-star loop):

```text
Owner publishes project + task
    -> Contributor discovers task
    -> AI gives advisory fit analysis
    -> Contributor applies
    -> Owner accepts
    -> Contributor submits evidence
    -> Owner reviews evidence
    -> Reputation updates
    -> Verified contribution appears on the public profile
```

A feature that does not strengthen this loop is not MVP material — it is Simplify, Post-MVP, or Rejected (see `prd.md`'s out-of-scope register).

## 4. North-star metric

**Verified Contributions Completed per Month.**

A contribution counts only when all of the following hold:

1. The contributor was accepted onto the task.
2. Individual evidence was attached (links only — see ADR-006).
3. The owner approved the work.
4. The work is not under an unresolved dispute/flag.
5. A reputation event was created as a result.

Registrations, applications submitted, and AI calls made are not success by themselves — they are funnel steps, tracked separately (see `test-strategy.md` and the quality metrics list in `prd.md`).

## 5. Explicit non-goals (MVP)

Every non-goal below has a one-line reason; the full register with status per item lives in `prd.md`'s out-of-scope section.

| Non-goal | Why |
|---|---|
| Repo hosting, replacing GitHub branches/PRs/CI | GitHub already does this; duplicating it dilutes the differentiated artifact | 
| Real-time chat / WebSockets | Coordination happens via task/submission comments and notifications until the trust loop works E2E; chat is schedule risk without proving the core loop first |
| File-upload evidence | Links-only keeps evidence externally verifiable and avoids building a storage/scanning pipeline before the loop is proven |
| Subscriptions, commissions, real payments | Simulated demo only if the rubric forces it; a paid tier is a distraction until organic demand is validated |
| AI eligibility gating (binary block) | AI is advisory everywhere; only accountable humans (owners, admins) change business state |
| 3+ AI agents / multi-agent orchestration | Deferred pending rubric verification — one advisory fit-analysis feature is the MVP AI surface |
| Full Arabic/RTL UI | English-only MVP ships faster; i18n-readiness (externalized strings, logical CSS properties) is built in from day one so the localization pass later isn't a rewrite |
| Company/organization accounts, team-based applications | Adds a tenancy dimension the 6-person team and the deadline don't support; individuals-only keeps the reputation record attributable to one person |
| Per-account admin approval gate before activation | Adds friction and a single point of failure without strengthening the trust loop; trust is earned through the evidence/review loop itself, not a pre-approval gate |

## 6. Constraints

- **Deadline (fixed):** 2026-08-30.
- **Team of 6:** Frontend — Karim Muhammad, Ahmed Lotfi; Backend — Amr AboKhalid, Abdullah Elsaman, Hatem Mahmoud; AI — Tadrs, Amr AboKhalid; Testing — Ahmed Lotfi (UI), Abdullah Elsaman (backend); DevOps — Amr AboKhalid, Karim Muhammad.
- **Scope is the release valve; quality is not.** If time runs short, cut in this fixed order: (1) file uploads, (2) real-time chat, (3) premium subscription, (4) advanced AI skill inference, (5) non-essential AI agents, (6) full Arabic/RTL. Nothing on this list is currently in MVP scope to begin with (see §5) — this order governs what stays cut if a Simplify-tier item threatens the deadline.

## 7. Risks and mitigations

### Cold start
No projects means no contributors; no contributors means no owners willing to publish. **Mitigation:** seed ≥5 real owners and ≥10 real public projects with 1-3 tasks each before demo (ShareK team projects, ITI grad/cohort capstones, trusted colleagues), each with a captured owner commitment to actually review submissions. Full checklist: `seed-and-validation-plan.md`.

### Reputation-consumer trust (does anyone believe the profile?)
A reputation system nobody outside the platform trusts has no value as a differentiated artifact. **Mitigation:** before final submission, show the public contributor profile to ≥3 hiring-side people and record their answers to: (1) Do you trust this? (2) Which claims look unsupported? (3) What's missing? (4) Would it help you evaluate a candidate? (5) Are evidence links clear? This validation is a required input to the final presentation, not optional polish. Protocol: `seed-and-validation-plan.md`.

### Fake reputation / collusion
Friends creating fake projects to rate each other would poison the signal. **Mitigation:** reputation requires individual evidence tied to an owner-reviewed task (not membership alone); PRs closed/rejected on GitHub but marked owner-accepted are auto-flagged for admin review (ADR-008); reputation events are immutable and append-only (no silent recalculation that hides manipulation).

### AI false negatives discouraging good contributors
Because AI is advisory-only (not gating), a false "weak match" cannot block an application — the owner always sees it. This is a design mitigation, not a monitoring one: see ADR-014.

### Scope explosion (rebuilding GitHub + Jira + Slack + Upwork + LinkedIn at once)
The single biggest risk surfaced across every prior version of this product's documentation (legacy PDF, old BMAD set, and the v2 Brief all show scope creep in different directions — see `migration-notes.md`). **Mitigation:** the non-goals in §5 are enforced, not aspirational; the cut-order in §6 is the pre-agreed release valve.

## 8. Explicit supersession

This brief replaces the legacy PDF's positioning outright. Rejected, not merely deferred: the "Gold Tier — Industry-Leading (90-100%)" rubric-compliance framing and its ✅-Complete table (16/16 rows marked complete against work that was, at most, designed); the 4-agent LangGraph Supervisor pipeline; Pinecone as the vector store; binary AI application-gating as "Share-k's core... primary differentiator"; uploaded-portfolio evidence via Vision/OCR; Arabic voice input via Whisper. None of these survive contact with the LOCKED DECISIONS. The full contradiction-by-contradiction table, including where the intermediate v2 Brief and the old BMAD PRD/ERD/backlog/sprints also diverged from the locked direction, is in `migration-notes.md`.
