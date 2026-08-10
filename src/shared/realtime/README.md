# Shared Realtime Transport

`shared/realtime` owns the technical authenticated Socket.IO transport shared
by future realtime features. It does not know Notification templates,
categories, persistence, or business policy beyond validating the existing
session and joining `user:<id>`.

The `/realtime` namespace accepts WebSocket transport and emits version-one
`RealtimeEventEnvelope` values under their `type`. Current durable event types
are `notification.created`, `notification.read_state_changed`, and
`conversation.message.created`. `RealtimePublisherService` publishes to one
authenticated user room; Socket.IO's Redis adapter supplies cross-instance
fan-out when `REDIS_URL` is available.

Set `REALTIME_NOTIFICATIONS_ENABLED=true` to enable the gateway and bootstrap
adapter. Redis connection failure is deliberately non-fatal: HTTP startup and
local Socket.IO delivery continue, while durable producers remain responsible
for retry/reconciliation. The Notifications module runs a bounded BullMQ
recovery worker for unpublished event records; it republishes the same stable
event ID and records only safe operational error codes, including
`REALTIME_RETRY_EXHAUSTED` after the configured cap.

The opt-in two-instance Redis evidence suite runs with
`REALTIME_REDIS_INTEGRATION=true npx jest
src/shared/realtime/realtime.redis.integration.spec.ts --runInBand`. It covers
cross-instance fan-out, duplicate envelope delivery, publisher outage, and
post-reconnect delivery. Redis publish rejections are contained so the local
Socket.IO broadcast path remains available during an outage.
