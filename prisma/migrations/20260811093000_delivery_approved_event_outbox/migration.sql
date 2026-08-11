CREATE TABLE "DeliveryApprovedEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "delivery_id" UUID NOT NULL,
  "delivery_review_id" UUID NOT NULL,
  "contributor_id" UUID NOT NULL,
  "contribution_request_id" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryApprovedEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryApprovedEvent_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "DeliveryApprovedEvent_delivery_review_id_key"
  ON "DeliveryApprovedEvent"("delivery_review_id");
CREATE INDEX "DeliveryApprovedEvent_published_at_occurred_at_id_idx"
  ON "DeliveryApprovedEvent"("published_at", "occurred_at", "id");
CREATE INDEX "DeliveryApprovedEvent_contributor_id_occurred_at_idx"
  ON "DeliveryApprovedEvent"("contributor_id", "occurred_at");

ALTER TABLE "DeliveryApprovedEvent"
  ADD CONSTRAINT "DeliveryApprovedEvent_delivery_id_fkey"
  FOREIGN KEY ("delivery_id") REFERENCES "Delivery"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryApprovedEvent"
  ADD CONSTRAINT "DeliveryApprovedEvent_delivery_review_id_fkey"
  FOREIGN KEY ("delivery_review_id") REFERENCES "DeliveryReview"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryApprovedEvent"
  ADD CONSTRAINT "DeliveryApprovedEvent_contributor_id_fkey"
  FOREIGN KEY ("contributor_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
