-- TASK-6-02: make subscription source and explicit MVP entitlements durable.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "SubscriptionSource" AS ENUM ('default', 'admin', 'demo', 'payment_provider');

ALTER TABLE "Subscription"
ADD COLUMN "source" "SubscriptionSource" NOT NULL DEFAULT 'default';

CREATE TYPE "SubscriptionEntitlementKey" AS ENUM ('project_material_analysis');
CREATE TYPE "SubscriptionEntitlementStatus" AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE "SubscriptionEntitlement" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" "SubscriptionEntitlementKey" NOT NULL,
    "source" "SubscriptionSource" NOT NULL,
    "status" "SubscriptionEntitlementStatus" NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Subscription_user_id_user_role_context_status_idx"
ON "Subscription"("user_id", "user_role_context", "status");
CREATE INDEX "Subscription_expires_at_idx" ON "Subscription"("expires_at");
CREATE UNIQUE INDEX "Subscription_active_user_role_context_key"
ON "Subscription"("user_id", "user_role_context")
WHERE "status" = 'active';

CREATE INDEX "SubscriptionEntitlement_user_id_key_status_idx"
ON "SubscriptionEntitlement"("user_id", "key", "status");
CREATE INDEX "SubscriptionEntitlement_expires_at_idx"
ON "SubscriptionEntitlement"("expires_at");
CREATE UNIQUE INDEX "UsageTracker_user_id_action_type_period_date_key"
ON "UsageTracker"("user_id", "action_type", "period_date");

ALTER TABLE "SubscriptionEntitlement"
ADD CONSTRAINT "SubscriptionEntitlement_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing published Requests are the authoritative history for the first
-- tracker row; later publication commands reserve this row transactionally.
INSERT INTO "UsageTracker" ("id", "user_id", "action_type", "period_date", "count")
SELECT
    gen_random_uuid(),
    "owner_id",
    'order_created'::"UserActionType",
    date_trunc('month', "published_at" AT TIME ZONE 'UTC')::date,
    COUNT(*)::integer
FROM "ContributionRequest"
WHERE "published_at" IS NOT NULL
GROUP BY "owner_id", date_trunc('month', "published_at" AT TIME ZONE 'UTC')::date
ON CONFLICT ("user_id", "action_type", "period_date")
DO UPDATE SET "count" = EXCLUDED."count";
