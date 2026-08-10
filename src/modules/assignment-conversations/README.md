# Assignment Conversations

This module owns the first Sprint 9 Core Assignment Chat vertical slice:

- Assignment acceptance creates one `AssignmentConversation` atomically.
- Only the Assignment's project owner and assigned contributor can list a
  conversation, read its messages, or send a message.
- Messages are durable, ordered, limited to 4,000 Unicode characters, and
  replay-safe through the caller's idempotency key.
- Each new Message appends one stable `MessageEvent` outbox row in the same
  PostgreSQL transaction. Only after commit, the module publishes a version-one
  `conversation.message.created` envelope to both participant user rooms on
  the shared `/realtime` namespace.
- Conversation and Message responses include the persisted owner/contributor
  and sender display names. A new Message also creates or updates the grouped
  unread `conversation_activity` Notification for the other participant in the
  same transaction; its notification event is published only after commit.
- Cursor pagination and message text search stay scoped to the authorized
  conversation.

`MessageEvent` publication is at-least-once: a partial or failed participant
handoff leaves the event unpublished with safe attempt metadata. The durable
Message/history HTTP API remains authoritative, and clients deduplicate stable
event IDs and reconcile sequence gaps through HTTP.

Message-event scheduled recovery, editing, retraction, reactions, read
positions, presence, typing, attachments, and calls remain follow-up vertical
slices. There is intentionally no public conversation-creation endpoint.
