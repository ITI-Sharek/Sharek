-- CreateEnum
CREATE TYPE "ContributionRequestSkillRequirementSource" AS ENUM ('ai_inferred', 'owner_override');

-- CreateEnum
CREATE TYPE "ContributionRequestSkillRequirementConfidence" AS ENUM ('high', 'medium', 'low');

-- CreateTable
CREATE TABLE "ContributionRequestSkillRequirement" (
    "id" UUID NOT NULL,
    "contribution_request_id" UUID NOT NULL,
    "skill_name" VARCHAR(100) NOT NULL,
    "skill_name_normalized" VARCHAR(100) NOT NULL,
    "required_level" "SkillProfileProficiencyLevel" NOT NULL,
    "kind" "ContributionRequestRequirementKind" NOT NULL,
    "source" "ContributionRequestSkillRequirementSource" NOT NULL,
    "confidence" "ContributionRequestSkillRequirementConfidence",
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionRequestSkillRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContributionRequestSkillRequirement_contribution_request_id_idx" ON "ContributionRequestSkillRequirement"("contribution_request_id", "kind");

-- The invariant the application cannot enforce on its own: two spellings of one
-- skill ("Node.js" and "nodejs") must not both attach to a Request, or an
-- Eligibility Evaluation would compare the contributor against a bar that
-- contradicts itself. The application normalizes through
-- shared/skills/skill-name.ts; this index is what makes the rule true under
-- concurrent draft edits.
-- CreateIndex
CREATE UNIQUE INDEX "ContributionRequestSkillRequirement_contribution_request_id_key" ON "ContributionRequestSkillRequirement"("contribution_request_id", "skill_name_normalized");

-- AddForeignKey
ALTER TABLE "ContributionRequestSkillRequirement" ADD CONSTRAINT "ContributionRequestSkillRequirement_contribution_request_i_fkey" FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The frozen bar an Application was judged against. The default makes every
-- Application submitted before the gate existed read as "no bar", which is
-- exactly what it was — no backfill is needed or correct.
-- AlterTable
ALTER TABLE "ApplicationRequirementSnapshot" ADD COLUMN "skill_requirements" JSONB NOT NULL DEFAULT '[]';
