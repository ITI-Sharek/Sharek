-- Add explicit insufficient-evidence and superseded states for deterministic
-- skill-generation policy and repeated-generation handling.
ALTER TYPE "SkillProfileGenerationStatus" ADD VALUE IF NOT EXISTS 'needs_more_evidence';
ALTER TYPE "SkillProfileStatus" ADD VALUE IF NOT EXISTS 'superseded';

ALTER TABLE "SkillProfile"
  ADD COLUMN "skill_key" VARCHAR(100),
  ADD COLUMN "superseded_at" TIMESTAMP(3);

UPDATE "SkillProfile"
SET "skill_key" = lower(regexp_replace(trim("skill_name"), '\s+', ' ', 'g'))
WHERE "skill_key" IS NULL;

CREATE INDEX "SkillProfile_user_id_skill_key_idx"
  ON "SkillProfile"("user_id", "skill_key");
