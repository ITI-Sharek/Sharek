# Skill Guidance Module

This module owns the explicit contributor command for educational skill-gap
guidance. It is independent of Application state, Owner Decisions, Advisory
Fit outcomes, and subscription tiers.

`SkillGapGuidanceService` authorizes an active contributor, reads a currently
published Contribution Request through the exported Contribution Tasks context
service, reads approved skills through the exported Skill Profiles summary
service, and sends fixed snapshots to the `AiService`. The AI response is a
recommendation only; this module does not write business state or use the
retired `SkillGapGuidance` Application entity.

## Routes

- `POST /contributors/me/skill-gap-guidance`
- `GET /contributors/me/skill-gap-guidance/stream?contributionRequestId=<uuid>`

The stream route emits one validated `guidance.completed` event. The final
structured result is atomic even when the transport is streamed.

## Implemented: guidance triggered by a block (#118, P0-B05)

The route above is unchanged. It stays what ADR 0014 made it: **explicitly
requested, tier-independent, Application-independent.** This adds the case it
cannot serve — a contributor who has just been *blocked* and should get help for
that exact gap without having to go and construct a request for it.

- Scoped to an **`EligibilityEvaluation`**, not an Application. Under a hard
  block no Application exists, and `SkillGapGuidance.application_id` is
  `@unique` and NOT NULL — so the entity ADR 0014 retired is not merely the
  wrong home for this, it is an impossible one. It stays unused.
- **The request returns without waiting for the provider.** The deterministic
  blocking-skill list is copied onto the row and returned immediately; the
  narrative is generated on a queue and polled for. A contributor who has just
  been refused should not then be made to wait on a model to learn why — they
  already know why, and the narrative only adds to it.
- `blocking_skills` is **copied onto the guidance row**, not joined at read
  time. The row has to keep explaining the refusal even if generation never
  succeeds.
- **Failure removes the narrative, never the reason.** `failed` is a first-class
  state and leaves `blocking_skills` untouched, so a contributor is never told
  only "you are blocked" with no explanation. `no_assessable_evidence` and
  `system_limit` are recorded as failures too: both are honest non-answers, and
  storing either as `ready` would show an empty panel and call it help.
- Re-requesting while one is `pending` or `ready` returns the existing row
  rather than queuing another provider call for the same gap. A `failed` row is
  *not* reused — retrying after a failure is exactly what should be possible.
- **Never tier-gated** (DEC-076). There is no plan check anywhere on this path,
  and a test asserts it: a block is the moment a paywall would be least
  defensible, because the platform has just refused them.

### Authorization

Every route is scoped to the caller in the query itself. An owner, another
contributor, and an unknown id all get the same
`ELIGIBILITY_GUIDANCE_NOT_FOUND`, so the endpoint cannot be used to discover
whether a given guidance or evaluation exists.

### HTTP

```text
POST /contributors/me/eligibility-guidance      { eligibilityEvaluationId }
GET  /contributors/me/eligibility-guidance      ?cursor&limit
GET  /contributors/me/eligibility-guidance/:id
```

History is **keyset-paginated** on `created_at desc, id desc`, covered by
`@@index([contributor_id, created_at, id])`, so a page is an index range rather
than an offset scan that slows down the further back it reads. Cursors are
base64url and **strictly validated** — a tampered cursor is a
`400 ELIGIBILITY_GUIDANCE_CURSOR_INVALID`, never a silent first page, which
would make a paginating client loop forever without being told anything is
wrong.

### Running without the queue

`ELIGIBILITY_GUIDANCE_QUEUE_ENABLED=false` still records the request and still
returns the blocking skills; only the narrative never arrives and the row stays
`pending`. That is a supported way to run, because the reason a contributor was
blocked never depended on the provider.
