CREATE TABLE "MaterialAnalysisChunk" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "analysis_set_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "material_version" INTEGER NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "character_start" INTEGER,
    "character_end" INTEGER,
    "embedding" vector NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialAnalysisChunk_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MaterialDraftSuggestion"
  ADD COLUMN "reviewed_by" UUID,
  ADD COLUMN "source_removed_at" TIMESTAMP(3),
  ADD COLUMN "adopted_entity_type" VARCHAR(50),
  ADD COLUMN "adopted_entity_id" UUID;

CREATE UNIQUE INDEX "MaterialAnalysisChunk_run_id_material_id_material_version_chunk_index_key"
  ON "MaterialAnalysisChunk"("run_id", "material_id", "material_version", "chunk_index");
CREATE INDEX "MaterialAnalysisChunk_analysis_set_id_material_id_material_version_idx"
  ON "MaterialAnalysisChunk"("analysis_set_id", "material_id", "material_version");
CREATE INDEX "MaterialDraftSuggestion_reviewed_by_idx"
  ON "MaterialDraftSuggestion"("reviewed_by");

ALTER TABLE "MaterialAnalysisChunk"
  ADD CONSTRAINT "MaterialAnalysisChunk_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "MaterialAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MaterialAnalysisChunk_analysis_set_id_fkey"
  FOREIGN KEY ("analysis_set_id") REFERENCES "MaterialAnalysisSet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MaterialAnalysisChunk_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaterialDraftSuggestion"
  ADD CONSTRAINT "MaterialDraftSuggestion_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
