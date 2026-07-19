-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN "previous_refresh_token_hash" VARCHAR(128);

-- CreateIndex
CREATE INDEX "AuthSession_previous_refresh_token_hash_idx" ON "AuthSession"("previous_refresh_token_hash");
