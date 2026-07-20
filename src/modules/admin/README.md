# Admin Module

Owns admin-facing review routes, moderation queues, reports, disputes, and
admin decisions.

## Current API

- `GET /admin/skill-reviews/pending`
- `POST /admin/skill-reviews/:skillProfileId/approve`
- `POST /admin/skill-reviews/:skillProfileId/reject`
- `PATCH /admin/skill-reviews/:skillProfileId/proficiency`
- `GET /admin/contributor-fields`
- `POST /admin/contributor-fields`
- `PATCH /admin/contributor-fields/:fieldId`
- `GET /admin/published-project-owners`

## Structure

```text
controllers/
  admin-skill-reviews.controller.ts
  admin-contributor-fields.controller.ts
  admin-published-project-owners.controller.ts
dto/
  admin-skill-review.request.ts
  contributor-field.request.ts
admin.module.ts
README.md
```

`AdminSkillReviewsController` enforces admin authorization through route guards,
binds request/query DTOs, and delegates to the exported
`SkillProfilesReviewService`. The `admin` module does not write
`skill-profiles` tables directly.

Service-level authorization remains in `SkillProfilesReviewService` as a
defensive check so review transitions cannot be invoked by non-admin callers.
Approval and rejection side effects are handled by exported `identity` and
`notifications` services through the skill-profiles workflow.

Contributor field routes delegate to the exported
`ContributorProfilesService`; the admin module does not write contributor
profile-owned tables directly. Admins can add bilingual options, order them,
and activate/deactivate their appearance in contributor settings.

The published-project owner route delegates to the exported `ProjectsService`.
It provides the admin overview with owner identity, an accurate published
project count, and each owner's latest published project without moving project
reads or ownership decisions into the admin module.
