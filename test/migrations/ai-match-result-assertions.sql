\set ON_ERROR_STOP on

DO $$
BEGIN
  -- The column is gone, not merely unused. A boolean named `notification_sent`
  -- next to a match row is an invitation to wire up the match_found
  -- notification; matching is pull-only and must stay that way.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'AiMatchResult' AND column_name = 'notification_sent'
  ) THEN
    RAISE EXCEPTION 'AiMatchResult.notification_sent survived the migration';
  END IF;

  -- The row itself survives: the drop loses a flag nothing read, not a match.
  IF NOT EXISTS (
    SELECT 1 FROM "AiMatchResult"
     WHERE id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1' AND rank = 1
  ) THEN
    RAISE EXCEPTION 'the pre-existing AiMatchResult row was lost';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'AiMatchResult'
       AND indexname = 'AiMatchResult_contributor_id_created_at_idx'
  ) THEN
    RAISE EXCEPTION 'the contributor read index is missing';
  END IF;

  -- Recomputing replaces a contributor's results; the uniqueness that makes
  -- that safe is the database's job, not the writer's.
  BEGIN
    INSERT INTO "AiMatchResult" (id, contribution_request_id, contributor_id, match_score, rank)
    VALUES ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2', 'ffffffff-ffff-4fff-8fff-fffffffffff1',
            'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 0.4, 2);
    RAISE EXCEPTION 'a duplicate (request, contributor) match result was accepted';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END
$$;
