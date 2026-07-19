# Quickstart: Admin Skill Review Backend

## Prerequisites

- Docker Compose local stack is running.
- Admin authentication works.
- At least one pending skill candidate exists in `skill-profiles`.

## Setup

```bash
docker compose up --build
docker compose exec api npm run prisma:migrate
docker compose exec api npm test
```

## Validation Scenarios

### Scenario 1: List Pending Reviews

1. Call `GET /admin/skill-reviews/pending` with an admin bearer token.
2. Confirm only pending AI-generated skills are returned.
3. Confirm each item includes contributor, skill, confidence, and evidence details.

### Scenario 2: Approve A Skill

1. Call `POST /admin/skill-reviews/{skillProfileId}/approve`.
2. Confirm the skill becomes `approved`.
3. Confirm the contributor account becomes `active` when it was pending.
4. Confirm the response includes reviewer metadata, the updated proficiency,
   and activation/notification side-effect metadata.

### Scenario 3: Reject A Skill

1. Call `POST /admin/skill-reviews/{skillProfileId}/reject` with a reason.
2. Confirm the skill becomes `rejected`.
3. Confirm the rejection is stored in the review history.
4. Confirm a skill-review notification is stored for the contributor.

### Scenario 4: Adjust Proficiency

1. Call `PATCH /admin/skill-reviews/{skillProfileId}/proficiency`.
2. Confirm the skill keeps its review history and records the before/after proficiency.
3. Confirm the contributor remains pending and no final outcome notification is created.

### Scenario 5: Eligibility Safety

1. Verify approved-only skill reads ignore pending and rejected skills.
2. Confirm downstream eligibility consumers can use the approved-only reader contract.

### Scenario 6: Real-Time Notification Delivery

1. Connect a Socket.IO client to `/notifications` with `auth.token` set to the
   current access token.
2. Approve or reject a pending skill for that connected user.
3. Confirm the socket receives `notification.created` with the persisted
   notification payload.
4. Confirm the admin review response includes
   `notification.deliveredRealtime: true`.
5. Repeat while disconnected and confirm the response reports
   `notification.deliveredRealtime: false` while the notification row remains
   stored.

## Useful Commands

```bash
npm run check:architecture
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

## Implementation Validation Notes

- `npm run check:architecture`: passed for 13 standard NestJS modules.
- `npm run lint`: passed with 0 errors and 10 existing warnings in unrelated
  identity/shared/test files.
- `npx tsc --noEmit`: passed.
- `npm test -- --runInBand`: passed, 32 suites and 102 tests.
- `npm run build`: passed.
- `DATABASE_URL='postgresql://sharek:sharek@localhost:5433/sharek?schema=public' npx prisma validate --schema prisma/schema.prisma`: passed.
- `git diff --check`: passed.
