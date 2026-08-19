-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('first_contribution');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'achievement';

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_type" "BadgeType" NOT NULL,
    "source_delivery_id" UUID,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_user_id_badge_type_key" ON "UserBadge"("user_id", "badge_type");

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_source_delivery_id_fkey" FOREIGN KEY ("source_delivery_id") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
