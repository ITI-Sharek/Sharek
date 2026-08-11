ALTER TABLE "AiMatchResult"
ADD COLUMN "confidence" VARCHAR(10) NOT NULL DEFAULT 'MEDIUM';

CREATE INDEX "AiMatchResult_contribution_request_id_rank_idx"
ON "AiMatchResult"("contribution_request_id", "rank");
