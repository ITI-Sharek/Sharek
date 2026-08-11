CREATE TYPE "DeliveryStatus_new" AS ENUM (
  'submitted',
  'changes_requested',
  'resubmitted',
  'approved',
  'rejected'
);

ALTER TABLE "Delivery" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Delivery"
  ALTER COLUMN "status" TYPE "DeliveryStatus_new"
  USING (
    CASE "status"::text
      WHEN 'under_review' THEN 'submitted'
      WHEN 'revision_requested' THEN 'changes_requested'
      ELSE "status"::text
    END
  )::"DeliveryStatus_new";
DROP TYPE "DeliveryStatus";
ALTER TYPE "DeliveryStatus_new" RENAME TO "DeliveryStatus";
ALTER TABLE "Delivery" ALTER COLUMN "status" SET DEFAULT 'submitted';

CREATE TYPE "DeliveryReviewOutcome_new" AS ENUM (
  'approved',
  'rejected',
  'changes_requested'
);

ALTER TABLE "DeliveryReview"
  ALTER COLUMN "outcome" TYPE "DeliveryReviewOutcome_new"
  USING (
    CASE "outcome"::text
      WHEN 'revision_requested' THEN 'changes_requested'
      ELSE "outcome"::text
    END
  )::"DeliveryReviewOutcome_new";
DROP TYPE "DeliveryReviewOutcome";
ALTER TYPE "DeliveryReviewOutcome_new" RENAME TO "DeliveryReviewOutcome";

ALTER TABLE "Delivery"
  ADD COLUMN "submission_number" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "DeliverySubmission" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "delivery_id" UUID NOT NULL,
  "submission_number" INTEGER NOT NULL,
  "contributor_id" UUID NOT NULL,
  "pr_url" VARCHAR(500) NOT NULL,
  "contributor_notes" TEXT,
  "idempotency_key" VARCHAR(36),
  "command_fingerprint" CHAR(64),
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliverySubmission_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DeliverySubmission" (
  "delivery_id",
  "submission_number",
  "contributor_id",
  "pr_url",
  "contributor_notes",
  "idempotency_key",
  "command_fingerprint",
  "submitted_at"
)
SELECT
  "id",
  1,
  "contributor_id",
  "pr_url",
  "contributor_notes",
  "submission_idempotency_key",
  "submission_fingerprint",
  "submitted_at"
FROM "Delivery";

CREATE UNIQUE INDEX "DeliverySubmission_delivery_id_submission_number_key"
  ON "DeliverySubmission"("delivery_id", "submission_number");
CREATE UNIQUE INDEX "DeliverySubmission_contributor_id_idempotency_key_key"
  ON "DeliverySubmission"("contributor_id", "idempotency_key");
CREATE INDEX "DeliverySubmission_delivery_id_submitted_at_idx"
  ON "DeliverySubmission"("delivery_id", "submitted_at");

ALTER TABLE "DeliverySubmission"
  ADD CONSTRAINT "DeliverySubmission_delivery_id_fkey"
  FOREIGN KEY ("delivery_id") REFERENCES "Delivery"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliverySubmission"
  ADD CONSTRAINT "DeliverySubmission_contributor_id_fkey"
  FOREIGN KEY ("contributor_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
