-- CreateEnum
CREATE TYPE "EligibilityGuidanceStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateTable
CREATE TABLE "EligibilityGuidance" (
    "id" UUID NOT NULL,
    "eligibility_evaluation_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "status" "EligibilityGuidanceStatus" NOT NULL DEFAULT 'pending',
    "blocking_skills" JSONB NOT NULL DEFAULT '[]',
    "narrative" TEXT,
    "recommendations" JSONB,
    "model_used" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityGuidance_pkey" PRIMARY KEY ("id")
);

-- Covers the keyset order a contributor's history is paginated by
-- (created_at, id), so a page is an index range rather than a sort of the whole
-- table.
-- CreateIndex
CREATE INDEX "EligibilityGuidance_contributor_id_created_at_id_idx" ON "EligibilityGuidance"("contributor_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "EligibilityGuidance_eligibility_evaluation_id_created_at_idx" ON "EligibilityGuidance"("eligibility_evaluation_id", "created_at");

-- AddForeignKey
ALTER TABLE "EligibilityGuidance" ADD CONSTRAINT "EligibilityGuidance_eligibility_evaluation_id_fkey" FOREIGN KEY ("eligibility_evaluation_id") REFERENCES "EligibilityEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ON DELETE RESTRICT on the contributor, matching EligibilityEvaluation: this
-- is the record of help offered for a refusal and must not vanish to an
-- unrelated cleanup.
-- AddForeignKey
ALTER TABLE "EligibilityGuidance" ADD CONSTRAINT "EligibilityGuidance_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
