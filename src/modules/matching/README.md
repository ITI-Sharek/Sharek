# Matching

Computes, for a contributor, the open Contribution Requests their **approved**
skills fit. Deterministic and explainable. No AI.

## Tables owned

None. Every fact this module ranks on is read through the exported service of
the module that owns it — skills from `skill-profiles`, Requests from
`contribution-tasks`, prior Applications from `applications`, reputation from
`reputation`, plan limits from `subscriptions`. That is why the module is all
imports and one service.

## Public API

`MatchingModule` exports `MatchingService`.

| Method | Answers |
|---|---|
| `shortlistForContributor({ contributorId, now? })` | The ranked Requests this contributor fits, capped by their plan |

## Matching is pull-only

**There is no owner-side matching, and none may be added.** No method here takes
a Contribution Request and returns contributors, and publishing a Request
notifies nobody. The owner-facing matching UI was removed on 2026-08-14. A test
asserts the absence structurally, by walking the service prototype, rather than
trusting convention.

## Ranking

Strict precedence, every key deterministic:

1. **Coverage** — how much of what the Request asks for the contributor covers.
2. **Owner reputation** — the Request's owner's rating. An owner with no ratings
   sorts as zero rather than being excluded: a new owner's Request is still a
   real opportunity, it just has no signal yet.
3. **Recency** — most recently published first.
4. **`id`** — the key that makes the order *total*. Without it, two Requests
   published in the same millisecond with equal coverage and equal owner
   reputation come back in whatever order Postgres felt like, and the same
   contributor refreshing the page sees a different list.

A test ranks a set that is identical on every key except `id`, in two different
input orders, and asserts the same output both times.

## Exclusions

| Excluded | Where the rule lives |
|---|---|
| Requests the contributor already applied to, in any status | here, from the applications module's exported list |
| The contributor's own Requests | contribution-tasks, via `excludeOwnerId` |
| Unpublished, closed, or terminal Requests | contribution-tasks, via the clock it is handed |
| Requests matching none of the contributor's approved skills | here |
| Pending, rejected, disputed and superseded skills | skill-profiles — only approved skills are ever returned |

Withdrawn and not-selected Applications still exclude a Request: the contributor
has already seen it and decided, so re-surfacing it would be noise rather than a
recommendation.

## The Phase 0 upgrade point

`skill-fit.ts` holds **one function**, `assessSkillFit`, and it is the only
place in the backend that decides whether skills fit a Request.

Today a Request states what it wants as owner-typed technology tags plus free
requirement text, while a contributor has approved skill *names*. There is
nothing comparable to compare levels against, so fit is name overlap.

When Phase 0 lands `ContributionRequestSkillRequirement` — frozen
`{ skill_name, required_level, kind }` rows — that comparison becomes strictly
better, and `exceededSkills` gains its real meaning: skills whose proficiency
clears the required level rather than skills the Request never asked about.
Making that swap should be a change to that one file and nothing else.

## Cost

The candidate set is bounded at 500 open Requests, ordered by the same recency
key the shortlist ranks on last, so truncation keeps the newest candidates
rather than an arbitrary slice. The filter is covered by
`@@index([status, applications_close_at, published_at])`. The contributor's
skills are normalized once per shortlist rather than once per candidate; doing
it per candidate was measurably the slowest part of ranking. A performance test
holds the P95 of one shortlist over 1000 Requests well inside the NFR-008
three-second budget.

## No percentages

Coverage is a ratio internally and becomes a categorical `HIGH`/`MEDIUM`/`LOW`
band before it leaves this module. DEC-010 forbids presenting fit as a
percentage, and a band is also the honest resolution — the difference between
61% and 64% name overlap is noise.
