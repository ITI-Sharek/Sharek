# Contract: Notification HTTP API and `/realtime`

All routes are unprefixed, require the existing access token, and derive the recipient from the session. Timestamps are ISO-8601 UTC. Response examples use English presentation; Arabic is returned when the current user preference is `ar`.

## List Notifications

```http
GET /notifications?cursor=<opaque>&limit=20&readState=unread&type=application_status
```

- `limit`: optional integer 1–100, default 20.
- `readState`: optional `read | unread`.
- `type`: optional known Notification type.

```json
{
  "items": [
    {
      "notificationId": "uuid",
      "type": "application_status",
      "templateKey": "application.accepted",
      "templateVersion": 1,
      "title": "Application accepted",
      "body": "Your Application was accepted and an Assignment was created.",
      "deepLink": "/applications/uuid",
      "priority": "attention",
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-08-08T10:00:00.000Z",
      "aggregateVersion": 1
    }
  ],
  "nextCursor": "opaque-or-null"
}
```

The response excludes recipient ID, parameters, deduplication key, legacy rendered fields, and event publication state.

## Unread Count

```http
GET /notifications/unread-count
```

```json
{ "unreadCount": 3 }
```

## Set Read State

```http
PATCH /notifications/:notificationId/read-state
Content-Type: application/json

{ "state": "read" }
```

`state` is `read | unread`. Replaying the same state returns the current representation without creating another aggregate version/event. A real change increments `aggregateVersion` and appends one event.

Response: one Notification presentation DTO.

Errors:

- `NOTIFICATION_NOT_FOUND` — malformed/missing/other-user/expired share the non-leaking boundary.
- `NOTIFICATION_READ_STATE_INVALID` — unsupported state.

## Mark All Read

```http
POST /notifications/mark-all-read
Content-Type: application/json

{}
```

```json
{
  "updatedCount": 12,
  "snapshotAt": "2026-08-08T10:05:00.000Z"
}
```

Only the caller's retained unread rows with `created_at <= snapshotAt` are updated. Each changed Notification gets its own aggregate version/event so all tabs can converge. Replaying after convergence returns `updatedCount: 0`.

## Preferences

```http
GET /me/notification-preferences
```

```json
{
  "retentionDays": 90,
  "quietHours": {
    "enabled": false,
    "startLocal": null,
    "endLocal": null,
    "timeZone": null
  },
  "revision": 1,
  "categories": [
    {
      "type": "application_status",
      "requiredInApp": true,
      "inAppEnabled": true,
      "browserEnabled": false
    }
  ]
}
```

```http
PATCH /me/notification-preferences
Content-Type: application/json

{
  "expectedRevision": 1,
  "retentionDays": 180,
  "quietHours": {
    "enabled": true,
    "startLocal": "22:00",
    "endLocal": "07:00",
    "timeZone": "Africa/Cairo"
  },
  "categories": [
    {
      "type": "task_recommendation",
      "inAppEnabled": false,
      "browserEnabled": false
    }
  ]
}
```

The patch is partial except that an included `quietHours` object is complete. Category entries update only named categories.

Errors:

- `NOTIFICATION_RETENTION_INVALID`
- `NOTIFICATION_QUIET_HOURS_INVALID`
- `NOTIFICATION_TIME_ZONE_INVALID`
- `NOTIFICATION_REQUIRED_CATEGORY`
- `NOTIFICATION_PREFERENCES_REVISION_CONFLICT`

## Current-user language preference

Language remains identity-owned; it is not part of Notification preferences.

```http
PATCH /auth/me/preferences
Content-Type: application/json

{ "preferredLanguage": "ar" }
```

The body is an exact allowlist with one required field: `preferredLanguage` is `ar | en`. The authenticated current user is the only target. The response is the same public auth-user DTO returned inside the existing session contract, including the updated `preferredLanguage`; it excludes the raw User record. Replaying the current value is idempotent.

Errors:

- `AUTH_PREFERRED_LANGUAGE_INVALID`
- the existing authentication/session errors

## Realtime Connection

```text
Namespace: /realtime
Transport: websocket
Authentication: handshake.auth.token or Authorization bearer header
Recipient room: user:<authenticated-user-id>
```

Unauthorized event before disconnect:

```json
{
  "code": "REALTIME_UNAUTHORIZED",
  "message": "Invalid or expired session"
}
```

The event name is the envelope `type`, and the event body is the complete envelope:

```json
{
  "eventId": "uuid",
  "type": "notification.created",
  "version": 1,
  "occurredAt": "2026-08-08T10:00:00.000Z",
  "aggregateId": "notification-uuid",
  "aggregateVersion": 1,
  "payload": {
    "notification": {
      "notificationId": "notification-uuid",
      "type": "application_status",
      "templateKey": "application.accepted",
      "templateVersion": 1,
      "title": "Application accepted",
      "body": "Your Application was accepted and an Assignment was created.",
      "deepLink": "/applications/uuid",
      "priority": "attention",
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-08-08T10:00:00.000Z",
      "aggregateVersion": 1
    }
  }
}
```

Initial types:

- `notification.created`
- `notification.read_state_changed`

Events may repeat. No global ordering is promised. For one Notification, `aggregateVersion` is monotonic. A duplicate `eventId` is ignored. A version gap causes HTTP list/detail/count reconciliation; the client never invents missing state.

## Stable General Errors

- `REALTIME_UNAUTHORIZED`
- `NOTIFICATION_CURSOR_INVALID`
- `NOTIFICATION_TYPE_INVALID`
- `NOTIFICATION_TEMPLATE_INVALID`
- `NOTIFICATION_TEMPLATE_UNAVAILABLE` (internal creation failure; reads use generic fallback)
- `NOTIFICATION_NOT_FOUND`
- `NOTIFICATION_PREFERENCES_REVISION_CONFLICT`

Human `message` text is presentation only. Clients branch on `code`.
