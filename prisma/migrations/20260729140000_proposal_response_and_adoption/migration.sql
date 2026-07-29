-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContributionProposalAuditAction" ADD VALUE 'accepted';
ALTER TYPE "ContributionProposalAuditAction" ADD VALUE 'declined';
ALTER TYPE "ContributionProposalAuditAction" ADD VALUE 'misuse_reported';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContributionProposalStatus" ADD VALUE 'accepted';
ALTER TYPE "ContributionProposalStatus" ADD VALUE 'declined';

-- AlterTable
ALTER TABLE "ContributionProposal" ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "decline_reason" VARCHAR(500),
ADD COLUMN     "declined_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ContributionRequest" ADD COLUMN     "attributed_contributor_id" UUID,
ADD COLUMN     "origin_proposal_id" UUID;

-- CreateTable
CREATE TABLE "ContributionProposalMisuseReport" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reported_version" INTEGER NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "evidence_snapshot" JSONB NOT NULL,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionProposalMisuseReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContributionProposalMisuseReport_proposal_id_created_at_idx" ON "ContributionProposalMisuseReport"("proposal_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionProposalMisuseReport_reporter_id_idempotency_ke_key" ON "ContributionProposalMisuseReport"("reporter_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionRequest_origin_proposal_id_key" ON "ContributionRequest"("origin_proposal_id");

-- CreateIndex
CREATE INDEX "ContributionRequest_attributed_contributor_id_idx" ON "ContributionRequest"("attributed_contributor_id");

-- AddForeignKey
ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_origin_proposal_id_fkey" FOREIGN KEY ("origin_proposal_id") REFERENCES "ContributionProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_attributed_contributor_id_fkey" FOREIGN KEY ("attributed_contributor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionProposalMisuseReport" ADD CONSTRAINT "ContributionProposalMisuseReport_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "ContributionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionProposalMisuseReport" ADD CONSTRAINT "ContributionProposalMisuseReport_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
