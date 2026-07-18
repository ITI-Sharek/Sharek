# No WebSockets or real-time chat in MVP

**Status:** REJECTED on 2026-07-18; superseded by COL-001 and ADR-016

The required MVP does not depend on conversations, DMs, presence, typing indicators, read receipts, or a WebSocket gateway. Task-scoped comments and polled notifications are sufficient until the complete contribution loop works.

This rationale is retained for history. The approved direction now requires
durable discussions, project-scoped direct messages, and real-time notification
delivery while still deferring presence, typing indicators, read receipts, and
other chat polish.

## Historical consequences — no longer current

- Redis is used for BullMQ queues only — never as a pub/sub layer for realtime delivery.
- Reconsider only after the complete verified-contribution loop works end to end (`../delivery-plan.md`).
