-- Extend the semantic categories before backfilling existing rows.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'assignment_status';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'material_status';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'moderation';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'account_security';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'conversation_activity';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'assignment_call';

CREATE TYPE "NotificationPriority" AS ENUM ('urgent', 'attention', 'ambient');
CREATE TYPE "NotificationEventType" AS ENUM ('created', 'read_state_changed');

-- Keep rendered legacy fields for one coordinated client cutover. New writes
-- use the semantic fields and leave title/message/metadata null.
ALTER TABLE "Notification"
  ALTER COLUMN "title" DROP NOT NULL,
  ALTER COLUMN "message" DROP NOT NULL,
  ADD COLUMN "template_key" VARCHAR(120),
  ADD COLUMN "template_version" INTEGER,
  ADD COLUMN "parameters" JSONB,
  ADD COLUMN "deep_link" VARCHAR(500),
  ADD COLUMN "priority" "NotificationPriority",
  ADD COLUMN "aggregate_version" INTEGER,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Notification"
SET
  "template_key" = CASE
    WHEN "type" = 'application_status'
      AND "metadata"->>'action' IN (
        'submitted', 'withdrawn', 'accepted', 'declined_by_owner',
        'not_selected', 'owner_review_reminder', 'expired'
      )
      THEN 'application.' || ("metadata"->>'action')
    WHEN "type" = 'proposal_status'
      AND "metadata"->>'action' IN ('revision_requested', 'accepted', 'declined')
      THEN 'proposal.' || ("metadata"->>'action')
    WHEN "type" = 'skill_review'
      AND COALESCE(("metadata"->>'approved')::boolean, false)
      AND COALESCE(("metadata"->>'activated')::boolean, false)
      THEN 'skill_review.activated'
    WHEN "type" = 'skill_review'
      AND COALESCE(("metadata"->>'approved')::boolean, false)
      THEN 'skill_review.approved'
    WHEN "type" = 'skill_review'
      THEN 'skill_review.not_approved'
    WHEN "type" = 'skill_profile_generation'
      AND "metadata"->>'status' IN (
        'ready_for_review', 'needs_more_evidence', 'failed'
      )
      THEN 'skill_profile_generation.' || ("metadata"->>'status')
    ELSE 'system.legacy'
  END,
  "template_version" = 1,
  "parameters" = CASE
    WHEN "type" = 'application_status' THEN jsonb_strip_nulls(jsonb_build_object(
      'applicationId', "metadata"->>'applicationId',
      'contributionRequestId', "metadata"->>'contributionRequestId'
    ))
    WHEN "type" = 'proposal_status' THEN jsonb_strip_nulls(jsonb_build_object(
      'proposalId', "metadata"->>'proposalId',
      'projectId', "metadata"->>'projectId',
      'revisionRequestSequence', "metadata"->'revisionRequestSequence',
      'resultingContributionRequestId', "metadata"->>'resultingContributionRequestId'
    ))
    WHEN "type" = 'skill_review' THEN jsonb_strip_nulls(jsonb_build_object(
      'skillProfileId', "metadata"->>'skillProfileId',
      'skillName', "metadata"->>'skillName'
    ))
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
      'legacyBody', left(COALESCE("message", 'You have a new update in Share-k.'), 2000)
    )
  END,
  "deep_link" = CASE
    WHEN "type" = 'application_status'
      AND COALESCE("metadata"->>'applicationId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN '/applications/' || ("metadata"->>'applicationId')
    WHEN "type" = 'proposal_status'
      AND COALESCE("metadata"->>'proposalId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN '/proposals/' || ("metadata"->>'proposalId')
    WHEN "type" = 'skill_review' THEN '/settings?section=github'
    ELSE NULL
  END,
  "priority" = CASE
    WHEN "type" IN (
      'application_status', 'proposal_status', 'skill_review',
      'skill_profile_generation'
    )
      THEN 'attention'::"NotificationPriority"
    ELSE 'ambient'::"NotificationPriority"
  END,
  "aggregate_version" = 1;

ALTER TABLE "Notification"
  ALTER COLUMN "template_key" SET NOT NULL,
  ALTER COLUMN "template_version" SET NOT NULL,
  ALTER COLUMN "template_version" SET DEFAULT 1,
  ALTER COLUMN "parameters" SET NOT NULL,
  ALTER COLUMN "priority" SET NOT NULL,
  ALTER COLUMN "priority" SET DEFAULT 'ambient',
  ALTER COLUMN "aggregate_version" SET NOT NULL,
  ALTER COLUMN "aggregate_version" SET DEFAULT 1,
  ADD CONSTRAINT "Notification_template_version_positive" CHECK ("template_version" > 0),
  ADD CONSTRAINT "Notification_aggregate_version_positive" CHECK ("aggregate_version" > 0),
  ADD CONSTRAINT "Notification_parameters_object" CHECK (jsonb_typeof("parameters") = 'object'),
  ADD CONSTRAINT "Notification_deep_link_safe" CHECK (
    "deep_link" IS NULL OR ("deep_link" LIKE '/%' AND "deep_link" NOT LIKE '//%')
  ),
  ADD CONSTRAINT "Notification_read_state_consistent" CHECK (
    ("is_read" = false AND "read_at" IS NULL)
    OR ("is_read" = true AND "read_at" IS NOT NULL)
  );

CREATE INDEX "Notification_user_id_created_at_id_idx"
  ON "Notification"("user_id", "created_at" DESC, "id" DESC);
CREATE INDEX "Notification_user_id_is_read_created_at_idx"
  ON "Notification"("user_id", "is_read", "created_at");

CREATE TABLE "NotificationEvent" (
  "id" UUID NOT NULL,
  "notification_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "event_type" "NotificationEventType" NOT NULL,
  "aggregate_version" INTEGER NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3),
  "publish_attempts" INTEGER NOT NULL DEFAULT 0,
  "last_publish_error_code" VARCHAR(100),
  CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationEvent_aggregate_version_positive" CHECK ("aggregate_version" > 0)
);

CREATE UNIQUE INDEX "NotificationEvent_notification_id_aggregate_version_key"
  ON "NotificationEvent"("notification_id", "aggregate_version");
CREATE INDEX "NotificationEvent_published_at_occurred_at_idx"
  ON "NotificationEvent"("published_at", "occurred_at");
CREATE INDEX "NotificationEvent_user_id_occurred_at_idx"
  ON "NotificationEvent"("user_id", "occurred_at");

CREATE TABLE "NotificationPreference" (
  "user_id" UUID NOT NULL,
  "retention_days" INTEGER NOT NULL DEFAULT 90,
  "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
  "quiet_start_local" TIME(0),
  "quiet_end_local" TIME(0),
  "quiet_timezone" VARCHAR(100),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "NotificationPreference_retention_days_allowed" CHECK ("retention_days" IN (30, 90, 180, 365)),
  CONSTRAINT "NotificationPreference_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "NotificationPreference_quiet_hours_complete" CHECK (
    ("quiet_hours_enabled" = false AND "quiet_start_local" IS NULL AND "quiet_end_local" IS NULL AND "quiet_timezone" IS NULL)
    OR
    ("quiet_hours_enabled" = true AND "quiet_start_local" IS NOT NULL AND "quiet_end_local" IS NOT NULL AND "quiet_timezone" IS NOT NULL AND "quiet_start_local" <> "quiet_end_local")
  )
);

CREATE TABLE "NotificationCategoryPreference" (
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
  "browser_enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationCategoryPreference_pkey" PRIMARY KEY ("user_id", "type")
);

ALTER TABLE "NotificationEvent"
  ADD CONSTRAINT "NotificationEvent_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NotificationEvent_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationCategoryPreference"
  ADD CONSTRAINT "NotificationCategoryPreference_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "NotificationPreference"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
