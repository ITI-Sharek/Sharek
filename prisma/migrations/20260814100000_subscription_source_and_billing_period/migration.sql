-- Record how a Subscription came to exist, and separate the billing period from
-- the subscription lifetime.
--
-- `source` is the column DEC-026 specified and the schema never grew. It matters
-- for audit: an admin-assigned plan and a Paymob-activated plan are the same row
-- shape and must remain distinguishable after the fact.
--
-- `starts_at`/`expires_at` describe the whole subscription. `current_period_*`
-- describe the period the user has actually paid for, which is what entitlement
-- resolution reads: a subscription whose current period has elapsed resolves to
-- free entitlements immediately, with no background job having to run first.

-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('default', 'admin', 'demo', 'payment_provider');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "current_period_end" TIMESTAMP(3),
ADD COLUMN     "current_period_start" TIMESTAMP(3),
ADD COLUMN     "provider_subscription_id" VARCHAR(255),
ADD COLUMN     "source" "SubscriptionSource" NOT NULL DEFAULT 'default';

-- Backfill the billing period from the subscription lifetime for rows written
-- before these columns existed. A NULL `expires_at` stays NULL: an open-ended
-- subscription has no period end, and entitlement resolution treats a NULL
-- `current_period_end` as "not elapsed" rather than as "elapsed at the epoch".
UPDATE "Subscription"
SET "current_period_start" = "starts_at",
    "current_period_end"   = "expires_at"
WHERE "current_period_start" IS NULL;

-- Entitlement resolution reads the newest active row for one (user, role
-- context) on every enforcement point, so it gets its own covering index rather
-- than filtering the whole per-user set.
-- CreateIndex
CREATE INDEX "Subscription_user_id_user_role_context_status_starts_at_idx" ON "Subscription"("user_id", "user_role_context", "status", "starts_at" DESC);
