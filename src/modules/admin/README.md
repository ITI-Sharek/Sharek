# Admin Module

Owns admin-facing review routes, moderation queues, reports, disputes, and
admin decisions.

## Current API

- `GET /admin/skill-reviews/pending`
- `POST /admin/skill-reviews/:skillProfileId/approve`
- `POST /admin/skill-reviews/:skillProfileId/reject`
- `PATCH /admin/skill-reviews/:skillProfileId/proficiency`

## Structure

```text
controllers/
  admin-skill-reviews.controller.ts
dto/
  admin-skill-review.request.ts
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
