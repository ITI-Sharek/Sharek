-- Rows written under the Bronze/Silver/Gold ladder, before either of the two
-- plan migrations ran. Each user exists once per role context so the mapping
-- and the backfill can be asserted independently of role.

INSERT INTO "User" (id, email, password_hash, first_name, last_name, role, status)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bronze-owner@example.test', 'x', 'Bronze', 'Owner', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'silver-owner@example.test', 'x', 'Silver', 'Owner', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'gold-contributor@example.test', 'x', 'Gold', 'Contributor', 'contributor', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'openended-owner@example.test', 'x', 'Openended', 'Owner', 'owner', 'active');

INSERT INTO "Subscription" (id, user_id, plan_type, user_role_context, status, starts_at, expires_at)
VALUES
  -- bronze was the implicit default for a user with no row at all.
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bronze', 'owner', 'active', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z'),
  -- silver was paid for. Collapsing it to free would silently downgrade a
  -- paying user, which is the one outcome this migration must not produce.
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'silver', 'owner', 'active', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'gold', 'contributor', 'active', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z'),
  -- An open-ended row: the backfill must leave its period end NULL rather than
  -- inventing one, because a NULL end means "not elapsed" downstream.
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'gold', 'owner', 'active', '2026-07-01T00:00:00Z', NULL);

-- Payment attempts were added before the tier-collapse migration and use the
-- same enum. They must be rewritten before the old enum can be dropped.
INSERT INTO "PaymentAttempt" (
  id, user_id, purpose, user_role_context, plan_type, amount_cents, currency,
  idempotency_key
)
VALUES
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'subscription_purchase', 'owner', 'bronze', 0, 'EGP', 'subscription-bronze'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   'subscription_purchase', 'owner', 'silver', 50000, 'EGP', 'subscription-silver'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
   'subscription_purchase', 'contributor', 'gold', 50000, 'EGP', 'subscription-gold');
