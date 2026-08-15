-- PAY-02: persist backend-owned payment attempts and deduplicated callbacks.
CREATE TYPE "PaymentProvider" AS ENUM ('paymob');
CREATE TYPE "PaymentAttemptPurpose" AS ENUM ('subscription_purchase');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'refunded');
CREATE TYPE "PaymentWebhookVerificationStatus" AS ENUM ('unverified', 'verified', 'invalid');
CREATE TYPE "PaymentWebhookProcessingStatus" AS ENUM ('pending', 'processed', 'failed', 'ignored');

CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "PaymentAttemptPurpose" NOT NULL,
    "user_role_context" "SubscriptionUserRoleContext" NOT NULL,
    "plan_type" "SubscriptionPlanType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'paymob',
    "provider_intention_id" VARCHAR(255),
    "provider_order_id" VARCHAR(255),
    "provider_transaction_id" VARCHAR(255),
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'paymob',
    "provider_event_id" VARCHAR(255),
    "fingerprint" CHAR(64) NOT NULL,
    "payment_attempt_id" UUID,
    "minimized_payload" JSONB NOT NULL,
    "verification_status" "PaymentWebhookVerificationStatus" NOT NULL DEFAULT 'unverified',
    "processing_status" "PaymentWebhookProcessingStatus" NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentAttempt_user_id_idempotency_key_key"
ON "PaymentAttempt"("user_id", "idempotency_key");
CREATE INDEX "PaymentAttempt_user_id_status_idx"
ON "PaymentAttempt"("user_id", "status");
CREATE INDEX "PaymentAttempt_provider_provider_intention_id_idx"
ON "PaymentAttempt"("provider", "provider_intention_id");
CREATE INDEX "PaymentAttempt_provider_provider_order_id_idx"
ON "PaymentAttempt"("provider", "provider_order_id");
CREATE INDEX "PaymentAttempt_provider_provider_transaction_id_idx"
ON "PaymentAttempt"("provider", "provider_transaction_id");
CREATE INDEX "PaymentAttempt_expires_at_idx"
ON "PaymentAttempt"("expires_at");

CREATE UNIQUE INDEX "PaymentWebhookEvent_fingerprint_key"
ON "PaymentWebhookEvent"("fingerprint");
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_provider_event_id_key"
ON "PaymentWebhookEvent"("provider", "provider_event_id");
CREATE INDEX "PaymentWebhookEvent_payment_attempt_id_processing_status_idx"
ON "PaymentWebhookEvent"("payment_attempt_id", "processing_status");
CREATE INDEX "PaymentWebhookEvent_provider_created_at_idx"
ON "PaymentWebhookEvent"("provider", "created_at");
CREATE INDEX "PaymentWebhookEvent_verification_status_processing_status_idx"
ON "PaymentWebhookEvent"("verification_status", "processing_status");

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentWebhookEvent"
ADD CONSTRAINT "PaymentWebhookEvent_payment_attempt_id_fkey"
FOREIGN KEY ("payment_attempt_id") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
