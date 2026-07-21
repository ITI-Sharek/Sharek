-- CreateTable
CREATE TABLE "ContributorExperienceLevel" (
  "id" UUID NOT NULL,
  "key" VARCHAR(50) NOT NULL,
  "label_en" VARCHAR(100) NOT NULL,
  "label_ar" VARCHAR(100) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContributorExperienceLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContributorExperienceLevel_key_key" ON "ContributorExperienceLevel"("key");

-- CreateIndex
CREATE INDEX "ContributorExperienceLevel_active_sort_order_idx" ON "ContributorExperienceLevel"("active", "sort_order");

-- Seed the initial catalog, reusing the previous ContributorExperienceRange
-- enum values as keys so existing profile data backfills cleanly below.
-- Admins can rename, reorder, disable, or add levels.
INSERT INTO "ContributorExperienceLevel" ("id", "key", "label_en", "label_ar", "sort_order") VALUES
  ('20000000-0000-4000-8000-000000000001', 'zero_to_one', '0-1 year', '0-1 سنة', 10),
  ('20000000-0000-4000-8000-000000000002', 'two_to_four', '2-4 years', '2-4 سنوات', 20),
  ('20000000-0000-4000-8000-000000000003', 'five_to_ten', '5-10 years', '5-10 سنوات', 30),
  ('20000000-0000-4000-8000-000000000004', 'ten_plus', '10+ years', '10+ سنوات', 40);

-- AlterTable
ALTER TABLE "ContributorProfile" ADD COLUMN "experience_level_id" UUID;

-- Backfill existing profiles from the old enum column to the new lookup table.
UPDATE "ContributorProfile" SET "experience_level_id" = CASE "experience_range"
  WHEN 'zero_to_one' THEN '20000000-0000-4000-8000-000000000001'
  WHEN 'two_to_four' THEN '20000000-0000-4000-8000-000000000002'
  WHEN 'five_to_ten' THEN '20000000-0000-4000-8000-000000000003'
  WHEN 'ten_plus' THEN '20000000-0000-4000-8000-000000000004'
  ELSE NULL
END::UUID
WHERE "experience_range" IS NOT NULL;

-- DropColumn
ALTER TABLE "ContributorProfile" DROP COLUMN "experience_range";

-- DropEnum
DROP TYPE "ContributorExperienceRange";

-- CreateIndex
CREATE INDEX "ContributorProfile_experience_level_id_idx" ON "ContributorProfile"("experience_level_id");

-- AddForeignKey
ALTER TABLE "ContributorProfile"
ADD CONSTRAINT "ContributorProfile_experience_level_id_fkey"
FOREIGN KEY ("experience_level_id") REFERENCES "ContributorExperienceLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
