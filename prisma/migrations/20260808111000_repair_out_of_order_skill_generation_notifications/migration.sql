-- If the skill-generation backfills were applied after the semantic
-- migration, they inserted legacy title/message/metadata values while the
-- semantic columns were temporarily nullable. Convert those rows to the
-- current Notification contract before restoring the constraints.
UPDATE "Notification"
SET
  "template_key" = COALESCE(
    "template_key",
    CASE
      WHEN "type" = 'skill_profile_generation'
        AND "metadata"->>'status' IN (
          'ready_for_review', 'needs_more_evidence', 'failed'
        )
        THEN 'skill_profile_generation.' || ("metadata"->>'status')
      ELSE 'system.legacy'
    END
  ),
  "template_version" = COALESCE("template_version", 1),
  "parameters" = COALESCE(
    "parameters",
    CASE
      WHEN "type" = 'skill_profile_generation'
        AND "metadata"->>'status' IN (
          'ready_for_review', 'needs_more_evidence', 'failed'
        )
        THEN jsonb_strip_nulls(jsonb_build_object(
          'generationId', "metadata"->>'generationId',
          'status', "metadata"->>'status',
          'audience', COALESCE("metadata"->>'audience', 'contributor'),
          'skillCount', "metadata"->'skillCount',
          'selectedRepositoryCount', "metadata"->'selectedRepositoryCount'
        ))
      ELSE jsonb_build_object(
        'legacyTitle', left(COALESCE("title", 'Notification'), 255),
        'legacyBody', left(
          COALESCE("message", 'You have a new update in Share-k.'),
          2000
        )
      )
    END
  ),
  "priority" = CASE
    WHEN "type" = 'skill_profile_generation'
      AND "metadata"->>'status' IN (
        'ready_for_review', 'needs_more_evidence', 'failed'
      )
      THEN 'attention'::"NotificationPriority"
    ELSE COALESCE(
      "priority",
      CASE
        WHEN "type" IN (
          'application_status', 'proposal_status', 'skill_review'
        )
          THEN 'attention'::"NotificationPriority"
        ELSE 'ambient'::"NotificationPriority"
      END
    )
  END,
  "aggregate_version" = COALESCE("aggregate_version", 1),
  "updated_at" = COALESCE("updated_at", CURRENT_TIMESTAMP)
WHERE "template_key" IS NULL OR "parameters" IS NULL;

ALTER TABLE "Notification"
  ALTER COLUMN "template_key" SET NOT NULL,
  ALTER COLUMN "parameters" SET NOT NULL;
