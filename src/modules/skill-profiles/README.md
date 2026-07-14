# Skill Profiles Module

Owns contributor skills, AI-generated skill candidates, evidence, confidence,
and admin review state.

Skill profiles answers these questions:

- Which skills has Share-k verified or approved for this contributor?
- Which skills did AI propose from GitHub evidence?
- What evidence supports a skill claim?
- Is a skill pending, approved, rejected, or adjusted by admin review?

Current state:

- Contributors can start selected-repository skill profile generation.
- Generation state is persisted in `SkillProfileGeneration`.
- The backend snapshots selected GitHub evidence through the GitHub module,
  calls the FastAPI AI service through the `SkillProfileGenerator` port, and
  stores high-confidence generated skills as `pending`.
- Generated skills do not qualify contributors until admin review changes them
  to `approved`.

Implemented endpoints:

- `POST /skill-profiles/me/generations`
- `GET /skill-profiles/me/generations/:generationId`

Owned tables:

- `SkillProfile`
- `SkillProfileGeneration`

Use this module for:

- Storing generated skill candidates as pending.
- Approving, rejecting, or adjusting skills.
- Reading approved skills for eligibility checks.
- Linking skill claims to GitHub evidence.

AI can propose skills, but this module owns the final skill state.

## Current Generation Flow

```text
SkillProfilesController
  -> StartSkillProfileGenerationUseCase
  -> SkillProfileGenerationRepository
  -> BullMqSkillProfileGenerationQueue
  -> SkillProfileGenerationWorker
  -> SkillProfileGenerationProcessorService
  -> GitHubRepositoryService selected evidence snapshots
  -> SkillProfileGenerator port
  -> pending SkillProfile records
```

`BullMqSkillProfileGenerationQueue` durably enqueues work in Redis.
`SkillProfileGenerationWorker` retries transient failures, limits concurrency,
and recovers incomplete generation records after backend restarts.

Generation statuses:

```text
queued
collecting_evidence
analyzing
pending_review
needs_more_evidence
failed
```

Individual skill statuses remain:

```text
pending
approved
rejected
disputed
superseded
```

Frontend callers submit selected repositories:

```json
{
  "repositories": [
    { "fullName": "owner/repo" }
  ]
}
```

The backend validates contributor authorization, repository name format, and
the selection limit before creating the generation. The GitHub module then
requires every repository to appear in the authenticated repository list and
adds contributor-specific authorship evidence for the connected login.

The backend treats FastAPI output as a recommendation. Unknown evidence IDs,
weak evidence, `needs_more_evidence`, and empty high-confidence candidates do
not create pending skills. Repeated pending aliases are canonicalized and older
rows are marked `superseded`; approved rows are not automatically changed.
Transient GitHub or AI service errors fail the BullMQ attempt so retries occur;
only genuinely insufficient evidence reaches `needs_more_evidence`.

## Where To Put New Files

- `presentation/http/controllers`: generate skill candidates, list pending
  skills, approve/reject skills, contributor skill profile endpoints.
- `presentation/http/requests`: generate request, approval/rejection request,
  skill adjustment request.
- `presentation/http/responses`: skill profile, skill candidate, evidence, and
  review result response shapes.
- `application/use-cases`: generate candidates, store pending skills, approve
  skill, reject skill, list approved skills for eligibility.
- `application/ports`: GitHub evidence reader, AI skill profile generator,
  admin review notifier.
- `domain/entities`: skill profile, skill candidate, approved skill.
- `domain/policies`: skill approval, confidence threshold, evidence quality,
  duplicate/merge policy.
- `infrastructure/persistence`: Prisma skill profile repository and mapper.

## Boundaries

The FastAPI AI service can generate candidate skills and evidence summaries. It
must not directly approve skills in Share-k.

Applications may read approved skills for eligibility. They must not write skill
approval state.

The GitHub module owns GitHub tokens and repository reads. This module requests
normalized evidence through `GitHubRepositoryService`; it must not decrypt
tokens or call GitHub directly.

## Follow-Up Work

- Add admin pending-skill review endpoints and UI integration.
- Add contract tests against the FastAPI AI repository.
- Add file-level authored-code/dependency analysis and fraud evaluation
  fixtures before claiming the full `FR-028` evidence depth.
