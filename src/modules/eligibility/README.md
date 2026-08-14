# Eligibility Module

Owns the gate (DEC-078, ADR 0015) and the `EligibilityEvaluation` table.

It answers exactly one question: **may this person submit?** It does not rank,
score, or influence who the owner selects — that is Advisory Fit's separate job,
and Advisory Fit stays decision-neutral. The two are not redundant: the gate is
the coarse level-based pre-filter before an Application exists, Advisory Fit is
the owner's optional per-Requirement read on the applicants who got through.

## The comparison

`shared/skills/skill-level.ts` owns the shared level order used by both
eligibility and matching. `services/skill-level-comparison.ts` is pure and
clock-free, so identical inputs
always produce an identical verdict — which is what makes a refusal reproducible
for a dispute months later.

- Ordering is `beginner < intermediate < advanced`, held in one shared map so a
  new level cannot be added without explicitly deciding where it sits.
- **Exactly meeting the bar clears it.** Requiring strictly more would make
  every stated level mean one level higher than it says.
- A required skill the contributor does not hold at all blocks, and is listed
  with `contributorLevel: null`. A contributor with no approved skills sees
  **every** required skill named — an empty list would read as "blocked for no
  stated reason", the dead end DEC-078 exists to remove.
- Only `required` rows are considered. `preferred` rows never affect
  eligibility.
- Where a contributor holds several approved rows for one skill, the **highest**
  level wins; picking arbitrarily would make the verdict depend on row order.
- Skill identity uses `shared/skills/skill-name.ts`, the same normalization the
  unique index on the bar is built on.

## Approved means approved

Approved skills are read through
`SkillProfileSummaryService.listAuthorizedSkillsForApplicationSnapshot` — the
same capability the Application evidence snapshot uses. Pending, rejected,
disputed, and unauthorized-generation skills are excluded there, so this module
does not restate the rule and the two definitions cannot drift. A contributor is
never measured against a set of skills different from the one recorded on their
Application.

## Where it runs

`evaluateForRequest` takes the **caller's transaction client** and runs against
the same locked rows the submission will use. The read endpoint
`GET /tasks/:requestId/eligibility` is advisory to the client and its verdict is
never trusted at submit time: the tempting optimisation — "we already checked,
skip it in the transaction" — is precisely the TOCTOU bug. A contributor whose
skills are revoked between the two calls is still blocked.

An evaluation row is written for **both** outcomes. Recording only refusals
would make the table a list of accusations with no denominator and leave "was
this person evaluated at all?" unanswerable.

## HTTP

```text
GET /tasks/:requestId/eligibility
```

Always the caller's own eligibility; there is no path to ask about anyone else.
An unpublished or unknown Request returns the same audience-safe
`CONTRIBUTION_REQUEST_NOT_FOUND` as the public detail route.

The block itself surfaces from the submission routes as
`403 APPLICATION_BLOCKED_SKILL_GAP`, with `metadata.blockingSkills` naming each
skill, its `requiredLevel`, and the contributor's `contributorLevel` (`null`
when they hold no approved evidence) — enough to explain the refusal without a
second call.

## Persistence

Migration `20260814120107_eligibility_evaluations` creates the append-only
table with a **CHECK constraint permitting exactly one target** — a row must
belong to a Contribution Request or a Contribution Proposal, never both and
never neither. Prisma cannot express a CHECK, so it lives in the raw migration
and is documented in `docs/database-plan.md`. `contribution_proposal_id` is
present from the start; the Proposal path is wired in `P0-B04` (#117).

The contributor foreign key is `ON DELETE RESTRICT`: the evaluation is the
record of why a person was refused and must not vanish to an unrelated cleanup.

P0-B05/#118 remains a follow-up: a recorded blocked evaluation is the durable
trigger for contributor-requested skill-gap guidance.
