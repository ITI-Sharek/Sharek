CREATE TYPE "MaterialAnalysisPurpose" AS ENUM ('project_material_drafting');
CREATE TYPE "MaterialAnalysisSetStatus" AS ENUM ('draft', 'running', 'completed', 'failed');
CREATE TYPE "MaterialAnalysisRunStatus" AS ENUM ('requested', 'running', 'completed', 'failed');
CREATE TYPE "MaterialDraftSuggestionType" AS ENUM ('project_update', 'contribution_request');
CREATE TYPE "MaterialDraftSuggestionStatus" AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE "MaterialAnalysisSet" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "purpose" "MaterialAnalysisPurpose" NOT NULL,
    "status" "MaterialAnalysisSetStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialAnalysisSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialAnalysisSetVersion" (
    "id" UUID NOT NULL,
    "analysis_set_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "material_version" INTEGER NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialAnalysisSetVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialAnalysisRun" (
    "id" UUID NOT NULL,
    "analysis_set_id" UUID NOT NULL,
    "contract_version" VARCHAR(100) NOT NULL,
    "status" "MaterialAnalysisRunStatus" NOT NULL DEFAULT 'requested',
    "provider" VARCHAR(100),
    "model" VARCHAR(150),
    "prompt_version" VARCHAR(100),
    "schema_version" VARCHAR(100),
    "service_version" VARCHAR(100),
    "document_count" INTEGER,
    "extracted_characters" INTEGER,
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialAnalysisRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialDraftSuggestion" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "suggestion_type" "MaterialDraftSuggestionType" NOT NULL,
    "target_field" VARCHAR(50),
    "payload" JSONB NOT NULL,
    "rationale" VARCHAR(2000) NOT NULL,
    "source_versions" JSONB NOT NULL,
    "status" "MaterialDraftSuggestionStatus" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialDraftSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialAnalysisSetVersion_analysis_set_id_material_id_material_version_key"
  ON "MaterialAnalysisSetVersion"("analysis_set_id", "material_id", "material_version");
CREATE INDEX "MaterialAnalysisSet_project_id_created_at_idx"
  ON "MaterialAnalysisSet"("project_id", "created_at");
CREATE INDEX "MaterialAnalysisSet_owner_id_created_at_idx"
  ON "MaterialAnalysisSet"("owner_id", "created_at");
CREATE INDEX "MaterialAnalysisSetVersion_material_id_material_version_idx"
  ON "MaterialAnalysisSetVersion"("material_id", "material_version");
CREATE INDEX "MaterialAnalysisRun_analysis_set_id_created_at_idx"
  ON "MaterialAnalysisRun"("analysis_set_id", "created_at");
CREATE INDEX "MaterialAnalysisRun_status_updated_at_idx"
  ON "MaterialAnalysisRun"("status", "updated_at");
CREATE INDEX "MaterialDraftSuggestion_run_id_status_created_at_idx"
  ON "MaterialDraftSuggestion"("run_id", "status", "created_at");

ALTER TABLE "MaterialAnalysisSet"
  ADD CONSTRAINT "MaterialAnalysisSet_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MaterialAnalysisSet_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaterialAnalysisSetVersion"
  ADD CONSTRAINT "MaterialAnalysisSetVersion_analysis_set_id_fkey"
  FOREIGN KEY ("analysis_set_id") REFERENCES "MaterialAnalysisSet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MaterialAnalysisSetVersion_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaterialAnalysisRun"
  ADD CONSTRAINT "MaterialAnalysisRun_analysis_set_id_fkey"
  FOREIGN KEY ("analysis_set_id") REFERENCES "MaterialAnalysisSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialDraftSuggestion"
  ADD CONSTRAINT "MaterialDraftSuggestion_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "MaterialAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
