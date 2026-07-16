# Skill Profiles Module

Owns skill-generation requests, evidence snapshots, generated candidates,
review state, and skill-profile records.

## Current API

- `POST /skill-profiles/me/generations`
- `GET /skill-profiles/me/generations/:generationId`

## Structure

```text
controllers/
skill-profiles.service.ts
services/
  skill-profile-generation.service.ts
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

The module exports `SkillProfilesService` and `SkillProfileSummaryService`; its
repository and jobs remain private.
