# ShareK — Seed and Validation Plan

**Status:** `PROPOSED`
**Date:** 2026-07-17
**Depends on:** `product-brief.md` §7, `prd.md` FR-21

Two distinct things this document covers: getting real content into the platform before anyone can trust it (cold start), and proving the platform's single most important artifact — the public profile — actually convinces a real hiring-side reader (reputation-consumer validation). Both are required inputs to the final presentation, not optional polish.

---

## 1. Cold-start seeding checklist

Target: **≥5 real owners, ≥10 real public projects, 1–3 tasks each**, sourced per `prd.md` FR-21 (staff or a trusted early owner becomes the owner of record — the same `Project` creation flow everyone else uses, no ownerless shortcut). Candidate sources: ShareK team members' own projects, ITI graduation/cohort capstones, trusted colleagues' repos.

Per seeded project, capture before publishing:

| Field | Requirement |
|---|---|
| Owner name | A real person, reachable — not a placeholder account |
| Project name | Matches the real repository or real described work |
| Public repo URL | Required if the project isn't `PRE_REPOSITORY` |
| Tasks (1–3) | Real, scoped work — not filler; at least one beginner-friendly |
| Required skills per task | Accurate enough that the AI fit analysis (FR-29) has something real to reason about |
| Owner confirmation | The owner has actually agreed to this — not seeded on someone's behalf without asking |
| Owner commitment to review | Explicit — an owner who won't review evidence produces `UNREVIEWED` submissions (ADR-009), which undermines the demo more than an empty project list would |

**The team manually supports the first owners and contributors** — answering questions, nudging reviews along, checking that evidence gets submitted — this is expected operational work during cold start, not a sign something is broken.

## 2. Public profile validation with hiring-side reviewers

Before final submission, show the public contributor profile (`prd.md` FR-18, `frontend-spec.md` §2) to **at least 3 people with real hiring-adjacent judgment** (a hiring manager, a technical lead who's screened candidates, a recruiter — doesn't need to be ShareK-affiliated) and record their answers to exactly these 5 questions:

1. Do you trust this?
2. Which claims look unsupported?
3. What's missing?
4. Would it help you evaluate a candidate?
5. Are the evidence links clear?

**Protocol:**

- Use a profile built from real seeded data (§1), not a fabricated demo profile — the reviewers are judging the actual artifact, not a mockup.
- Capture answers verbatim, not paraphrased or summarized into a score — a "3.5/5 trust rating" invented from qualitative answers would be exactly the kind of fabricated-precision this whole doc set has been trying to avoid.
- Include the raw answers in the final presentation as real product validation — this is evidence the product's central claim (a structured, evidence-backed contribution record is more trustworthy than a bare GitHub profile) actually holds up in front of someone who isn't the team.
- If a reviewer says they don't trust it or can't find what they need, that's a real finding to act on before submission, not a data point to omit.

## 3. Sequencing

This depends on `epics-and-stories.md` E2 (the loop) and E3 being real and demonstrable — seeding before the loop works just produces empty or broken-looking projects. Realistic order: get E2/E3 working against 1–2 seed projects first, confirm the loop actually closes, then scale seeding to the full ≥5/≥10 target, then run the hiring-manager validation last, once the profile has real contribution history to show. This is `epics-and-stories.md` E5-03 (seeding) and E5-05 (validation) — both hardening-phase work, but validation specifically can't start until seeding is far enough along to produce a believable profile.
