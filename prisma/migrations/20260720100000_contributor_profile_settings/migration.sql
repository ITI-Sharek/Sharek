-- CreateEnum
CREATE TYPE "ContributorExperienceRange" AS ENUM (
  'zero_to_one',
  'two_to_four',
  'five_to_ten',
  'ten_plus'
);

-- AlterTable
ALTER TABLE "ContributorProfile"
ADD COLUMN "experience_range" "ContributorExperienceRange",
ADD COLUMN "declared_skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "avatar_data" BYTEA,
ADD COLUMN "avatar_mime_type" VARCHAR(50);

-- CreateTable
CREATE TABLE "ContributorField" (
  "id" UUID NOT NULL,
  "key" VARCHAR(50) NOT NULL,
  "label_en" VARCHAR(100) NOT NULL,
  "label_ar" VARCHAR(100) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContributorField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributorProfileField" (
  "profile_id" UUID NOT NULL,
  "field_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContributorProfileField_pkey" PRIMARY KEY ("profile_id", "field_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContributorField_key_key" ON "ContributorField"("key");

-- CreateIndex
CREATE INDEX "ContributorField_active_sort_order_idx" ON "ContributorField"("active", "sort_order");

-- CreateIndex
CREATE INDEX "ContributorProfileField_field_id_idx" ON "ContributorProfileField"("field_id");

-- AddForeignKey
ALTER TABLE "ContributorProfileField"
ADD CONSTRAINT "ContributorProfileField_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "ContributorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributorProfileField"
ADD CONSTRAINT "ContributorProfileField_field_id_fkey"
FOREIGN KEY ("field_id") REFERENCES "ContributorField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the initial catalog. Admins can rename, reorder, disable, or add fields.
INSERT INTO "ContributorField" ("id", "key", "label_en", "label_ar", "sort_order") VALUES
  ('10000000-0000-4000-8000-000000000001', 'web', 'Web Development', 'تطوير الويب', 10),
  ('10000000-0000-4000-8000-000000000002', 'mobile', 'Mobile Applications', 'تطبيقات الجوال', 20),
  ('10000000-0000-4000-8000-000000000003', 'ai', 'Artificial Intelligence', 'الذكاء الاصطناعي', 30),
  ('10000000-0000-4000-8000-000000000004', 'design', 'UI/UX Design', 'تصميم UI/UX', 40),
  ('10000000-0000-4000-8000-000000000005', 'devops', 'DevOps', 'DevOps', 50),
  ('10000000-0000-4000-8000-000000000006', 'docs', 'Documentation and Content', 'توثيق ومحتوى', 60);
