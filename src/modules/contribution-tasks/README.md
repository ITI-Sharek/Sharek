# Contribution Requests Module

This module owns Contribution Request records, their ordered Requirements, their
required skill levels, and their immutable lifecycle audit. New domain code uses **Contribution Request**;
the directory keeps its historical `contribution-tasks` name to avoid a broad
module rename.

## Implemented: private draft lifecycle (#48)

- An authenticated active owner can create a draft for a Project they own only
  when that Project is already published.
- Ownership is derived from the session. Client-supplied owner identifiers are
  rejected by DTO whitelisting.
- Project facts are requested through the exported
  `ProjectsService.getContributionRequestProjectAccess()` and transaction-scoped
  `lockContributionRequestProjectAccess()` capabilities. This module never
  reads or writes Project tables directly.
- Required and Preferred Requirements are ordered relational rows. Technology
  tags remain separate request metadata.
- Draft update uses an optimistic `updated_at` predicate inside a transaction.
- Project ownership and publication are revalidated on that same transaction
  connection before every draft write.
- Discard is the terminal, idempotent `discarded` transition; it never deletes
  the request and appends one immutable audit row.
- Optional `Idempotency-Key` values protect create, update, discard, publish,
  and cancel retries.
  Reusing a key for a different command payload returns a stable conflict.

## HTTP routes

```text
GET   /projects/:projectId/contribution-requests
POST  /projects/:projectId/contribution-requests
GET   /contribution-requests/:requestId
PATCH /contribution-requests/:requestId
GET   /contribution-requests/:requestId/skill-requirements
PUT   /contribution-requests/:requestId/skill-requirements
POST  /contribution-requests/:requestId/discard
POST  /contribution-requests/:requestId/publish
POST  /contribution-requests/:requestId/cancel
GET   /tasks
GET   /tasks/:requestId
```

Draft and owner-command routes require a bearer session; `/tasks` reads are
public. Draft lookup deliberately returns the same
`CONTRIBUTION_REQUEST_NOT_FOUND` result for unknown and other-owner IDs.
Responses use dedicated DTOs and never expose Prisma row names or audit data.
Malformed Requirement shapes return the stable
`CONTRIBUTION_REQUEST_REQUIREMENT_INPUT_INVALID` code; semantic missing and
duplicate cases retain their more specific domain codes.

The owner Project list returns every Request grouped under an exhaustive
`byStatus` object (`draft`, `published`, `assigned`, `completed`, `cancelled`,
and `discarded`) plus `totalCount`. It uses ownership-only Project access, so
historical Requests remain visible after the Project is archived. Every group
is present even when empty, allowing the frontend to render stable lifecycle
sections without reconstructing them from local state.

## Implemented: public lifecycle (#49)

- Publication is an explicit active-owner command. It rechecks owned published
  Project access, draft completeness, close-time validity, and the active owner
  plan in the transaction. Owners without a current assignment use the default
  Free entitlement. Monthly publication limits are Free 5 and Gold 30; prior
  publications continue to count for their UTC calendar month after
  cancellation. The monthly enforcement gate is intentionally open
  in `NODE_ENV=development` for local QA against existing Projects, while test
  and production environments keep the plan limits enforced.
- `GET /tasks` and `GET /tasks/:requestId` are public reads. Both query only
  `published` Requests with a publication time and an Applications Close Time
  strictly after the server clock whose parent Project is still published.
  Draft, discarded, cancelled, assigned, completed, closed, and Requests on
  archived Projects share the audience-safe
  `CONTRIBUTION_REQUEST_NOT_FOUND` detail outcome.
- Feed filters are `q`, `technologies`, `difficulty`, and `hasReward`.
  Technology matches use any requested tag. Detail returns ordered
  Requirements with explicit `required`/`preferred` classification. A Request
  created from an accepted Proposal also exposes the proposer username for the
  approved public “Suggested by @username” attribution.
- Cancellation is an idempotent `published -> cancelled` owner command. It
  preserves the Request and calls the exported Applications service in the same
  transaction. Every pending Application becomes `request_cancelled` with an
  immutable audit; already terminal Applications remain unchanged. The owner
  may still cancel after the parent Project is archived so pending Applications
  are not stranded. Request and child Application audits share a correlation
  ID, and each child records the Request cancellation audit as its cause.

The exported `getApplicationSubmissionContext()` and transaction-scoped
`lockApplicationSubmissionContext()` capabilities expose only the Request
lifecycle, close time, owner, revision time, and ordered Requirements needed by
issue #50. Both also require the parent Project to remain published, including
under the transaction lock. Applications owns submission decisions and writes
no Contribution Request tables.

