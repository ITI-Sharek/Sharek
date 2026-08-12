ALTER TABLE "Delivery"
  ADD COLUMN "submission_idempotency_key" VARCHAR(36),
  ADD COLUMN "submission_fingerprint" CHAR(64);

CREATE UNIQUE INDEX "Delivery_submission_idempotency_key_key"
  ON "Delivery"("submission_idempotency_key");
