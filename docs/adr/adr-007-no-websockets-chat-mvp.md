# No WebSockets or real-time chat in MVP

**Status:** Accepted

Coordination happens through flat task comments, submission comments, and polled in-app notifications — no conversations, DMs, presence, typing indicators, or read receipts, and no WebSocket gateway anywhere in the backend. This directly overrides the v2 Master Brief, which had added a full chat feature (project rooms, DMs, WebSocket delivery) as MVP scope — the old BMAD PRD/ERD/sprints never had chat at all, so this isn't reverting existing work, it's declining to build something a later draft proposed adding.

## Consequences

- Redis is used for BullMQ queues only — never as a pub/sub layer for realtime delivery.
- "Chat consumes the schedule" was explicitly named as a risk in the v2 Brief's own risk register; not building it removes the risk instead of mitigating it.
- Reconsider only after the full verified-contribution loop works end-to-end (`product-brief.md` §3) — not a permanent rejection, an ordering decision.
