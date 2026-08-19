-- AlterTable
ALTER TABLE "User" ADD COLUMN     "identity_verification_rejected_reason" VARCHAR(500),
ADD COLUMN     "identity_verified_at" TIMESTAMP(3),
ADD COLUMN     "identity_verified_by" UUID;
