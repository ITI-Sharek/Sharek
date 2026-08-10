# Quickstart: Verify Durable Realtime Notifications

## Preconditions

- PostgreSQL and Redis are available through the repository's Docker Compose environment.
- The migration is applied and the new client uses `/realtime` with WebSocket transport.
- Two users and access tokens exist; one has `preferred_language=en`, the other `ar`.

## 1. Offline durability

1. Ensure the recipient has no connected socket.
2. Trigger one existing Application or Proposal Notification.
3. Call `GET /notifications` as the recipient.
4. Verify the item appears, contains no raw parameters/deduplication key/user ID, and `GET /notifications/unread-count` returns the expected total.

## 2. Localization

1. Read the same retained item in English.
2. Change the recipient's preferred language to Arabic through `PATCH /auth/me/preferences`.
3. Read the inbox again.
4. Verify template identity is unchanged and title/body are Arabic.

## 3. Read-state convergence

1. Connect two recipient clients to `/realtime`.
2. Mark one item read through HTTP from client A.
3. Verify both clients receive one logical `notification.read_state_changed` aggregate version, despite allowed duplicate delivery.
4. Mark it unread and verify count/list state converges.
5. Displaying the item without a command must not mark it read.

## 4. Reconnect recovery

1. Disconnect client B.
2. Create at least three Notifications and change one read state.
3. Reconnect B and immediately fetch list/count.
4. Verify all committed state is recovered even if no missed socket events replay.

## 5. Cross-instance fan-out

1. Run two API instances against the same PostgreSQL/Redis.
2. Connect through instance A and create through instance B.
3. Verify the event arrives within the two-second p95 gate and contains the approved envelope.

## 6. Redis outage

1. Stop Redis after both API and database are available.
2. Create or update a Notification through HTTP.
3. Verify the HTTP command and PostgreSQL state succeed while realtime reports degraded/unavailable.
4. Restore Redis and run pending-event recovery or reconnect reconciliation.
5. Verify the user sees the committed state without duplication.

## 7. Preferences and retention

1. Verify default retention is 90 days and browser categories default off.
2. Set 30-day retention and overnight Cairo quiet hours.
3. Attempt to disable a required Application decision category and verify the stable rejection.
4. With a controlled clock, run cleanup immediately before and at the cutoff.
5. Verify expired Notification/Event rows are removed and Application/Proposal/audit rows remain.

## 8. Authorization

- User A cannot list, count, mutate, or infer User B's Notifications.
- Invalid/revoked/expired/suspended sessions cannot stay connected.
- Socket A never receives a User B room event.
- Malformed and other-user Notification IDs share the approved non-leaking response.

## 9. Automated performance and isolation profile

The backend includes a repeatable profile command for a development or test
environment. It requires a recipient token, a different-user token, and an
authenticated HTTP action that creates one Notification for the recipient.
The action may use `__PROFILE_RUN_ID__` in its body so repeated runs remain
idempotency-safe.

```bash
REALTIME_PROFILE_RECIPIENT_TOKEN=<recipient-token> \\
REALTIME_PROFILE_SECONDARY_TOKEN=<different-user-token> \\
REALTIME_PROFILE_TRIGGER_TOKEN=<authorized-trigger-token> \\
REALTIME_PROFILE_TRIGGER_URL=/notifications/<notification-id>/read-state \\
REALTIME_PROFILE_TRIGGER_METHOD=PATCH \\
REALTIME_PROFILE_TRIGGER_BODY='{"state":"read"}' \\
REALTIME_PROFILE_ISOLATION_TRIGGER_BODY='{"state":"unread"}' \\
npm run test:realtime:profile
```

The default gate opens 500 WebSocket connections, measures connection and
event-presentation p50/p95/max, reconciles the first 100 inbox items after
reconnect, and asserts that the secondary user receives zero events. Use test
tokens and a disposable trigger action only; the profile does not create
workflow records or modify production configuration.

## Required Gates

```text
npx prisma format
npx prisma validate
npx prisma generate
npm run check:architecture
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
npm run test:api-clients
git diff --check
```
