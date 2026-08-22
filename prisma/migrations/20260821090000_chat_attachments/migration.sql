-- CreateEnum
CREATE TYPE "ChatAttachmentScanStatus" AS ENUM ('quarantined', 'scanning', 'ready', 'rejected');

-- CreateEnum
CREATE TYPE "ChatAttachmentEventType" AS ENUM ('scan_state_changed');

-- AlterTable
ALTER TABLE "AssignmentConversation" ADD COLUMN "read_only_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "message_id" UUID,
    "storage_key" VARCHAR(512) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "caption" VARCHAR(500),
    "scan_status" "ChatAttachmentScanStatus" NOT NULL DEFAULT 'quarantined',
    "scan_error_code" VARCHAR(100),
    "scan_attempts" INTEGER NOT NULL DEFAULT 0,
    "scanned_at" TIMESTAMP(3),
    "event_version" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "bound_at" TIMESTAMP(3),
    "purged_at" TIMESTAMP(3),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachmentEvent" (
    "id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "event_type" "ChatAttachmentEventType" NOT NULL,
    "scan_status" "ChatAttachmentScanStatus" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_publish_error_code" VARCHAR(100),

    CONSTRAINT "ChatAttachmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachment_conversation_id_uploaded_by_idempotency_key_key" ON "ChatAttachment"("conversation_id", "uploaded_by", "idempotency_key");

-- CreateIndex
CREATE INDEX "ChatAttachment_message_id_created_at_idx" ON "ChatAttachment"("message_id", "created_at");

-- CreateIndex
CREATE INDEX "ChatAttachment_scan_status_updated_at_idx" ON "ChatAttachment"("scan_status", "updated_at");

-- CreateIndex
CREATE INDEX "ChatAttachment_message_id_expires_at_purged_at_idx" ON "ChatAttachment"("message_id", "expires_at", "purged_at");

-- CreateIndex
CREATE INDEX "ChatAttachment_conversation_id_purged_at_idx" ON "ChatAttachment"("conversation_id", "purged_at");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachmentEvent_attachment_id_aggregate_version_key" ON "ChatAttachmentEvent"("attachment_id", "aggregate_version");

-- CreateIndex
CREATE INDEX "ChatAttachmentEvent_published_at_occurred_at_idx" ON "ChatAttachmentEvent"("published_at", "occurred_at");

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "AssignmentConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachmentEvent" ADD CONSTRAINT "ChatAttachmentEvent_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "ChatAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A row is either an unbound intent or a bound attachment; byte_size,
-- scan_attempts, and event_version are counters and versions that must never
-- go negative, matching the CHECK-constraint convention used on Message and
-- MessageEvent.
ALTER TABLE "ChatAttachment"
  ADD CONSTRAINT "ChatAttachment_byte_size_positive" CHECK ("byte_size" > 0),
  ADD CONSTRAINT "ChatAttachment_scan_attempts_non_negative" CHECK ("scan_attempts" >= 0),
  ADD CONSTRAINT "ChatAttachment_event_version_non_negative" CHECK ("event_version" >= 0);

ALTER TABLE "ChatAttachmentEvent"
  ADD CONSTRAINT "ChatAttachmentEvent_aggregate_version_positive" CHECK ("aggregate_version" > 0),
  ADD CONSTRAINT "ChatAttachmentEvent_publish_attempts_non_negative" CHECK ("publish_attempts" >= 0);