For Owner Decision acceptance (#51), the exported transaction-scoped
`assignFromOwnerDecision()` capability locks the Contribution Request, rechecks
the current Project owner through `ProjectsService`, checks actionable
`published` Request state, transitions it to `assigned`, and appends the
Request-owned audit on the caller's Prisma transaction. The companion
`reconfirmOwnerDecisionActor()` performs the same current-Project check for a
decline. This keeps the accepted Application, Assignment, sibling closure, and
Request state atomic while preserving table ownership.

For the Application review window (#52),
`lockContributionRequestOwnerContext()` locks the Request and asks the exported Projects
capability for its current owner on the scheduler's transaction. It returns
only that owner ID and does not change Request state.

For Delivery review (TASK-5-02), the exported owner scope capabilities resolve
the current Project owner and ordered Request requirements without exposing
Project persistence. The lifecycle scope also exposes non-draft owned Request
IDs for the composed owner dashboard. `completeFromDeliveryReview()` locks an `assigned`
Request, rechecks current ownership, changes it to `completed`, and appends the
Request-owned completion audit on the Delivery module's transaction. Changes
requested and rejected reviews never call this transition.

`ContributionRequestReputationFactsService` is an exported, read-only boundary
that returns owner-authored technology tags for a set of Request IDs. The
Delivery reputation coordinator uses those tags only after a Delivery is
approved; this module does not rank skills or write Reputation records.

## Implemented: required skill levels (#114, P0-B01)

A Request's Requirements are owner-authored prose — what the work involves.
`ContributionRequestSkillRequirement` is the machine-comparable half: one row
per named skill, with the proficiency it demands. It exists because nothing in
the prior model was comparable to a contributor's proficiency, so there was no
bar to compare anyone against (DEC-078, ADR 0015).

- `required_level` reuses the **`SkillProfileProficiencyLevel`** enum rather
  than declaring a parallel one, so both sides of the eligibility comparison
  share one vocabulary and cannot drift apart.
- `skill_name_normalized` is produced by `shared/skills/skill-name.ts`, the same
  function the `matching` module uses. One definition is what prevents a
  contributor being shortlisted for a Request they are then blocked from
  applying to.
- **The set freezes at publication.** Writes against anything other than a
  `draft` return `REQUEST_SKILL_REQUIREMENTS_FROZEN` (409). The status is read
  inside the transaction behind a `FOR UPDATE` on the Request row, which
  overlaps the lock the publication service takes — so a publish and an edit
  serialize instead of interleaving.
- The write **replaces the whole set** atomically. A partial patch would make
  "delete the last required skill" unexpressible.
- Owner writes are always `source: owner_override` with `confidence: null`, so
  a later inference run (`P0-B02`) can tell a human correction from its own
  earlier output and must not overwrite it.
- Only `required` rows will block. `preferred` rows are advisory and never
  affect eligibility — the rule Advisory Fit already follows for the Fit Band.
- The frozen set is copied into `ApplicationRequirementSnapshot.skill_requirements`
  at submission. **Both** kinds are recorded: the snapshot is the historical
  record of what was asked, and it is the *evaluation* that ignores `preferred`.
  Filtering here would leave a later dispute unable to reconstruct the bar.
- Public request detail exposes `skillName`, `requiredLevel`, and `kind` only.
  `confidence` and `source` are excluded by a narrow Prisma `select` rather than
  by mapping, so no later change can leak them by spreading the row.

The deterministic evaluation that blocks under-levelled submissions is owned by
the `eligibility` module (`P0-B03`, #116). This module supplies its frozen bar
and the caller's transaction-scoped request context; it does not duplicate the
comparison or write evaluation rows.

## Implemented: inference and the publication precondition (#115, P0-B02)

The level bar above is now populated by the AI agent, corrected by the owner,
and required before publication.

- Inference runs on the **`requirement-inference` BullMQ queue**, enqueued after
  a draft create or content edit *commits*. Enqueuing inside the transaction
  would hold a database connection across a Redis round-trip and could leave a
  job pointing at a rolled-back draft.
- **Saving a draft never blocks on the provider, and never fails because of
  it.** `RequirementInferenceQueue.enqueueInference` swallows its own errors,
  unlike `AdvisoryFitAssessmentQueue`, which throws when disabled. The asymmetry
  is deliberate: an Assessment Request is a durable row an owner asked for and
  would be stranded by a dropped job; inference is an optional convenience on a
  draft, and the owner can always type the set by hand.
- Jobs are keyed by `requestId--<updatedAt>`, and the processor stands down if
  the draft's `updated_at` moved past the job's `requestedAt`. A slow run
  against text the owner has since replaced must not overwrite rows inferred
  from what they currently see.
- A draft below `MIN_DESCRIPTION_LENGTH` with no requirements and no tags is
  never sent. Every wasted provider call is real money, and a one-line
  description produces a bar the owner deletes anyway.
- **The override rule is enforced by the delete filter**, not by diffing: only
  `source: ai_inferred` rows are removed, so an owner correction survives
  re-inference even when the model now proposes something different. An
  inferred skill the owner has already overridden is dropped — one row per
  normalized name is all the unique index permits, and the human's wins.
- Model output is revalidated **in NestJS** by `RequirementInferenceClient`
  before anything is persisted: level vocabulary, categorical confidence, kind,
  the 15 cap, and normalized-name uniqueness. The FastAPI schema enforces the
  same rules, but a schema on the far side of an HTTP call is a promise made by
  a separately deployed service, and ADR 0015 makes these rows an authorization
  input. One bad row fails the whole run rather than being dropped: a silently
  discarded skill is a bar the owner never sees and never approves.
- A provider failure writes **no skill row at all** and sets
  `skill_inference_status = failed`, which the owner DTO exposes. The draft
  stays editable. The processor does not rethrow, so BullMQ's three attempts are
  not burned on a service that is down.
- Each run appends one `AiTraceLog` row (`agent_type: skill_validation`,
  `trigger_entity_type: contribution_request`) carrying model, latency, status
  and a skill count — **no request content and no provider trace** (ADR 0002).
  The Request's text already lives on the Request; copying it into an
  append-only AI log would duplicate owner content into a table with a different
  retention story and no way to correct it.
- **Publication refuses without at least one `required` skill row**, with
  `REQUEST_SKILL_REQUIREMENTS_MISSING` (422) carrying the inference status.
  Publishing with no bar yields a Request nobody can be measured against, so
  every contributor passes and the differentiator silently does not exist for
  it. `preferred` rows do not satisfy the check.
- `REQUIREMENT_INFERENCE_QUEUE_ENABLED=false` is a **supported way to run the
  product**, not a degraded mode: CI and a local run need no provider and no
  Redis, and a draft is still publishable once the owner enters the set through
  `PUT /contribution-requests/:requestId/skill-requirements`.

Exercise it locally against the stub, which now serves `/requirements/infer`
alongside `/advisory-fit/assess`:

```bash
node scripts/advisory-fit-provider-stub.mjs --port 8011
AI_SERVICE_URL=http://127.0.0.1:8011 REQUIREMENT_INFERENCE_QUEUE_ENABLED=true pnpm start:dev
```

## Persistence

Migration `20260814101636_contribution_request_skill_requirements` creates
`ContributionRequestSkillRequirement` with a **unique index on
`(contribution_request_id, skill_name_normalized)`** and an `ON DELETE CASCADE`
from the Request, and adds `ApplicationRequirementSnapshot.skill_requirements`
defaulting to `[]`.

The unique index is the real guard, not the service's duplicate check: that
check is racy across two concurrent draft edits. The default on the snapshot
column means every Application submitted before the gate existed reads as "no
bar", which is what it was — no backfill is needed or correct.

Because the mocked jest suites cannot prove DDL, the index, the cascade, the
level vocabulary, and the snapshot's independence from later Request edits are
exercised against real Postgres:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://sharek:sharek@localhost:5433/sharek?schema=public \
  pnpm run test:migrations:skill-requirements
```

Migration `20260728013000_contribution_request_drafts` preserves legacy request
rows, renames legacy technology/deadline columns, adds Applications Close Time,
creates ordered `contribution_request_requirements`, and creates append-only
`contribution_request_audits`. Only this module writes those tables.

Migration `20260728230000_contribution_request_publication` adds publication
and cancellation audit actions, the Application cancellation audit action, and
the actionable-discovery index. Publication asks the Projects module for the
canonical owner entitlement and monthly limit; this module does not read or
write Subscription records.

Focused verification:

```bash
npm test -- --runInBand src/modules/contribution-tasks/services/contribution-tasks.service.spec.ts src/modules/contribution-tasks/services/contribution-request-skill-requirements.service.spec.ts src/modules/contribution-tasks/services/contribution-request-publication.service.spec.ts src/modules/contribution-tasks/services/public-contribution-requests.service.spec.ts src/modules/applications/applications.service.spec.ts test/contribution-requests.e2e-spec.ts test/contribution-request-public-lifecycle.e2e-spec.ts
```
