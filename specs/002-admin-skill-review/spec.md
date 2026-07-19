# Feature Specification: Admin Skill Review Backend

**Feature Branch**: `002-admin-skill-review`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Implement admin APIs to list pending AI-generated skills, approve/reject skills, adjust proficiency labels, and store all review decisions while excluding pending or rejected skills from eligibility decisions"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Reviews Pending Skills (Priority: P1)

As an admin, I want to list pending AI-generated skills and approve, reject, or adjust them, so that only vetted skill claims can move forward.

**Why this priority**: This is the trust gate for generated skills and the core backend workflow requested.

**Independent Test**: Seed pending skill candidates, call the admin review endpoints, and verify each action updates the skill state and returns the reviewed item.

**Acceptance Scenarios**:

1. **Given** pending AI-generated skill rows exist, **When** an admin requests the pending queue, **Then** the response contains only reviewable pending items with contributor, skill, confidence, and evidence details.
2. **Given** a pending skill, **When** an admin approves it with an optional proficiency adjustment, **Then** the skill becomes approved and the chosen proficiency is stored.
3. **Given** a pending skill, **When** an admin rejects it, **Then** the skill becomes rejected and the rejection note is stored.

---

### User Story 2 - Audit And Eligibility Safety (Priority: P2)

As the platform, I want every review decision stored and only approved skills used for eligibility decisions, so that skill trust state remains auditable and safe for downstream consumers.

**Why this priority**: The review action is not complete unless the decision trail is retained and downstream eligibility reads ignore pending or rejected skills.

**Independent Test**: Perform approve/reject/adjust actions, then query the stored decision history and approved-only skill summaries to verify the history is immutable and pending/rejected skills are excluded from eligibility reads.

**Acceptance Scenarios**:

1. **Given** multiple review actions for the same contributor, **When** the audit history is queried, **Then** each decision appears with reviewer, timestamp, previous value, new value, and notes.
2. **Given** approved, pending, rejected, and disputed skills exist, **When** an eligibility-oriented reader is used, **Then** only approved skills are returned.

---

### User Story 3 - Contributor Activation And Review Notification (Priority: P1)

As a contributor, I want my account to become active when an admin approves at
least one generated skill and I want to be notified about the review outcome, so
that I know when I can start applying to matching tasks.

**Why this priority**: TASK-2-04 and Story 2.6 require the admin review gate to
activate contributors after approval and tell contributors their profile was
reviewed.

**Independent Test**: Approve a pending skill for a pending contributor and
verify the contributor account becomes active, a skill-review notification is
stored, and the response reports the activation/notification outcome. Reject a
pending skill and verify a rejection notification is stored without activating
the contributor.

**Acceptance Scenarios**:

1. **Given** a pending contributor has a pending generated skill, **When** an admin approves that skill, **Then** the skill becomes approved, the contributor status becomes active, the decision is audited, and a notification is stored.
2. **Given** a contributor is already active, **When** an admin approves another pending skill, **Then** the skill becomes approved, the account status is not rewritten unnecessarily, and an approval notification is stored.
3. **Given** a pending contributor has a generated skill rejected, **When** the rejection is stored, **Then** the contributor remains pending and receives a rejection notification.
4. **Given** an admin only adjusts proficiency, **When** the skill remains pending, **Then** no activation or final review notification is created.

---

### User Story 4 - Real-Time Contributor Notifications (Priority: P2)

As a signed-in contributor, I want review notifications delivered over a live
socket connection, so that account activation and rejection outcomes appear
without waiting for a page refresh.

**Why this priority**: Stored notifications are useful, but admin review is a
live workflow. Real-time delivery gives the frontend an immediate signal while
keeping the database notification row as the source of truth.

**Independent Test**: Connect to the notifications namespace with a valid access
token, trigger a skill review notification, and verify the connected user
receives `notification.created`. Connect without a valid session and verify the
socket is rejected.

**Acceptance Scenarios**:

1. **Given** a user has a valid active or pending-contributor session, **When** the user connects to the notifications socket, **Then** the socket joins only that user's notification room.
2. **Given** a notification is persisted for a connected user, **When** the notification service emits it, **Then** only sockets for that user receive `notification.created`.
3. **Given** no socket is connected, **When** a notification is persisted, **Then** the notification remains stored and the service reports that no real-time delivery occurred.
4. **Given** an invalid, expired, or revoked session token, **When** a socket connection is attempted, **Then** the socket receives an authorization error and disconnects.

---

### Edge Cases

