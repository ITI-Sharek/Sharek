# Data Model: Admin Skill Review Backend

## SkillProfile

Owned by `skill-profiles`.

### Used Fields

- `id`: skill candidate UUID.
- `user_id`: contributor owner.
- `skill_name`: generated skill label.
- `skill_key`: canonical merge key.
- `proficiency_level`: `beginner`, `intermediate`, or `advanced`.
- `confidence_score`: AI confidence value.
- `evidence_summary`: public summary string.
- `evidence_sources`: structured evidence payload.
- `status`: `pending`, `approved`, `rejected`, `disputed`, or `superseded`.
- `reviewed_by`, `reviewed_at`, `admin_notes`, `original_proficiency`: latest review metadata.

### Rules

- Pending skills are reviewable.
- Approved skills are the only skills eligible for downstream eligibility decisions.
- Rejected skills remain excluded from eligibility decisions.
- A review transition should be atomic with any audit write.

## SkillProfileReviewDecision

Proposed owned table in `skill-profiles`.

### Fields

- `id`: UUID primary key.
- `skill_profile_id`: reviewed skill reference.
- `reviewer_id`: admin user reference.
- `action`: `approve`, `reject`, or `adjust_proficiency`.
- `previous_status`: skill status before the action.
- `new_status`: skill status after the action.
- `previous_proficiency`: proficiency before the action.
- `new_proficiency`: proficiency after the action.
- `notes`: admin note or reason.
- `created_at`: timestamp.

### Relationships

- Many decisions belong to one `SkillProfile`.
- Many decisions belong to one reviewer `User`.

### Validation Rules

- Every review action creates one immutable row.
- Rejected reviews require a note.
- Adjust proficiency must persist the before/after proficiency values.
- A review action should not silently overwrite prior history.

## AdminReviewQueueItem

Read model returned by the pending list endpoint.

### Fields

- `skillProfileId`
- `contributorId`
- `contributorName`
- `skillName`
- `proficiencyLevel`
- `confidenceScore`
- `evidenceSummary`
- `evidenceSources`
- `createdAt`

### Rules

- Only pending skills appear in the queue.
- Pagination metadata should be included with the list response.

## Review Side Effects

Returned by approve/reject/adjust endpoints.

- `activation`: contributor account activation metadata for approval outcomes,
  otherwise `null`.
- `notification`: notification side-effect metadata for final approve/reject
  outcomes, otherwise `null`.
- `notification.deliveredRealtime`: whether at least one authenticated socket
  for the recipient was connected when the notification was emitted.

`deliveredRealtime` is not persistence state. A `false` value still means the
notification row was stored successfully.

## RealtimeNotification

Emitted by the notifications WebSocket gateway after a notification row is
persisted for a connected user.

- `notificationId`
- `userId`
- `type`
- `title`
- `message`
- `metadata`
- `isRead`
- `readAt`
- `createdAt`

Only sockets authenticated as the notification recipient receive the event.
