ALTER TYPE "ContributionRequestAuditAction" ADD VALUE IF NOT EXISTS 'completed';

DROP INDEX IF EXISTS "DeliveryReview_delivery_id_key";

ALTER TABLE "DeliveryReview"
  ADD COLUMN "submission_number" INTEGER,
  ADD COLUMN "idempotency_key" VARCHAR(36),
  ADD COLUMN "command_fingerprint" CHAR(64),
  ALTER COLUMN "rating" DROP NOT NULL;

UPDATE "DeliveryReview" AS review
SET "submission_number" = delivery."submission_number"
FROM "Delivery" AS delivery
WHERE review."delivery_id" = delivery."id";

ALTER TABLE "DeliveryReview"
  ALTER COLUMN "submission_number" SET NOT NULL;

CREATE UNIQUE INDEX "DeliveryReview_delivery_id_submission_number_key"
  ON "DeliveryReview"("delivery_id", "submission_number");
CREATE UNIQUE INDEX "DeliveryReview_reviewer_id_idempotency_key_key"
  ON "DeliveryReview"("reviewer_id", "idempotency_key");
CREATE INDEX "DeliveryReview_delivery_id_created_at_idx"
  ON "DeliveryReview"("delivery_id", "created_at");

ALTER TABLE "DeliveryReview"
  ADD CONSTRAINT "DeliveryReview_approved_rating_check"
  CHECK (
    "outcome" <> 'approved' OR
    ("rating" IS NOT NULL AND "rating" BETWEEN 1 AND 5)
  ) NOT VALID;
ALTER TABLE "DeliveryReview"
  ADD CONSTRAINT "DeliveryReview_feedback_check"
  CHECK (
    "outcome" = 'approved' OR
    NULLIF(BTRIM("feedback"), '') IS NOT NULL
  ) NOT VALID;
