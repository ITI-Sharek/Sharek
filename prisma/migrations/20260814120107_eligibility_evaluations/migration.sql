-- CreateEnum
CREATE TYPE "EligibilityOutcome" AS ENUM ('eligible', 'blocked');

-- CreateTable
CREATE TABLE "EligibilityEvaluation" (
    "id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "contribution_request_id" UUID,
    "contribution_proposal_id" UUID,
    "outcome" "EligibilityOutcome" NOT NULL,
    "blocking_skills" JSONB NOT NULL DEFAULT '[]',
    "requirement_snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityEvaluation_pkey" PRIMARY KEY ("id")
);

-- An evaluation belongs to exactly one contribution path. Prisma cannot express
-- a CHECK, so it is written here and documented in database-plan.md. Without it
-- a row with neither target — or with both — would be storable, and a refusal
-- nobody can attribute to a Request or a Proposal is not reproducible for a
-- dispute, which is the whole reason this table is append-only.
ALTER TABLE "EligibilityEvaluation"
  ADD CONSTRAINT "EligibilityEvaluation_exactly_one_target"
  CHECK (num_nonnulls("contribution_request_id", "contribution_proposal_id") = 1);

-- CreateIndex
CREATE INDEX "EligibilityEvaluation_contributor_id_evaluated_at_idx" ON "EligibilityEvaluation"("contributor_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "EligibilityEvaluation_contribution_request_id_evaluated_at_idx" ON "EligibilityEvaluation"("contribution_request_id", "evaluated_at");

-- ON DELETE RESTRICT on the contributor: the evaluation is the record of why a
-- person was refused, and it must not vanish because of an unrelated cleanup.
-- AddForeignKey
ALTER TABLE "EligibilityEvaluation" ADD CONSTRAINT "EligibilityEvaluation_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityEvaluation" ADD CONSTRAINT "EligibilityEvaluation_contribution_request_id_fkey" FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityEvaluation" ADD CONSTRAINT "EligibilityEvaluation_contribution_proposal_id_fkey" FOREIGN KEY ("contribution_proposal_id") REFERENCES "ContributionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
