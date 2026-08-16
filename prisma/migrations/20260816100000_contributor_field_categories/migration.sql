-- CreateTable
CREATE TABLE "ContributorFieldCategory" (
  "id" UUID NOT NULL,
  "key" VARCHAR(50) NOT NULL,
  "label_en" VARCHAR(100) NOT NULL,
  "label_ar" VARCHAR(100) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContributorFieldCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContributorFieldCategory_key_key"
  ON "ContributorFieldCategory"("key");

CREATE INDEX "ContributorFieldCategory_active_sort_order_idx"
  ON "ContributorFieldCategory"("active", "sort_order");

-- Seed categories before assigning existing fields. The defaults preserve all
-- existing selections while giving the admin a useful initial taxonomy.
INSERT INTO "ContributorFieldCategory" ("id", "key", "label_en", "label_ar", "sort_order") VALUES
  ('20000000-0000-4000-8000-000000000001', 'technology', 'Technology', 'التكنولوجيا', 10),
  ('20000000-0000-4000-8000-000000000002', 'design', 'Design', 'التصميم', 20),
  ('20000000-0000-4000-8000-000000000003', 'content', 'Content', 'المحتوى', 30);

-- Assign every existing field to Technology first. Explicit overrides make
-- the initial catalog useful without relying on a field key being present.
ALTER TABLE "ContributorField"
  ADD COLUMN "category_id" UUID;

UPDATE "ContributorField"
SET "category_id" = '20000000-0000-4000-8000-000000000001';

UPDATE "ContributorField"
SET "category_id" = '20000000-0000-4000-8000-000000000002'
WHERE "key" = 'design';

UPDATE "ContributorField"
SET "category_id" = '20000000-0000-4000-8000-000000000003'
WHERE "key" = 'docs';

ALTER TABLE "ContributorField"
  ALTER COLUMN "category_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ContributorField_category_id_active_sort_order_idx"
  ON "ContributorField"("category_id", "active", "sort_order");

-- AddForeignKey
ALTER TABLE "ContributorField"
  ADD CONSTRAINT "ContributorField_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "ContributorFieldCategory"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
