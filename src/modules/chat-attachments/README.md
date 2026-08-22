# Chat Attachments Module

S3-backed file attachments on Assignment Conversation messages: owner and
contributor can attach files to a message, stored in a private bucket,
validated and malware-scanned before anyone can download them.

## The rule that shapes everything here

**Upload intent is where scanning starts, not `sendMessage`.** An attachment
is uploaded and queued for a scan *before* it is attached to any Message. That
keeps `sendMessage`'s durable-command path off the scan queue, and means an
abandoned upload (never sent) is still scanned and still purged by the expiry
sweep.

## Model

`ChatAttachment` is both the upload intent and the bound attachment -- there is
no separate intent model. The bytes are already in S3 and the scan already
running at intent time, so a second model would only force copying
`storage_key`/`content_hash`/`scan_status` at bind time. `message_id` is null
until `AssignmentConversationsService.sendMessage` claims the row; `ChatAttachmentEvent` is its outbox, mirroring `MessageEvent`.

## S3 blast radius

This module is the **only** consumer of `shared/storage/` -- new chat
attachments only. Materials keep `LocalMaterialStorage`; no data migration.
`ObjectStorage` is a new, narrow port (`put`/`getStream`/`delete`/`exists`,
plus `createPresignedGetUrl`); it is deliberately **not** `MaterialStorage`
renamed or extracted, because `MaterialsModule` binds that token to
`LocalMaterialStorage`, and reusing it here would land chat attachments on
local disk -- exactly the blast radius this module rules out.

`S3ObjectStorage` is bound to one bucket and one key prefix by this module's
provider factory (`S3_CHAT_ATTACHMENTS_BUCKET` /
`S3_CHAT_ATTACHMENTS_KEY_PREFIX`); the adapter class itself reads only the
generic `S3_*` connection settings, so it stays reusable if a second S3-backed
feature ever needs it.

## Cross-module boundary: the one forwardRef in this graph

`ChatAttachmentsModule` imports `AssignmentConversationsModule` for
authorization (`getParticipation`, a thin public wrapper the conversations
service exposes over its existing private `findAuthorizedConversation`). The
binding call goes the other way -- `sendMessage` calls
`ChatAttachmentBindingService.bindToMessage` -- so
`AssignmentConversationsModule` imports this module back with `forwardRef` and
injects `ChatAttachmentBindingService` `@Optional()`. That is the same
pattern `AssignmentConversationsService` already uses for `realtime` and
`notifications`, and it means the module graph still boots with
`CHAT_ATTACHMENTS_ENABLED=false`. Only `ChatAttachmentBindingService` is
exported from this module.

## Scan lifecycle

Same state machine as Materials, on its own queue
(`CHAT_ATTACHMENT_SCAN_QUEUE_ENABLED`):

```
quarantined -> scanning -> ready
                        -> rejected
```

One divergence from `MaterialScanProcessorService`: there is no
`ChatAttachmentAudit` table, so `scan_attempts` is written as part of the
claim itself rather than counted from an audit trail, and the terminal claim
(`scanning -> ready|rejected`) is a single raw `UPDATE ... RETURNING` rather
than a Prisma `updateMany` plus a separate read. Whether to write the outbox
`ChatAttachmentEvent` row depends on `message_id` as of the *same instant* the
status transition commits -- a read taken even microseconds before or after
that instant could race a concurrent `sendMessage` bind and silently skip the
event.

**A scan finishing before binding is the common case, and it emits nothing.**
The event exists only for the case where a message was already sent while the
scan was still pending: `conversation.message.created` already carries
whatever scan state existed at send time, so a client only needs a live update
when that state changes *after* the message is visible. `attachment.scan_state_changed`
therefore only fires for a bound attachment, and its
payload never carries the storage key, a URL, or the malware signature
string.

## Download

Mint-on-demand presigned GET behind a POST that re-authorizes, not a raw
long-lived URL and not `MaterialDownloadTokenService`'s HMAC streaming
indirection -- direct S3 egress is the point of using S3. **Residual risk,
documented rather than hand-waved: once minted, the URL bypasses this
module's authorization for its TTL** (`CHAT_ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS`,
default 60s, tighter than the Material token's 300s). Mitigations: `POST` not
`GET` so it never lands in history/referrers/prefetch; forced
`Content-Disposition` with a UTF-8-encoded filename and a `Content-Type` from
the *sniffed* mime, never the declared one, so the bucket origin can never be
made to serve a payload as `text/html`; inline preview only for `image/*`
(SVG is not on the allowlist).

## Retention

Two purge sweep classes run on the shared scan-reap tick:

1. **Expired unbound intents** (`message_id IS NULL AND expires_at <= now`) --
   always active; this is what reclaims an abandoned upload.
2. **12-month terminal retention** (`conversation.read_only_at <= now -
   CHAT_ATTACHMENT_RETENTION_MONTHS`).

**Sweep 2 is dead code on arrival.** Nothing in the repository currently
writes `AssignmentConversationStatus.read_only`, so no conversation ever has a
`read_only_at`, and this sweep never purges anything today. It ships anyway so
retention takes effect the moment that transition lands elsewhere. The
30-day-before-purge warning notification COMMUNICATION.md calls for is **not
implemented** -- no notification template exists for it yet, and it depends on
the same not-yet-wired `read_only_at`. Wiring both is a listed follow-up, not
a silent gap: COMMUNICATION.md §Retention item 4 also requires purging Message
*content* (not just attachments) on the same clock, which belongs in this same
sweep once it exists.

## The first outbox recovery sweep in `assignment-conversations`

`ChatAttachmentEventRecoveryService` sweeps unpublished `ChatAttachmentEvent`
rows, modelled on `NotificationEventRecoveryService`. It runs as a third sweep
on the existing scan-reap tick rather than its own BullMQ queue -- this module
does not yet justify a fourth repeating job. `MessageEvent` (the outbox behind
`conversation.message.created`) has no equivalent sweep today, so that event
is at-least-once with no retry. Generalizing this sweep to cover `MessageEvent`
is a small follow-up now that the pattern exists once in this domain.

## Feature flag

Every route and every background job checks `CHAT_ATTACHMENTS_ENABLED`
independently; with it off, `ChatAttachmentsService.createUpload` returns
`CHAT_ATTACHMENTS_DISABLED` and nothing else in this module runs.
