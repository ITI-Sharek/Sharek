# Feature Specification: Durable Realtime Notification Foundation

**Feature Branch**: `006-realtime-notification-foundation`

**Created**: 2026-08-08

**Status**: Ready for implementation planning

**Input**: Sprint 9 Slice 1 and backlog TASK-9-02.

**Traceability**: TASK-9-02; DEC-044, DEC-052, DEC-054–057, DEC-064, DEC-068–070, DEC-072–075; ADR 0007, 0010, 0012, 0013; `../docs/architecture/contracts/realtime-communication-contract.md`.

## Source Classification

- **Current behavior**: `Notification` rows store rendered English `title` and `message` plus loosely shaped `metadata`. Other modules correctly call the exported `NotificationsService`, and transaction-aware Application/Proposal workflows persist before emitting. There is no Notification HTTP controller, cursor recovery, durable read API, preference model, retention cleanup, or semantic localization. `NotificationsGateway` exposes `/notifications`, keeps an in-process socket map, and emits `notification.created`. The current web client holds only socket-delivered entries and marks them read locally. `User.preferred_language` exists and is returned by `GET /auth/me`, but no authenticated endpoint currently updates it.
- **Approved target behavior**: Notifications are semantic, localized at presentation time, server-authoritative, cursor-recoverable, retention-bound, and published through one authenticated `/realtime` channel. Every user-facing module continues to persist through `NotificationsService`; Redis coordinates multi-instance delivery but never owns Notification truth.
- **Assumptions**: Existing `preferred_language` remains the recipient language source and Slice 1 adds a small identity-owned update endpoint for it. Existing Application, Proposal, and skill-review notifications can be mapped to version-1 templates from their type and metadata. Browser Push and service-worker delivery remain Slice 5.
- **Unresolved decisions**: None at product level. Exact migration, transaction-publication, and Redis adapter mechanics are selected in `plan.md` and may be revised only if they preserve the shared contract.

## User Scenarios & Testing

### User Story 1 - Catch up after any disconnect (Priority: P1)

As an authenticated user, I want a durable Notification inbox so that closing a tab, losing a socket, or changing devices never loses an important update.

**Why this priority**: Durable recovery is the foundation on which every later realtime feature depends.

**Independent Test**: Create Notifications while the recipient has no socket, authenticate later, page through the inbox, and confirm every retained item and the unread total are returned exactly once in stable order.

**Acceptance Scenarios**:

1. **Given** a committed Notification and no connected recipient, **When** the recipient requests the first inbox page, **Then** the Notification is returned with localized presentation and unread state.
2. **Given** more retained Notifications than one page, **When** opaque cursors are followed, **Then** results are stable, descending, non-duplicated, and recipient-scoped.
3. **Given** a socket disconnect during publication, **When** the client reconnects and reconciles through HTTP, **Then** committed state is recovered without relying on socket history.

### User Story 2 - Keep read state consistent across devices (Priority: P1)

As an authenticated user, I want intentional read/unread actions to persist so that badges and lists agree across tabs and devices.

**Why this priority**: Local-only read state is misleading and makes reconnect recovery incorrect.

**Independent Test**: Mark one item read, unread, and all retained items read through HTTP while two sockets are connected; confirm both clients receive the committed new state and passive delivery never marks an item read.

**Acceptance Scenarios**:

1. **Given** an unread Notification, **When** the owner sends `read`, **Then** `readAt` is recorded once and all recipient sockets receive the new aggregate version.
2. **Given** a read Notification, **When** the owner sends `unread`, **Then** `readAt` becomes null and the unread count increases.
3. **Given** a Notification belongs to another user, **When** it is addressed by ID, **Then** the response follows the non-leaking not-found convention.

### User Story 3 - Receive current-language, preference-aware presentation (Priority: P1)

As a user, I want Notifications rendered in my current Arabic or English preference and retained for my chosen period without disabling required workflow alerts.

**Why this priority**: Storing rendered English copy contradicts Share-k's bilingual product contract and prevents trustworthy preferences.

**Independent Test**: Read the same retained semantic Notification before and after changing language, update retention/category/quiet-hours preferences, and verify required categories cannot be disabled.

**Acceptance Scenarios**:

