/*
  Warnings:

  - You are about to drop the column `confidence` on the `AiMatchResult` table. All the data in the column will be lost.
  - You are about to drop the `SubscriptionEntitlement` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "MaterialAnalysisChunk" DROP CONSTRAINT "MaterialAnalysisChunk_material_id_fkey";

-- DropForeignKey
ALTER TABLE "SubscriptionEntitlement" DROP CONSTRAINT "SubscriptionEntitlement_user_id_fkey";

-- DropIndex
DROP INDEX "AiMatchResult_contribution_request_id_rank_idx";

-- DropIndex
DROP INDEX "MaterialDraftSuggestion_reviewed_by_idx";

-- DropIndex
DROP INDEX "Subscription_expires_at_idx";

-- DropIndex
DROP INDEX "Subscription_user_id_user_role_context_status_idx";

-- AlterTable
ALTER TABLE "AiMatchResult" DROP COLUMN "confidence";

-- AlterTable
ALTER TABLE "DeliveryApprovedEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliverySubmission" ALTER COLUMN "id" DROP DEFAULT;

-- DropTable
DROP TABLE "SubscriptionEntitlement";

-- DropEnum
DROP TYPE "SubscriptionEntitlementKey";

-- DropEnum
DROP TYPE "SubscriptionEntitlementStatus";

-- RenameIndex
ALTER INDEX "MaterialAnalysisChunk_analysis_set_id_material_id_material_vers" RENAME TO "MaterialAnalysisChunk_analysis_set_id_material_id_material__idx";

-- RenameIndex
ALTER INDEX "MaterialAnalysisChunk_run_id_material_id_material_version_chunk" RENAME TO "MaterialAnalysisChunk_run_id_material_id_material_version_c_key";

-- RenameIndex
ALTER INDEX "MaterialAnalysisSetVersion_analysis_set_id_material_id_material" RENAME TO "MaterialAnalysisSetVersion_analysis_set_id_material_id_mate_key";
