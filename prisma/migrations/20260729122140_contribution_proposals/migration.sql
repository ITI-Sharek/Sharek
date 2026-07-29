-- CreateEnum
CREATE TYPE "ContributionProposalStatus" AS ENUM ('pending', 'withdrawn');

-- CreateEnum
CREATE TYPE "ContributionProposalAuditAction" AS ENUM ('submitted', 'version_submitted', 'revision_requested', 'withdrawn');

-- CreateTable
CREATE TABLE "ProjectProposalIntake" (
    "project_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectProposalIntake_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "ContributionProposal" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "proposer_id" UUID NOT NULL,
    "status" "ContributionProposalStatus" NOT NULL DEFAULT 'pending',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "disclosure_version" VARCHAR(50) NOT NULL,
    "disclosure_acknowledged_at" TIMESTAMP(3) NOT NULL,
    "revision_requested_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionProposalVersion" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "authored_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionProposalVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionProposalAudit" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" "ContributionProposalAuditAction" NOT NULL,
    "from_status" "ContributionProposalStatus",
    "to_status" "ContributionProposalStatus" NOT NULL,
    "proposal_version" INTEGER,
    "reason" VARCHAR(500),
    "idempotency_key" VARCHAR(128),
    "command_fingerprint" CHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionProposalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContributionProposal_project_id_status_idx" ON "ContributionProposal"("project_id", "status");

-- CreateIndex
CREATE INDEX "ContributionProposal_proposer_id_created_at_idx" ON "ContributionProposal"("proposer_id", "created_at");

-- CreateIndex
CREATE INDEX "ContributionProposalVersion_proposal_id_created_at_idx" ON "ContributionProposalVersion"("proposal_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionProposalVersion_proposal_id_version_key" ON "ContributionProposalVersion"("proposal_id", "version");

-- CreateIndex
CREATE INDEX "ContributionProposalAudit_proposal_id_created_at_idx" ON "ContributionProposalAudit"("proposal_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionProposalAudit_actor_id_action_idempotency_key_key" ON "ContributionProposalAudit"("actor_id", "action", "idempotency_key");

-- AddForeignKey
ALTER TABLE "ProjectProposalIntake" ADD CONSTRAINT "ProjectProposalIntake_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionProposal" ADD CONSTRAINT "ContributionProposal_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionProposal" ADD CONSTRAINT "ContributionProposal_proposer_id_fkey" FOREIGN KEY ("proposer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionProposalVersion" ADD CONSTRAINT "ContributionProposalVersion_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "ContributionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionProposalVersion" ADD CONSTRAINT "ContributionProposalVersion_authored_by_fkey" FOREIGN KEY ("authored_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionProposalAudit" ADD CONSTRAINT "ContributionProposalAudit_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "ContributionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionProposalAudit" ADD CONSTRAINT "ContributionProposalAudit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
