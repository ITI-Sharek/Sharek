# Skill Profiles Module

Owns contributor skills, AI-generated skill candidates, evidence, confidence,
and admin review state.

Skill profiles answers these questions:

- Which skills has Share-k verified or approved for this contributor?
- Which skills did AI propose from GitHub evidence?
- What evidence supports a skill claim?
- Is a skill pending, approved, rejected, or adjusted by admin review?

Current state:

- The module is registered but skill profile workflows are not implemented yet.
- Add folders only when a sprint task creates real files.

Use this module for:

- Storing generated skill candidates as pending.
- Approving, rejecting, or adjusting skills.
- Reading approved skills for eligibility checks.
- Linking skill claims to GitHub evidence.

AI can propose skills, but this module owns the final skill state.

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
