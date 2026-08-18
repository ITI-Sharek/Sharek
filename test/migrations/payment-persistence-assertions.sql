DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  test_attempt_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO "User" (
    "id",
    "email",
    "first_name",
    "last_name",
    "role",
    "status"
  ) VALUES (
    test_user_id,
    'pay02-migration-' || replace(test_user_id::text, '-', '') || '@example.com',
    'Payment',
    'Test',
    'owner',
    'active'
  );

  INSERT INTO "PaymentAttempt" (
    "id",
    "user_id",
    "purpose",
    "user_role_context",
    "plan_type",
    "amount_cents",
    "currency",
    "idempotency_key",
    "provider_client_secret",
    "provider_checkout_url",
    "provider_order_id",
    "provider_transaction_id"
  ) VALUES (
    test_attempt_id,
    test_user_id,
    'subscription_purchase',
    'owner',
    'gold',
    50000,
    'EGP',
    'pay02-idempotency-key',
    'paymob-client-secret-for-replay',
    'https://accept.paymob.com/unifiedcheckout/?publicKey=pk_test&clientSecret=cs_test',
    'pay02-order-1',
    'pay02-transaction-1'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM "PaymentAttempt"
    WHERE "id" = test_attempt_id
      AND "status" = 'pending'
      AND "provider" = 'paymob'
      AND "provider_client_secret" = 'paymob-client-secret-for-replay'
      AND "provider_checkout_url" LIKE 'https://accept.paymob.com/unifiedcheckout/%'
  ) THEN
    RAISE EXCEPTION 'PaymentAttempt defaults or persistence are incorrect';
  END IF;

  INSERT INTO "PaymentWebhookEvent" (
    "id",
    "provider_event_id",
    "fingerprint",
    "payment_attempt_id",
    "minimized_payload"
  ) VALUES (
    gen_random_uuid(),
    'pay02-event-1',
    repeat('a', 64),
    test_attempt_id,
    '{"transaction_id":"tx-1","success":true}'::jsonb
  );

  IF NOT EXISTS (
    SELECT 1
    FROM "PaymentWebhookEvent"
    WHERE "payment_attempt_id" = test_attempt_id
      AND "verification_status" = 'unverified'
      AND "processing_status" = 'pending'
  ) THEN
    RAISE EXCEPTION 'PaymentWebhookEvent defaults or relation are incorrect';
  END IF;

  BEGIN
    INSERT INTO "PaymentAttempt" (
      "id",
      "user_id",
      "purpose",
      "user_role_context",
      "plan_type",
      "amount_cents",
      "currency",
      "idempotency_key"
    ) VALUES (
      gen_random_uuid(),
      test_user_id,
      'subscription_purchase',
      'owner',
      'gold',
      50000,
      'EGP',
      'pay02-pending-race-key'
    );
    RAISE EXCEPTION 'PaymentAttempt idempotency uniqueness is missing';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO "PaymentAttempt" (
    "id",
    "user_id",
    "purpose",
    "user_role_context",
    "plan_type",
    "amount_cents",
    "currency",
    "idempotency_key",
    "status"
  ) VALUES (
    gen_random_uuid(),
    test_user_id,
    'subscription_purchase',
    'owner',
    'gold',
    50000,
    'EGP',
    'pay02-terminal-retry-key',
    'failed'
  );

  BEGIN
    INSERT INTO "PaymentAttempt" (
      "id",
      "user_id",
      "purpose",
      "user_role_context",
      "plan_type",
      "amount_cents",
      "currency",
      "idempotency_key",
      "status",
      "provider_transaction_id"
    ) VALUES (
      gen_random_uuid(),
      test_user_id,
      'subscription_purchase',
      'owner',
      'gold',
      50000,
      'EGP',
      'pay02-transaction-duplicate-key',
      'paid',
      'pay02-transaction-1'
    );
    RAISE EXCEPTION 'PaymentAttempt provider transaction uniqueness is missing';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "PaymentAttempt" (
      "id",
      "user_id",
      "purpose",
      "user_role_context",
      "plan_type",
      "amount_cents",
      "currency",
      "idempotency_key",
      "status",
      "provider_order_id"
    ) VALUES (
      gen_random_uuid(),
      test_user_id,
      'subscription_purchase',
      'owner',
      'gold',
      50000,
      'EGP',
      'pay02-order-duplicate-key',
      'paid',
      'pay02-order-1'
    );
    RAISE EXCEPTION 'PaymentAttempt provider order uniqueness is missing';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "PaymentWebhookEvent" (
      "id",
      "provider_event_id",
      "fingerprint",
      "minimized_payload"
    ) VALUES (
      gen_random_uuid(),
      'pay02-event-duplicate',
      repeat('a', 64),
      '{}'::jsonb
    );
    RAISE EXCEPTION 'PaymentWebhookEvent fingerprint uniqueness is missing';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO "PaymentWebhookEvent" (
    "id",
    "provider_event_id",
    "fingerprint",
    "minimized_payload"
  ) VALUES (
    gen_random_uuid(),
    'pay02-event-1',
    repeat('b', 64),
    '{"transaction_id":"tx-1","pending":false,"success":true}'::jsonb
  );

  IF (
    SELECT count(*)
    FROM "PaymentWebhookEvent"
    WHERE "provider" = 'paymob'
      AND "provider_event_id" = 'pay02-event-1'
  ) <> 2 THEN
    RAISE EXCEPTION 'PaymentWebhookEvent must retain pending-to-terminal state progression';
  END IF;

  RAISE NOTICE 'PAY-02 payment persistence migration assertions passed';
END $$;

DELETE FROM "PaymentWebhookEvent";
DELETE FROM "PaymentAttempt";
DELETE FROM "User"
WHERE "email" LIKE 'pay02-migration-%@example.com';
