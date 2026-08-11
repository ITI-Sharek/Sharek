DO $$
DECLARE
  generation_notification "Notification"%ROWTYPE;
BEGIN
  SELECT * INTO generation_notification
  FROM "Notification"
  WHERE "deduplication_key" =
    'skill-profile-generation:80000000-0000-4000-8000-000000000001:ready_for_review';

  IF generation_notification."template_key" <> 'skill_profile_generation.ready_for_review'
    OR generation_notification."template_version" <> 1
    OR generation_notification."parameters"->>'generationId' <>
      '80000000-0000-4000-8000-000000000001'
    OR generation_notification."parameters"->>'audience' <> 'contributor'
    OR generation_notification."priority" <> 'attention'
  THEN
    RAISE EXCEPTION 'Late skill-generation backfill was not repaired semantically';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Notification"
    WHERE "template_key" IS NULL OR "parameters" IS NULL
  ) THEN
    RAISE EXCEPTION 'Late skill-generation backfill left null semantic fields';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Notification'
      AND column_name IN ('template_key', 'parameters')
      AND is_nullable <> 'NO'
  ) THEN
    RAISE EXCEPTION 'Notification semantic constraints were not restored';
  END IF;
END $$;

SELECT 1;
