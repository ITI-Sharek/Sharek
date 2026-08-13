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
    "provider_client_secret"
  ) VALUES (
    test_attempt_id,
    test_user_id,
    'subscription_purchase',
    'owner',
    'silver',
    29900,
    'EGP',
    'pay02-idempotency-key',
    'paymob-client-secret-for-replay'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM "PaymentAttempt"
    WHERE "id" = test_attempt_id
      AND "status" = 'pending'
      AND "provider" = 'paymob'
      AND "provider_client_secret" = 'paymob-client-secret-for-replay'
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
      59900,
      'EGP',
      'pay02-idempotency-key'
    );
    RAISE EXCEPTION 'PaymentAttempt idempotency uniqueness is missing';
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

  BEGIN
    INSERT INTO "PaymentWebhookEvent" (
      "id",
      "provider_event_id",
      "fingerprint",
      "minimized_payload"
    ) VALUES (
      gen_random_uuid(),
      'pay02-event-1',
      repeat('b', 64),
      '{}'::jsonb
    );
    RAISE EXCEPTION 'PaymentWebhookEvent provider identity uniqueness is missing';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RAISE NOTICE 'PAY-02 payment persistence migration assertions passed';
END $$;

DELETE FROM "PaymentWebhookEvent";
DELETE FROM "PaymentAttempt";
DELETE FROM "User"
WHERE "email" LIKE 'pay02-migration-%@example.com';
