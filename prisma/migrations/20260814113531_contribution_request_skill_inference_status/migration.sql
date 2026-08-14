-- CreateEnum
CREATE TYPE "ContributionRequestSkillInferenceStatus" AS ENUM ('not_started', 'pending', 'succeeded', 'failed');

-- A draft that cannot be published until it has a required skill row must be
-- able to say why it has none. `not_started` for every existing row is correct:
-- inference has genuinely never run for them, and a draft whose owner enters
-- the set by hand stays there and publishes fine.
-- AlterTable
ALTER TABLE "ContributionRequest"
  ADD COLUMN "skill_inference_status" "ContributionRequestSkillInferenceStatus" NOT NULL DEFAULT 'not_started',
  ADD COLUMN "skill_inference_ran_at" TIMESTAMP(3);
