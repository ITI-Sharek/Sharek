-- Add durable skill profile generation records for selected-repository AI profiling.
CREATE TYPE "SkillProfileGenerationStatus" AS ENUM (
  'queued',
  'collecting_evidence',
  'analyzing',
  'pending_review',
  'failed'
);

CREATE TABLE "SkillProfileGeneration" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "SkillProfileGenerationStatus" NOT NULL DEFAULT 'queued',
  "selected_repositories" JSONB NOT NULL,
  "evidence_snapshot" JSONB,
  "fraud_signals" JSONB,
  "evidence_quality" VARCHAR(20),
  "failure_reason" TEXT,
  "provider" VARCHAR(50),
  "model" VARCHAR(100),
  "prompt_version" VARCHAR(100),
  "schema_version" VARCHAR(100),
  "service_version" VARCHAR(100),
  "selected_repository_count" INTEGER NOT NULL DEFAULT 0,
  "snapshotted_repository_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),

  CONSTRAINT "SkillProfileGeneration_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SkillProfile" ADD COLUMN "generation_id" UUID;

CREATE INDEX "SkillProfileGeneration_user_id_idx" ON "SkillProfileGeneration"("user_id");
CREATE INDEX "SkillProfileGeneration_status_idx" ON "SkillProfileGeneration"("status");
CREATE INDEX "SkillProfile_user_id_idx" ON "SkillProfile"("user_id");
CREATE INDEX "SkillProfile_generation_id_idx" ON "SkillProfile"("generation_id");
CREATE INDEX "SkillProfile_status_idx" ON "SkillProfile"("status");

ALTER TABLE "SkillProfileGeneration"
  ADD CONSTRAINT "SkillProfileGeneration_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillProfile"
  ADD CONSTRAINT "SkillProfile_generation_id_fkey"
  FOREIGN KEY ("generation_id") REFERENCES "SkillProfileGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
