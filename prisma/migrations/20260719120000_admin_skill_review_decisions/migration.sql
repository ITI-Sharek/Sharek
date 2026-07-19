CREATE TYPE "SkillProfileReviewAction" AS ENUM (
  'approve',
  'reject',
  'adjust_proficiency'
);

CREATE TABLE "SkillProfileReviewDecision" (
  "id" UUID NOT NULL,
  "skill_profile_id" UUID NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "action" "SkillProfileReviewAction" NOT NULL,
  "previous_status" "SkillProfileStatus" NOT NULL,
  "new_status" "SkillProfileStatus" NOT NULL,
  "previous_proficiency" "SkillProfileProficiencyLevel",
  "new_proficiency" "SkillProfileProficiencyLevel",
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SkillProfileReviewDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SkillProfileReviewDecision_skill_profile_id_idx"
  ON "SkillProfileReviewDecision"("skill_profile_id");

CREATE INDEX "SkillProfileReviewDecision_reviewer_id_idx"
  ON "SkillProfileReviewDecision"("reviewer_id");

CREATE INDEX "SkillProfileReviewDecision_action_idx"
  ON "SkillProfileReviewDecision"("action");

ALTER TABLE "SkillProfileReviewDecision"
  ADD CONSTRAINT "SkillProfileReviewDecision_skill_profile_id_fkey"
  FOREIGN KEY ("skill_profile_id") REFERENCES "SkillProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillProfileReviewDecision"
  ADD CONSTRAINT "SkillProfileReviewDecision_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
