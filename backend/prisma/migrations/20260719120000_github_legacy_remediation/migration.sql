-- AlterTable
ALTER TABLE "GitHubAccount" ADD COLUMN "token_scope" VARCHAR(200);
ALTER TABLE "GitHubAccount" ADD COLUMN "requires_reauthorization" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GitHubAccount" ADD COLUMN "reauthorization_required_at" TIMESTAMP(3);
ALTER TABLE "GitHubAccount" ADD COLUMN "legacy_token_purged_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SkillProfileGeneration" ADD COLUMN "evidence_quarantined_at" TIMESTAMP(3);
ALTER TABLE "SkillProfileGeneration" ADD COLUMN "evidence_purged_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GitHubRemediationAudit" (
    "id" UUID NOT NULL,
    "github_account_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "result" VARCHAR(50) NOT NULL,
    "affected_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubRemediationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitHubAccount_requires_reauthorization_idx" ON "GitHubAccount"("requires_reauthorization");

-- CreateIndex
CREATE INDEX "GitHubRemediationAudit_created_at_idx" ON "GitHubRemediationAudit"("created_at");
