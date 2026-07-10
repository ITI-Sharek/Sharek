CREATE TABLE "EmailVerificationOtp" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailVerificationOtp_user_id_idx" ON "EmailVerificationOtp"("user_id");
CREATE INDEX "EmailVerificationOtp_expires_at_idx" ON "EmailVerificationOtp"("expires_at");

ALTER TABLE "EmailVerificationOtp" ADD CONSTRAINT "EmailVerificationOtp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
