-- Asserted after both plan migrations have replayed over the fixture rows.
\set ON_ERROR_STOP on

DO $$
DECLARE
  actual TEXT;
BEGIN
  -- The enum itself lost bronze and silver.
  SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder)
    INTO actual
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
   WHERE pg_type.typname = 'SubscriptionPlanType';
  IF actual <> 'free,gold' THEN
    RAISE EXCEPTION 'SubscriptionPlanType is %, expected free,gold', actual;
  END IF;

  -- bronze was the implicit default, so it maps down to free.
  SELECT plan_type::text INTO actual
    FROM "Subscription" WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  IF actual <> 'free' THEN
    RAISE EXCEPTION 'bronze mapped to %, expected free', actual;
  END IF;

  -- silver was paid for, so it maps up to gold. A downgrade here would take
  -- away something a user had already paid for.
  SELECT plan_type::text INTO actual
    FROM "Subscription" WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  IF actual <> 'gold' THEN
    RAISE EXCEPTION 'silver mapped to %, expected gold', actual;
  END IF;

  SELECT plan_type::text INTO actual
    FROM "Subscription" WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  IF actual <> 'gold' THEN
    RAISE EXCEPTION 'gold mapped to %, expected gold', actual;
  END IF;

  -- Every pre-existing row is `default`: none of them came from a provider.
  SELECT string_agg(DISTINCT source::text, ',') INTO actual FROM "Subscription";
  IF actual <> 'default' THEN
    RAISE EXCEPTION 'backfilled sources are %, expected only default', actual;
  END IF;

  -- The billing period is backfilled from the subscription lifetime.
  IF NOT EXISTS (
    SELECT 1 FROM "Subscription"
     WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
       AND current_period_start = TIMESTAMP '2026-07-01 00:00:00'
       AND current_period_end   = TIMESTAMP '2026-08-01 00:00:00'
  ) THEN
    RAISE EXCEPTION 'the billing period was not backfilled from starts_at/expires_at';
  END IF;

  -- An open-ended row keeps a NULL end rather than being given one.
  IF NOT EXISTS (
    SELECT 1 FROM "Subscription"
     WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'
       AND current_period_start = TIMESTAMP '2026-07-01 00:00:00'
       AND current_period_end IS NULL
  ) THEN
    RAISE EXCEPTION 'an open-ended subscription was given a period end';
  END IF;

  -- New rows get `default` without the writer saying so.
  INSERT INTO "Subscription" (id, user_id, plan_type, user_role_context, status, starts_at)
  VALUES ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
          'gold', 'contributor', 'active', '2026-08-01T00:00:00Z');
  SELECT source::text INTO actual
    FROM "Subscription" WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  IF actual <> 'default' THEN
    RAISE EXCEPTION 'a new row defaulted to source %, expected default', actual;
  END IF;

  -- The index entitlement resolution depends on exists.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'Subscription'
       AND indexname = 'Subscription_user_id_user_role_context_status_starts_at_idx'
  ) THEN
    RAISE EXCEPTION 'the entitlement resolution index is missing';
  END IF;
END
$$;
