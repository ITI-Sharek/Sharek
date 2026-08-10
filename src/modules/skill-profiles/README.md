# Skill Profiles Module

GitHub-backed generation is optional and starts only after an authenticated
contributor submits an owned `installationLinkId`, one to ten immutable GitHub
repository IDs, and accepted consent version `github-skill-analysis-v1`.
Installation or repository selection alone never enqueues work. Display names
are derived by the GitHub module after live member/repository validation.

Retry is allowed only for the contributor's own `failed` or
`needs_more_evidence` generation. It requires new consent, revalidates access,
and creates a new generation linked to the prior one. Generated skills remain
`pending` until admin review. Public profiles expose approved skill facts but no
private evidence identifiers or summaries.

Owns skill-generation requests, evidence snapshots, generated candidates,
review state, and skill-profile records.

## Current API

- `POST /skill-profiles/me/generations`
- `GET /skill-profiles/me/generations/latest`
- `GET /skill-profiles/me/generations/:generationId`
- `POST /skill-profiles/me/generations/:generationId/retry`

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
and makes the final backend decision. It also deterministically retains every
framework/library detected in the bounded repository evidence and the
repository's dominant language when the model omits it. Those fallback
candidates are marked beginner with explicit dependency/language limitations
and remain pending for admin review; they do not claim implementation depth.
After each durable terminal outcome it asks the notifications module to create
an idempotent inbox/realtime notification (`ready_for_review`,
`needs_more_evidence`, or `failed`). Notification failure is isolated from the
already-committed generation result.
The concrete repository contains the cohesive multi-write Prisma workflow. The
BullMQ worker handles retries and recovery, then delegates to the generation
service. Its FastAPI request marks this workflow explicitly with
`role: "contributor"`.

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

The latest-generation endpoint restores polling after a reload. Duplicate starts
return the owned active generation ID in stable error metadata. The worker does
not trust browser-supplied names: `GitHubEvidenceService` revalidates the member,
installation, and immutable repository IDs, then obtains an on-demand
installation token before evidence collection and AI analysis continue.
