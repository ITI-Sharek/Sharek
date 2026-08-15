-- One usage tally per (user, action, period).
--
-- `UsageTracker` has been in the schema unused since the initial migration, so
-- there is nothing to deduplicate in practice. The DELETE runs anyway: if any
-- environment did accumulate rows, the constraint would otherwise fail to
-- create and the migration would be irrecoverable there. It keeps the row with
-- the highest count, which is the only one that could represent real usage.
DELETE FROM "UsageTracker" a
USING "UsageTracker" b
WHERE a."user_id" = b."user_id"
  AND a."action_type" = b."action_type"
  AND a."period_date" = b."period_date"
  AND (a."count", a."id") < (b."count", b."id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UsageTracker_user_id_action_type_period_date_key"
ON "UsageTracker"("user_id", "action_type", "period_date");
