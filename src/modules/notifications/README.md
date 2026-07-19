# Notifications Module

Owns in-app notification records and notification-write workflows.

## Current API

No public HTTP routes are exposed yet.

## Current WebSocket Surface

- Namespace: `/notifications`
- Client auth: `auth.token` with the same opaque access token used by HTTP APIs
- Server event: `notification.created`
- Unauthorized event before disconnect: `notifications.error`

## Structure

```text
notifications.module.ts
notifications.service.ts
notifications.service.spec.ts
notifications.gateway.ts
notifications.gateway.spec.ts
dto/
README.md
```

`NotificationsService` writes `Notification` rows for user-facing events. Other
modules request notifications through this exported service instead of writing
the `notifications` table directly.

`NotificationsGateway` authenticates socket connections against existing access
token sessions and joins each socket to a per-user room. Stored notifications
are emitted to the recipient's room after persistence. Offline users still keep
the durable notification row.

Current supported workflow:

- skill-review outcome notifications for contributors after admin approval or
  rejection.

Future notification inbox, read-state, delivery channels, task-match alerts, and
premium-tier notification rules should stay in this module.
