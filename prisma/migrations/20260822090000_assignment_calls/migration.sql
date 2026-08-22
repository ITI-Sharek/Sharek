-- CreateEnum
CREATE TYPE "AssignmentCallOutcome" AS ENUM ('ringing', 'answered', 'missed', 'declined', 'failed_busy', 'failed_provider', 'ended');

-- CreateEnum
CREATE TYPE "AssignmentCallParticipantRole" AS ENUM ('caller', 'callee');

-- CreateEnum
CREATE TYPE "AssignmentCallEventType" AS ENUM ('ringing', 'answered', 'declined', 'ended', 'availability_changed');

-- CreateTable
CREATE TABLE "AssignmentCall" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "caller_id" UUID NOT NULL,
    "callee_id" UUID NOT NULL,
    "outcome" "AssignmentCallOutcome" NOT NULL DEFAULT 'ringing',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "ended_by" UUID,
    "end_reason" VARCHAR(100),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "aggregate_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentCallParticipation" (
    "id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "AssignmentCallParticipantRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "disconnected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentCallParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentCallEvent" (
    "id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "event_type" "AssignmentCallEventType" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "command_idempotency_key" VARCHAR(128),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_publish_error_code" VARCHAR(100),

    CONSTRAINT "AssignmentCallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationCapacityUsage" (
    "id" UUID NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turn_bytes_used" BIGINT NOT NULL,
    "turn_bytes_budget" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationCapacityUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentCall_caller_id_idempotency_key_key" ON "AssignmentCall"("caller_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "AssignmentCall_conversation_id_started_at_idx" ON "AssignmentCall"("conversation_id", "started_at");

-- CreateIndex
CREATE INDEX "AssignmentCall_outcome_started_at_idx" ON "AssignmentCall"("outcome", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentCallParticipation_call_id_user_id_key" ON "AssignmentCallParticipation"("call_id", "user_id");

-- CreateIndex
CREATE INDEX "AssignmentCallParticipation_user_id_active_idx" ON "AssignmentCallParticipation"("user_id", "active");

-- CreateIndex
-- Explicit short name: the default `{model}_{fields}_key` convention name for
-- this constraint is 66 characters, past Postgres's 63-character identifier
-- limit, so it needs a name rather than a silently truncated one.
CREATE UNIQUE INDEX "assignment_call_event_idempotency_key" ON "AssignmentCallEvent"("call_id", "event_type", "command_idempotency_key");

-- CreateIndex
CREATE INDEX "AssignmentCallEvent_published_at_occurred_at_idx" ON "AssignmentCallEvent"("published_at", "occurred_at");

-- CreateIndex
CREATE INDEX "CommunicationCapacityUsage_measured_at_idx" ON "CommunicationCapacityUsage"("measured_at");

-- AddForeignKey
ALTER TABLE "AssignmentCall" ADD CONSTRAINT "AssignmentCall_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "AssignmentConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCall" ADD CONSTRAINT "AssignmentCall_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCall" ADD CONSTRAINT "AssignmentCall_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCall" ADD CONSTRAINT "AssignmentCall_ended_by_fkey" FOREIGN KEY ("ended_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCallParticipation" ADD CONSTRAINT "AssignmentCallParticipation_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "AssignmentCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCallParticipation" ADD CONSTRAINT "AssignmentCallParticipation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCallEvent" ADD CONSTRAINT "AssignmentCallEvent_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "AssignmentCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Counters, durations, and versions must never go negative; a call's TURN
-- budget snapshot must never claim a non-positive budget. Matches the
-- CHECK-constraint convention used throughout this schema.
ALTER TABLE "AssignmentCall"
  ADD CONSTRAINT "AssignmentCall_duration_seconds_non_negative" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
  ADD CONSTRAINT "AssignmentCall_aggregate_version_positive" CHECK ("aggregate_version" > 0);

ALTER TABLE "AssignmentCallEvent"
  ADD CONSTRAINT "AssignmentCallEvent_aggregate_version_positive" CHECK ("aggregate_version" > 0),
  ADD CONSTRAINT "AssignmentCallEvent_publish_attempts_non_negative" CHECK ("publish_attempts" >= 0);

ALTER TABLE "CommunicationCapacityUsage"
  ADD CONSTRAINT "CommunicationCapacityUsage_turn_bytes_used_non_negative" CHECK ("turn_bytes_used" >= 0),
  ADD CONSTRAINT "CommunicationCapacityUsage_turn_bytes_budget_positive" CHECK ("turn_bytes_budget" > 0);

-- A user may participate in only one active Assignment Call, platform-wide
-- (COMMUNICATION.md rule 8). Prisma cannot express a partial index, so this
-- is raw SQL: a simultaneous second `start` violates it, surfacing as a
-- Prisma P2002 the service maps to ASSIGNMENT_CALL_PARTICIPANT_BUSY. This is
-- what makes "simultaneous start requests resolve atomically, first valid
-- call wins" (COMMUNICATION.md rule 9) a Postgres guarantee rather than an
-- application-level race.
CREATE UNIQUE INDEX "assignment_call_participation_one_active_per_user"
  ON "AssignmentCallParticipation" ("user_id") WHERE "active";
