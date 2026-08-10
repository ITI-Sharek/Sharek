# Research: Durable Realtime Notification Foundation

## Decision 1: Use the official Socket.IO Redis adapter with `node-redis`

**Decision**: Add `@socket.io/redis-adapter` and `redis`, create one publisher client and one duplicated subscriber client from `REDIS_URL`, connect both before installing the adapter, and close both during shutdown.

**Rationale**: NestJS's official adapter guide uses this exact boundary for broadcasts across load-balanced instances. Redis's Node.js guidance requires a dedicated duplicated connection for subscription mode.

**Alternatives considered**:

- Keep the process-local socket map: rejected because an HTTP request and recipient socket may land on different instances.
- Reuse BullMQ's internal Redis client: rejected because it is not an exported application connection contract and subscriber mode requires a dedicated connection.
- Add Kafka: rejected by DEC-074 and disproportionate for MVP.

**Primary references**:

- <https://docs.nestjs.com/websockets/adapter>
- <https://redis.io/docs/latest/develop/clients/nodejs/connect/>
- <https://redis.io/docs/latest/develop/use-cases/pub-sub/nodejs/>

## Decision 2: Use WebSocket transport for the multi-instance realtime client

**Decision**: The new `/realtime` client requests Socket.IO `websocket` transport only. If WebSocket cannot connect, the UI presents degraded realtime and continues through durable HTTP.

**Rationale**: The NestJS adapter documentation warns that Redis alone does not make polling safe across load-balanced instances; polling requires sticky routing. Share-k does not need a second infrastructure dependency for MVP because realtime is an acceleration channel, not command authority.

**Alternative considered**: Keep WebSocket plus polling and require sticky sessions. Rejected for Slice 1 because it adds load-balancer state and a second behavior to test while HTTP recovery already provides the honest fallback.

**Primary reference**: <https://docs.nestjs.com/websockets/adapter>

## Decision 3: Pair Redis Pub/Sub with PostgreSQL state and a Notification event outbox

**Decision**: Commit the Notification state and append-only Notification event together in PostgreSQL, publish the persisted event after commit, and retry pending publication in bounded batches. Clients reconcile state from HTTP on connection/reconnection/focus.

**Rationale**: Redis Pub/Sub is at-most-once and does not retain messages for disconnected subscribers. A direct emit after commit cannot recover a process crash in the commit/publication gap. The outbox supplies a stable event ID for retries while the Notification record remains the user-visible truth.

**Alternatives considered**:

- Treat Redis Pub/Sub as durable: rejected by Redis's documented delivery semantics and ADR 0013.
- Use Redis Streams as the source of truth: rejected because PostgreSQL is already authoritative and clients still need authorized inbox pagination.
- Skip the event table and generate a new event ID on retry: rejected because clients could not reliably deduplicate one logical fact.

**Primary reference**: <https://redis.io/docs/latest/develop/use-cases/pub-sub/nodejs/>

## Decision 4: Use keyset cursors over `(created_at, id)`

**Decision**: Encode a versioned JSON cursor containing ISO timestamp and UUID as Base64URL; query `created_at DESC, id DESC` with the lexicographic boundary.

**Rationale**: Offset pagination shifts under concurrent inserts and cleanup. A compound keyset remains stable when new Notifications arrive, while the opaque encoding lets the server evolve cursor internals.

**Alternatives considered**:

- Offset/page numbers: rejected because concurrent inserts duplicate/skip rows.
- UUID-only cursor: rejected because UUIDv4 does not represent creation order.

## Decision 5: Keep templates in typed backend code for MVP

**Decision**: Versioned TypeScript definitions validate parameters, construct trusted deep links, choose priority, and render Arabic/English copy. Template identity is persisted; rendered strings are not authoritative.

**Rationale**: Slice 1 has two languages and a bounded catalog. Code-owned definitions are reviewable, testable, deploy atomically with parameter changes, and avoid introducing a CMS or database-editable executable template language.

**Alternatives considered**:

- Persist rendered copy only: rejected by ADR 0012.
- Frontend-only catalogs: rejected because closed-tab delivery later needs backend presentation.
- Database-editable templates: deferred until real non-developer editorial needs justify validation/versioning complexity.

## Decision 6: Preserve legacy columns for one coordinated cutover

**Decision**: Add and backfill semantic columns, stop writing legacy rendered fields, keep those columns nullable during the coordinated client transition, then remove them in a separately reviewed cleanup migration.

**Rationale**: The frontend and backend are separate repositories. An additive first migration prevents deployment-order breakage and lets representative rows be verified before destructive column removal.

**Alternative considered**: Add, backfill, and drop in one migration. Rejected because rollback would require restoring presentation data and an older client could break during staggered deployment.

## Decision 7: Hard-delete expired Notification-owned presentation

**Decision**: The retention worker deletes expired Notification rows and their Notification events in bounded recipient-aware batches. Origin workflow audits remain in their owning modules.

**Rationale**: The canonical contract requires purging recipient-facing presentation, not keeping a Notification tombstone. Independent Application/Proposal/etc. audit records already preserve the originating fact without retaining inbox copy or deep links.

**Alternative considered**: Soft-delete forever. Rejected because it defeats user-selected retention and accumulates personal presentation data indefinitely.
