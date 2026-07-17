# No WebSockets or real-time chat in MVP

**Status:** PROPOSED

The required MVP does not depend on conversations, DMs, presence, typing indicators, read receipts, or a WebSocket gateway. Task-scoped comments and polled notifications are sufficient until the complete contribution loop works.

## Consequences

- Redis is used for BullMQ queues only — never as a pub/sub layer for realtime delivery.
- Reconsider only after the complete verified-contribution loop works end to end (`../delivery-plan.md`).
