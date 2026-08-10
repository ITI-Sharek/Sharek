CREATE TYPE "MessageEventType" AS ENUM ('created');

CREATE TABLE "MessageEvent" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "event_type" "MessageEventType" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_publish_error_code" VARCHAR(100),
    CONSTRAINT "MessageEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MessageEvent_aggregate_version_positive" CHECK ("aggregate_version" > 0),
    CONSTRAINT "MessageEvent_publish_attempts_non_negative" CHECK ("publish_attempts" >= 0)
);

CREATE UNIQUE INDEX "MessageEvent_message_id_event_type_key"
  ON "MessageEvent"("message_id", "event_type");
CREATE INDEX "MessageEvent_published_at_occurred_at_idx"
  ON "MessageEvent"("published_at", "occurred_at");
CREATE INDEX "MessageEvent_conversation_id_aggregate_version_idx"
  ON "MessageEvent"("conversation_id", "aggregate_version");

ALTER TABLE "MessageEvent"
  ADD CONSTRAINT "MessageEvent_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MessageEvent_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "AssignmentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
