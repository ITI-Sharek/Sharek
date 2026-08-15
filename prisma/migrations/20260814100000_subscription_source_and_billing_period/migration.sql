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

-- `SubscriptionSource` was already introduced by an earlier migration in
-- databases that followed the original subscription-entitlements history.
-- Keep this migration safe for those databases while still supporting a
-- schema where the type has not been created yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = current_schema()::regnamespace
      AND typname = 'SubscriptionSource'
  ) THEN
    CREATE TYPE "SubscriptionSource" AS ENUM ('default', 'admin', 'demo', 'payment_provider');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "current_period_end" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "current_period_start" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provider_subscription_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "source" "SubscriptionSource" NOT NULL DEFAULT 'default';

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
CREATE INDEX IF NOT EXISTS "Subscription_user_id_user_role_context_status_starts_at_idx" ON "Subscription"("user_id", "user_role_context", "status", "starts_at" DESC);