- What happens when an admin tries to review a skill that is already approved, rejected, or superseded?
- How does the system handle an empty pending queue or pagination beyond the last page?
- What happens when the request carries an invalid proficiency label or missing rejection note?
- How does the system handle two admins trying to review the same pending skill at the same time?
- How are pending or rejected skills excluded from eligibility reads when downstream consumers request summaries?
- How does approval behave when the contributor account is already active, suspended, or deactivated?
- Which review actions should notify contributors before the final approval/rejection outcome?
- What happens when the contributor is offline when the notification is created?
- How does the socket avoid leaking one user's notifications to another user?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow admins to list pending AI-generated skills.
- **FR-002**: System MUST allow admins to approve a pending skill.
- **FR-003**: System MUST allow admins to reject a pending skill.
- **FR-004**: System MUST allow admins to adjust a skill's proficiency label before approval.
- **FR-005**: System MUST store review metadata including reviewer, timestamp, notes, and before/after values where applicable.
- **FR-006**: System MUST preserve a decision history for every skill review action.
- **FR-007**: System MUST exclude pending, rejected, and other non-approved skill states from eligibility decisions.
- **FR-008**: System MUST keep admin review actions within the owning module boundaries and not write other modules' tables.
- **FR-009**: System MUST activate a pending contributor account after at least one generated skill is approved.
- **FR-010**: System MUST store contributor notifications for approval and rejection review outcomes.
- **FR-011**: System MUST not activate contributors or send final outcome notifications for proficiency-only adjustments that keep skills pending.
- **FR-012**: System MUST expose an authenticated WebSocket namespace for real-time notifications.
- **FR-013**: System MUST emit persisted notification payloads only to sockets authenticated as the notification recipient.
- **FR-014**: System MUST keep notification persistence successful even when no WebSocket recipient is currently connected.

### Trust, Safety, and Audit Requirements

- **TS-001**: System MUST enforce admin authorization on review routes and review services.
- **TS-002**: System MUST record audit history for every review decision, not only the final state.
- **TS-003**: System MUST ensure eligibility readers only consume approved skills.
- **TS-004**: System MUST perform user-status and notification writes through exported services from the owning modules.
- **TS-005**: System MUST authenticate notification sockets with existing opaque access tokens and reject invalid, expired, revoked, suspended, or deactivated sessions.

### Key Entities

- **SkillProfile**: Generated skill candidate with skill name, proficiency, confidence, status, evidence, and review metadata.
- **SkillProfileReviewDecision**: Immutable audit row for one admin review action on a skill profile.
- **AdminReviewQueueItem**: Read-only queue item returned by the pending review list endpoint.
- **User**: Contributor account whose status is activated by the identity module after skill approval.
- **Notification**: In-app notification stored for contributor-facing skill review outcomes.
- **RealtimeNotification**: WebSocket event payload derived from a persisted notification row.

### API Contract Impact

- **Endpoint(s)**:
  - `GET /admin/skill-reviews/pending`
  - `POST /admin/skill-reviews/:skillProfileId/approve`
  - `POST /admin/skill-reviews/:skillProfileId/reject`
  - `PATCH /admin/skill-reviews/:skillProfileId/proficiency`
- **Request validation**: Admin-only access, valid UUID path params, valid proficiency labels, required rejection notes, and safe pagination parameters.
- **Response contract**: Pending queue items, decision responses, updated skill state with review metadata, and activation/notification side-effect metadata for final outcomes.
- **WebSocket contract**: `notifications` namespace accepts `auth.token`; emits `notification.created` with the persisted notification payload.
- **Pagination**: Required for the pending list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admins can fetch the pending skill queue and review a skill without leaving the backend in an inconsistent state.
- **SC-002**: Every approve/reject/adjust action creates a durable audit record.
- **SC-003**: Pending or rejected skills never appear in eligibility-oriented skill reads.
- **SC-004**: Review endpoints reject non-admin access and invalid transitions with stable error responses.
- **SC-005**: Approving a pending contributor's first skill activates the account and stores a skill-review notification.
- **SC-006**: Rejecting a skill stores a skill-review notification but does not activate the contributor account.
- **SC-007**: Connected contributors receive `notification.created` for their own persisted review notifications.

## Assumptions

- The feature reviews AI-generated skill candidates owned by `skill-profiles`.
- Downstream eligibility consumers will use an approved-only skill reader contract.
- A separate audit table is acceptable and preferred over relying only on the latest fields on `SkillProfile`.
- Contributor account status remains owned by `identity`; review workflow calls an exported identity service.
- Notification rows remain owned by `notifications`; review workflow calls an exported notification service.
- WebSocket delivery is best-effort after persistence; stored notifications remain the durable fallback for offline users.
- Mobile/UI work is out of scope for this backend feature.
