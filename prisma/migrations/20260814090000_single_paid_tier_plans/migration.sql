-- Collapse the inherited Bronze/Silver/Gold subscription tiers into one paid
-- tier per role: `free` (the absence of a subscription) and `gold`.
--
-- Mapping, deliberate and lossy:
--   bronze -> free   (bronze was the implicit default for users with no row)
--   silver -> gold   (silver was a paid tier; a paying user must not be
--                     silently downgraded to free by this migration)
--   gold   -> gold
--
-- Postgres cannot drop a value from an enum in place, so the type is replaced
-- and the column rewritten with an explicit USING mapping.

CREATE TYPE "SubscriptionPlanType_new" AS ENUM ('free', 'gold');

ALTER TABLE "Subscription"
  ALTER COLUMN "plan_type" TYPE "SubscriptionPlanType_new"
  USING (
    CASE "plan_type"::text
      WHEN 'bronze' THEN 'free'
      WHEN 'silver' THEN 'gold'
      WHEN 'gold'   THEN 'gold'
    END
  )::"SubscriptionPlanType_new";

DROP TYPE "SubscriptionPlanType";
ALTER TYPE "SubscriptionPlanType_new" RENAME TO "SubscriptionPlanType";
