# Durable collaboration with WebSocket delivery

**Status:** APPROVED through COL-001

ShareK uses NestJS WebSocket delivery for project/task discussions,
project-scoped direct messages, and persisted notifications. The owning NestJS
service writes the durable record before acknowledging the event. HTTP APIs
provide history and reconnect recovery.

## Consequences

- Authentication and room authorization are checked server-side on connection,
  subscription, send, and relationship changes.
- WebSocket rooms never grant application, assignment, evidence, review, or
  reputation authority.
- Redis pub/sub may fan out events when deployment has multiple NestJS instances;
  PostgreSQL remains the durable source of message/notification truth.
- Rejected, withdrawn, expired, suspended, and removed users lose private access.
- Presence, typing indicators, read receipts, reactions, and voice/video are not
  part of the required delivery path.
