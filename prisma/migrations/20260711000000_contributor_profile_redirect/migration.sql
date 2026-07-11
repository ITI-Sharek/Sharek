-- Add contributor profile redirect persistence.
ALTER TABLE "User" ADD COLUMN "username" VARCHAR(30);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "ContributorProfile" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "bio" TEXT,
  "availability" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContributorProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContributorProfile_user_id_key" ON "ContributorProfile"("user_id");
CREATE INDEX "ContributorProfile_user_id_idx" ON "ContributorProfile"("user_id");

ALTER TABLE "ContributorProfile"
  ADD CONSTRAINT "ContributorProfile_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
