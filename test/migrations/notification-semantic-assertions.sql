DO $$
DECLARE
  application_row "Notification"%ROWTYPE;
  proposal_row "Notification"%ROWTYPE;
  skill_row "Notification"%ROWTYPE;
  notification_count INTEGER;
BEGIN
  SELECT count(*) INTO notification_count FROM "Notification";
  IF notification_count <> 14 THEN
    RAISE EXCEPTION 'Semantic migration lost legacy rows: expected 14, got %', notification_count;
  END IF;

  SELECT * INTO application_row
  FROM "Notification"
  WHERE "id" = '20000000-0000-4000-8000-000000000001';

  IF application_row."template_key" <> 'application.accepted'
    OR application_row."template_version" <> 1
    OR application_row."parameters"->>'applicationId' <> '30000000-0000-4000-8000-000000000001'
    OR application_row."deep_link" <> '/applications/30000000-0000-4000-8000-000000000001'
    OR application_row."priority" <> 'attention'
    OR application_row."aggregate_version" <> 1
    OR application_row."title" <> 'Application accepted'
  THEN
    RAISE EXCEPTION 'Application semantic backfill did not preserve and map the row';
  END IF;

  SELECT * INTO proposal_row
  FROM "Notification"
  WHERE "id" = '20000000-0000-4000-8000-000000000002';

  IF proposal_row."template_key" <> 'system.legacy'
    OR proposal_row."deep_link" IS NOT NULL
    OR proposal_row."parameters"->>'legacyTitle' <> 'Legacy malformed proposal'
  THEN
    RAISE EXCEPTION 'Malformed legacy row did not use the safe fallback';
  END IF;

  SELECT * INTO skill_row
  FROM "Notification"
  WHERE "id" = '20000000-0000-4000-8000-000000000003';

  IF skill_row."template_key" <> 'skill_review.activated'
    OR skill_row."parameters"->>'skillName' <> 'TypeScript'
    OR skill_row."deep_link" <> '/settings?section=github'
    OR skill_row."is_read" <> true
    OR skill_row."read_at" IS NULL
  THEN
    RAISE EXCEPTION 'Skill semantic backfill did not preserve read state';
  END IF;

  IF (
    SELECT count(*)
    FROM (VALUES
      ('20000000-0000-4000-8000-000000000001', 'application.accepted', '/applications/30000000-0000-4000-8000-000000000001'),
      ('20000000-0000-4000-8000-000000000004', 'application.submitted', '/applications/30000000-0000-4000-8000-000000000002'),
      ('20000000-0000-4000-8000-000000000005', 'application.withdrawn', '/applications/30000000-0000-4000-8000-000000000003'),
      ('20000000-0000-4000-8000-000000000006', 'application.declined_by_owner', '/applications/30000000-0000-4000-8000-000000000004'),
      ('20000000-0000-4000-8000-000000000007', 'application.not_selected', '/applications/30000000-0000-4000-8000-000000000005'),
      ('20000000-0000-4000-8000-000000000008', 'application.owner_review_reminder', '/applications/30000000-0000-4000-8000-000000000006'),
      ('20000000-0000-4000-8000-000000000009', 'application.expired', '/applications/30000000-0000-4000-8000-000000000007'),
      ('20000000-0000-4000-8000-000000000010', 'proposal.revision_requested', '/proposals/60000000-0000-4000-8000-000000000001'),
      ('20000000-0000-4000-8000-000000000011', 'proposal.accepted', '/proposals/60000000-0000-4000-8000-000000000002'),
      ('20000000-0000-4000-8000-000000000012', 'proposal.declined', '/proposals/60000000-0000-4000-8000-000000000003'),
      ('20000000-0000-4000-8000-000000000003', 'skill_review.activated', '/settings?section=github'),
      ('20000000-0000-4000-8000-000000000013', 'skill_review.approved', '/settings?section=github'),
      ('20000000-0000-4000-8000-000000000014', 'skill_review.not_approved', '/settings?section=github')
    ) AS expected(id, template_key, deep_link)
    JOIN "Notification" notification ON notification."id" = expected.id::uuid
    WHERE notification."template_key" = expected.template_key
      AND notification."deep_link" = expected.deep_link
  ) <> 13 THEN
    RAISE EXCEPTION 'Known semantic Notification mappings are incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Notification"
    WHERE ("is_read" = false AND "read_at" IS NOT NULL)
       OR ("is_read" = true AND "read_at" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Migration changed or created an inconsistent read state';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'Notification'
      AND indexname = 'Notification_user_id_created_at_id_idx'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'Notification'
      AND indexname = 'Notification_user_id_is_read_created_at_idx'
  ) THEN
    RAISE EXCEPTION 'Notification inbox indexes were not created';
  END IF;

  BEGIN
    INSERT INTO "Notification" (
      "id", "user_id", "type", "template_key", "template_version",
      "parameters", "deep_link", "priority"
    ) VALUES (
      '20000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000001',
      'system',
      'system.generic',
      1,
      '{}'::jsonb,
      '//unsafe.example',
      'ambient'
    );
    RAISE EXCEPTION 'Unsafe deep link was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END $$;

SELECT 1;