1. **Given** a retained semantic Notification, **When** the recipient language changes, **Then** its next API presentation uses the new catalog without mutating the record.
2. **Given** an unknown template version, **When** it is presented, **Then** a generic localized alert and authorized deep link are returned without exposing raw parameters.
3. **Given** a required in-app category, **When** a user attempts to disable it, **Then** the command is rejected with a stable code and current preferences remain unchanged.
4. **Given** a 30/90/180/365-day retention selection, **When** cleanup runs, **Then** only expired Notification presentation data is removed and originating workflow/audit records remain unchanged.

### User Story 4 - Deliver one realtime stream across instances (Priority: P1)

As a signed-in user, I want new and updated Notifications to appear quickly regardless of which API instance handled the workflow or socket.

**Why this priority**: The existing process-local room map fails as soon as Share-k runs more than one backend instance.

**Independent Test**: Connect a socket through one instance, create a Notification through another, and confirm the event arrives through Redis fan-out with a stable envelope; then stop Redis and prove HTTP state remains correct and recoverable.

**Acceptance Scenarios**:

1. **Given** a valid active session, **When** `/realtime` connects, **Then** it joins only its own user room.
2. **Given** an invalid, expired, revoked, or suspended session, **When** it connects, **Then** it receives a stable unauthorized error and disconnects.
3. **Given** the same committed event is delivered more than once, **When** a client compares `eventId` and aggregate version, **Then** it can deduplicate safely.
4. **Given** Redis is unavailable, **When** a durable Notification command succeeds, **Then** PostgreSQL state remains correct and the client can recover it through HTTP.

### Edge Cases

- Two devices mark the same Notification to opposite states concurrently; database order and aggregate version determine the final state.
- A cursor references an item purged by retention between pages; pagination resumes safely without leaking or failing the whole page.
- A template parameter is missing, extra, incorrectly typed, or unsafe for the selected audience.
- An old row has incomplete legacy metadata and cannot map to a specialized template.
- A user changes language or retention while another device has an open inbox.
- `Mark all read` races with a newly created Notification; only rows committed before the command snapshot are changed.
- A transaction creates a Notification but the immediate realtime publication attempt fails.
- Redis reconnect causes duplicate fan-out or sockets move between backend instances.

## Requirements

### Functional Requirements

- **FR-001**: `notifications` MUST remain the sole owner and writer of Notification records and MUST expose an exported transaction-aware creation service to other modules.
- **FR-002**: New Notification records MUST store type, versioned template key, validated audience-safe parameters, recipient, authorized deep link, priority, and durable read state; rendered English copy MUST NOT be authoritative.
- **FR-003**: Existing Notification rows MUST remain recoverable through a data-preserving migration and a generic version-1 fallback when specialized mapping is impossible.
- **FR-004**: The backend MUST render Arabic or English title/body from backend-owned catalogs using the recipient's current preferred language.
- **FR-005**: Unknown template versions MUST render a generic localized fallback without returning raw internal parameters.
- **FR-006**: `GET /notifications` MUST return recipient-scoped retained items with opaque cursor pagination and filters for read state and category.
- **FR-007**: `GET /notifications/unread-count` MUST return the server-authoritative unread count.
- **FR-008**: `PATCH /notifications/:notificationId/read-state` MUST support explicit `read` and `unread` state, be idempotent, and conceal missing/other-user records identically.
- **FR-009**: `POST /notifications/mark-all-read` MUST update a bounded database snapshot and MUST NOT mark later concurrent Notifications read.
- **FR-010**: Preference APIs MUST support retention of 30, 90, 180, or 365 days (default 90), optional daily quiet hours/timezone, and per-category settings.
- **FR-011**: Required in-app security, moderation, Application decision, Assignment, Delivery, Proposal response, and missed-call categories MUST remain enabled; optional categories may be disabled.
- **FR-012**: Slice 1 MUST expose one authenticated Socket.IO namespace `/realtime`; `/notifications` is a temporary migration surface only and MUST be removed by the coordinated Slice 1 cutover.
- **FR-013**: Durable events MUST use the approved envelope with stable event ID, type, version, occurrence time, aggregate ID/version, and allowlisted payload.
- **FR-014**: Notification creation/read events MUST publish only after their transaction commits, may repeat, and MUST remain recoverable from PostgreSQL when publication fails.
- **FR-015**: Socket.IO MUST use Redis for cross-instance room/event fan-out; process-local connection tracking MUST NOT determine whether a committed event exists.
- **FR-016**: Redis outage MUST degrade realtime presentation without rejecting otherwise valid durable HTTP commands or changing their result.
- **FR-017**: A repeatable cleanup workflow MUST purge expired Notification presentation according to each recipient's current retention selection without touching originating workflow/audit records.
- **FR-018**: Browser Push subscriptions, service-worker delivery, Message Notifications, and calls MUST NOT be implemented in this slice; the contracts must remain extensible for them.
- **FR-019**: Identity MUST expose an authenticated `PATCH /auth/me/preferences` command that accepts only `preferredLanguage: ar | en`, updates the current user, and returns the existing public auth-user representation; Notifications MUST read that value rather than own language state.

