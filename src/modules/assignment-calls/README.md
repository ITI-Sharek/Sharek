# Assignment Calls Module

One-to-one P2P WebRTC calling between an Assignment's owner and contributor
(ADR 0016, superseding ADR 0009's LiveKit design). NestJS is authoritative for
authorization, lifecycle, and history; the two browsers negotiate a direct
`RTCPeerConnection` with mandatory DTLS-SRTP media, falling back to a TURN
relay only when a direct path is unreachable.

## The rule that shapes everything here

**Durable lifecycle is HTTP-committed-then-published, exactly like every
other command in this codebase. Only SDP offer/answer and ICE candidates
travel as socket commands** -- the one exception the amended Share-k realtime
boundary (COMMUNICATION.md, realtime boundary item 3) permits. Nothing else
about a call moves onto the socket: `start`/`answer`/`decline`/`end`/
`reconnect` are ordinary idempotent HTTP commands, committed to Postgres,
published to `/realtime` strictly after commit.

## One active call per user, platform-wide

Enforced by a raw partial unique index the migration adds outside
`schema.prisma` (Prisma cannot express a `WHERE` clause on an index):

```sql
CREATE UNIQUE INDEX "assignment_call_participation_one_active_per_user"
  ON "AssignmentCallParticipation" ("user_id") WHERE "active";
```

`AssignmentCallsService.start` creates the call and inserts both participation
rows in one transaction; if either participant is already busy, the insert
violates the index, Prisma reports `P2002`, and the service maps it to
`ASSIGNMENT_CALL_PARTICIPANT_BUSY`. This is what makes "simultaneous start
requests resolve atomically, first valid call wins" (COMMUNICATION.md rule 9)
a Postgres guarantee rather than an application-level race. A low-frequency
sweep (`AssignmentCallTimersService.sweep`, on the shared reap tick) ends
calls stuck `ringing` well past their timeout and clears orphaned `active`
participations on already-terminal calls -- without it, one lost terminal
write leaves a user permanently "busy" and unable to call anyone, forever.

## Signaling gateway: the one thing that must never change

`assignment-call-signaling.gateway.ts` shares the `/realtime` namespace with
`shared/realtime/realtime.gateway.ts` and **must never implement
`OnGatewayConnection`**. Nest invokes `handleConnection` on every gateway
bound to a namespace that implements the interface; `RealtimeGateway`'s
`handleConnection` is the only place that authenticates a socket and sets
`client.data.user`, and this gateway only ever reads that field, already set
by the time a client message arrives. `realtime.gateway-coexistence.integration.spec.ts`
proves the two gateways share the namespace without double-authenticating --
do not remove that spec's guard when touching either gateway.

Per-signal authorization (`assignment-call-authorization.service.ts`) is a
second, independent check on every delivered signal -- socket authentication
alone is not enough (boundary rule 4): shape/size limits before any database
work, live call state (memoized ~3s per `callId`, since ICE candidates arrive
in bursts of 10-30), fresh suspension status, an `offer`/`answer` state gate
(only the caller may offer; only the callee may answer, and only once
`answered_at` is actually set), and a per-socket-per-call rate limit.
`fromUserId` is always stamped from the authenticated socket, never read from
the payload.

Relay stays on the existing `user:<id>` room -- **no per-call room**. A call
has exactly two participants and the server already knows both from the row
it just authorized; a per-call room would add a second source of truth for
membership. The cost is a multi-tab hazard: `user:<id>` fan-out reaches every
tab a user has open, so `callSessionId` (a random per-tab id returned by
`start`/`answer`, never persisted, only relayed opaquely) is what lets each
tab recognize a signal is not its own.

## Timers: server-authoritative, client-mirrored, never the reverse

BullMQ **delayed** jobs (`jobs/assignment-call.queue.ts`) -- `delay` plus a
stable custom `jobId`, cancelled with `queue.remove(jobId)`. Every other
queue in this repository uses `repeat` for periodic sweeps; this is the first
use of BullMQ as a per-instance countdown timer, which is why it has its own
spec proving arm/cancel/fire.

| Timer | Armed | Fires |
|---|---|---|
| Ring timeout (30s) | `start` | `ringing -> missed`, releases both participations, missed-call notification |
| Reconnect grace (30s) | observed socket disconnect while `answered` | `answered -> ended`, `end_reason='reconnect_timeout'` |
| Duration warnings (50/58min) + max-duration cap (60min) | `answer`, not `start` | transient warning event; hard `ended`, `end_reason='max_duration'` |

Disconnect observation is one small addition to `shared/realtime`:
`RealtimeGateway.handleDisconnect` emits an internal `realtime.socket.disconnected`
event (`shared/events/`, via `@nestjs/event-emitter`) for any authenticated
socket, transport-level only -- it does not know or care why a socket
disconnected. `AssignmentCallTimersService` listens and arms the grace timer
unconditionally for a user with an `active` participation on an `answered`
call; it does **not** first check whether that user has some other still-open
socket, because a prompt reconnect (from any tab) always cancels the job
before it fires, which makes the "any other connected socket" check
unnecessary rather than merely optional.

## TURN credentials

`assignment-call-ice.service.ts` mints coturn REST-style ephemeral
credentials (RFC 7635 / `use-auth-secret`): `username = "{unixExpiry}:{userId}"`,
`credential = HMAC-SHA1(TURN_STATIC_AUTH_SECRET, username)` base64-encoded.
**SHA-1 here is mandated by coturn's REST scheme and is used inside an HMAC**
-- do not "fix" it to SHA-256; that silently breaks every relayed call against
a standard coturn deployment. `TURN_STATIC_AUTH_SECRET` never reaches the
browser, and a spec asserts it never appears in a serialized response.

## TURN bandwidth budget -- a guard, not a cap

Unlike LiveKit's participant-minute allowance, whether a call will relay
through TURN at all is unknown until ICE negotiation happens. `TURN_MONTHLY_BUDGET_BYTES`
is therefore a budget measured *after the fact*: `AssignmentCallCapacityService.pollAndRecordUsage`
is meant to run once daily from the TURN provider's own usage API and
snapshot the result into `CommunicationCapacityUsage`; `start`/`answer` read
the latest snapshot. **No production TURN provider credentials exist in this
environment yet**, so `pollAndRecordUsage` currently records zero usage --
the daily BullMQ job and the read path are real; only the provider HTTP call
inside `pollAndRecordUsage` is a stand-in, a one-method change away from a
real Cloudflare/Twilio integration. A fresh deployment with no poll history
fails open (not exhausted) rather than blocking every call before its first
real measurement.

## E2EE: zero implementation work

DTLS-SRTP is mandatory in WebRTC and cannot be disabled by either peer, so
ADR 0011's guarantee is satisfied by construction -- see that ADR for why this
is a *stronger* instance of the original commitment, not a reinterpretation
of it.

## Quiet hours (COMMUNICATION.md DEC-057)

`AssignmentCallsService.start` checks the callee's stored quiet-hours
preference (already owned by `notifications.NotificationPreference`, read
directly rather than duplicated) and rejects with `ASSIGNMENT_CALL_QUIET_HOURS`
**before any row is created** -- the caller sees the same "Participant
unavailable" shape a busy peer would produce, never a hint that quiet hours
specifically were the reason. This is a narrower reading of "attempted calls
become missed calls" than a literal missed-call history row; flagged here as
a judgment call rather than an unstated one.

## Feature flag

Every route and every job checks `ASSIGNMENT_CALLS_ENABLED` independently;
with it off, every command throws `ASSIGNMENT_CALL_DISABLED` and nothing else
in this module runs.
