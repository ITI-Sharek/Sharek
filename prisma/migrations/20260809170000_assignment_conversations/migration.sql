CREATE TYPE "AssignmentConversationStatus" AS ENUM ('active', 'read_only');

CREATE TABLE "AssignmentConversation" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "status" "AssignmentConversationStatus" NOT NULL DEFAULT 'active',
    "aggregate_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssignmentConversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssignmentConversation_aggregate_version_positive" CHECK ("aggregate_version" > 0)
);

CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "reply_to_message_id" UUID,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "retracted_at" TIMESTAMP(3),
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Message_body_length" CHECK (char_length("body") BETWEEN 1 AND 4000)
);

CREATE UNIQUE INDEX "AssignmentConversation_assignment_id_key"
  ON "AssignmentConversation"("assignment_id");
CREATE INDEX "AssignmentConversation_status_updated_at_idx"
  ON "AssignmentConversation"("status", "updated_at");
CREATE UNIQUE INDEX "Message_conversation_id_sequence_key"
  ON "Message"("conversation_id", "sequence");
CREATE UNIQUE INDEX "Message_conversation_id_sender_id_idempotency_key_key"
  ON "Message"("conversation_id", "sender_id", "idempotency_key");
CREATE INDEX "Message_conversation_id_sequence_id_idx"
  ON "Message"("conversation_id", "sequence", "id");

ALTER TABLE "AssignmentConversation"
  ADD CONSTRAINT "AssignmentConversation_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "AssignmentConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Message_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Message_reply_to_message_id_fkey"
  FOREIGN KEY ("reply_to_message_id") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
