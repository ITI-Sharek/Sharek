-- PAY-04: close the duplicate-purchase and provider-identity races before
-- accepting a callback that can change entitlement state.
ALTER TABLE "PaymentAttempt"
ADD COLUMN "provider_checkout_url" VARCHAR(2000);

CREATE UNIQUE INDEX "PaymentAttempt_one_pending_subscription_per_role_key"
ON "PaymentAttempt"("user_id", "user_role_context", "provider")
WHERE "purpose" = 'subscription_purchase' AND "status" = 'pending';

CREATE UNIQUE INDEX "PaymentAttempt_provider_transaction_id_unique"
ON "PaymentAttempt"("provider", "provider_transaction_id")
WHERE "provider_transaction_id" IS NOT NULL;

CREATE UNIQUE INDEX "PaymentAttempt_provider_order_id_unique"
ON "PaymentAttempt"("provider", "provider_order_id")
WHERE "provider_order_id" IS NOT NULL;

-- A Paymob transaction can emit a pending callback followed by a terminal
-- callback with the same transaction ID. Deduplicate exact callback facts by
-- fingerprint while retaining provider_event_id as a non-unique audit index.
DROP INDEX IF EXISTS "PaymentWebhookEvent_provider_provider_event_id_key";

CREATE INDEX "PaymentWebhookEvent_provider_provider_event_id_idx"
ON "PaymentWebhookEvent"("provider", "provider_event_id");