### Trust, Safety, and Audit Requirements

- **TS-001**: Every HTTP item/read/preference query and socket connection MUST derive recipient identity from the active session, never request input.
- **TS-002**: DTOs and socket payloads MUST allowlist fields and MUST NOT expose raw Prisma records, internal deduplication keys, unsafe parameters, Message content, filenames, secrets, or inaccessible target details.
- **TS-003**: Deep links MUST be generated by trusted template definitions from validated identifiers; callers MUST NOT persist arbitrary external URLs as Notification destinations.
- **TS-004**: Read and preference mutations MUST be idempotent and concurrency-tested; important mutation facts must be represented by durable aggregate versions/events.
- **TS-005**: Logs MUST contain safe IDs, event types, aggregate versions, lag, and stable errors only; rendered bodies and parameters are excluded.
- **TS-006**: Suspension/revocation MUST prevent new socket use immediately on connection and provide a callable disconnect boundary for later session-status changes.

### Key Entities

- **Notification**: Recipient-owned semantic alert and authoritative read state.
- **Notification Event**: Durable append-only created/read-state fact used for stable realtime publication and retry.
- **Notification Preference**: Recipient retention and quiet-hours configuration.
- **Notification Category Preference**: Per-recipient delivery preference for one semantic category, constrained by required-category policy.

### API Contract Impact

- **Endpoints**: Add the Notification list/count/read/mark-all/preferences endpoints and the identity-owned language-preference endpoint in `contracts/http-and-realtime.md`.
- **Request validation**: UUIDv4 IDs, cursor shape, bounded page size, known category/read-state values, retention allowlist, valid IANA timezone, and complete quiet-hours pair.
- **Response contract**: Explicit localized Notification presentation and preference DTOs; no raw persistence rows.
- **Pagination**: Opaque `(created_at,id)` cursor with deterministic descending order.

### External Dependency Behavior

- **Redis timeout/rate limit**: Connection and publish errors set degraded health/logging and trigger retry/recovery; durable commands do not wait indefinitely for Redis.
- **Revocation/deletion**: Auth session/user status controls socket admission; retention hard-deletes Notification-owned presentation/event rows after the configured cutoff.
- **Retry/idempotency/concurrency**: Notification deduplication keys remain unique, read commands are state-idempotent, event publication uses stable persisted IDs, and duplicate event delivery is accepted.
- **Partial failure**: A committed HTTP result remains successful if realtime publication fails; the pending durable event and inbox API provide recovery.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Offline creation followed by HTTP recovery returns 100% of retained authorized Notifications with no duplicate page entries.
- **SC-002**: Read/unread/count state converges across two tabs/devices after each committed command without reload.
- **SC-003**: Existing Application, Proposal, and skill-review rows migrate without loss and render in both Arabic and English.
- **SC-004**: Notification presentation reaches a connected client at p95 within two seconds of database commit in the test environment.
- **SC-005**: The first 100 retained events/items reconcile within five seconds after reconnect in the agreed test profile.
- **SC-006**: Cross-instance tests prove delivery through Redis while Redis-outage tests prove durable state and HTTP recovery remain correct.
- **SC-007**: Authorization tests produce zero cross-user item, count, preference, socket-room, parameter, or deep-link leakage.

## Assumptions

- The existing access-token session table and active/pending contributor policy remain the authentication source for this slice.
- User language changes use the new identity-owned contract defined by this slice; Notification reads always consult current language.
- Browser Push is designed later against the semantic record and preference model rather than added now.
- Repository-local implementation may use a feature flag for coordinated client/server cutover but may not maintain two permanent realtime stacks.
