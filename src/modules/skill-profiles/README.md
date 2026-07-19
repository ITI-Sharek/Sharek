# Skill Profiles Module

Owns skill-generation requests, evidence snapshots, generated candidates,
review state, and skill-profile records.

## Current API

- `POST /skill-profiles/me/generations`
- `GET /skill-profiles/me/generations/:generationId`

Admin review routes are exposed by the `admin` module, but the review state and
database writes stay in this module through the exported
`SkillProfilesReviewService`.

## Structure

```text
controllers/
skill-profiles.service.ts
services/
  skill-profile-generation.service.ts
  skill-profiles-review.service.ts
  skill-profile-summary.service.ts
dto/
repositories/skill-profile-generation.repository.ts
jobs/
utils/
skill-profiles.module.ts
README.md
```

`SkillProfilesService` validates contributor requests and queues work.
`SkillProfileGenerationService` collects evidence through the exported
`GitHubEvidenceService`, reads the connected account through
`GitHubAccountService`, calls `AiService`, applies confidence/evidence rules,
and makes the final backend decision. The concrete repository contains the
cohesive multi-write Prisma workflow. The BullMQ worker handles retries and
recovery, then delegates to the generation service.

`SkillProfilesReviewService` lists pending AI-generated skills and performs
admin review transitions. Approve, reject, and proficiency-adjustment actions
update the latest `SkillProfile` review fields and append immutable
`SkillProfileReviewDecision` audit rows in one transaction. Approve and reject
outcomes also call exported identity and notification services so contributor
accounts can activate and receive review notifications without direct foreign
table writes from this module.

`SkillProfileSummaryService` exposes approved-only skill reads for downstream
eligibility decisions. Pending, rejected, disputed, and superseded skills must
not qualify contributors for applications.

The module exports `SkillProfilesService`, `SkillProfileSummaryService`, and
`SkillProfilesReviewService`; its repository and jobs remain private.
