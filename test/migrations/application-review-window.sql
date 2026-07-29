DROP SCHEMA IF EXISTS application_review_window_migration_test CASCADE;
CREATE SCHEMA application_review_window_migration_test;
SET search_path TO application_review_window_migration_test;

CREATE TYPE "ApplicationStatus" AS ENUM (
  'pending_owner_review', 'accepted', 'declined_by_owner', 'not_selected',
  'expired', 'withdrawn', 'request_cancelled'
);
CREATE TYPE "ApplicationAuditAction" AS ENUM (
  'submitted', 'withdrawn', 'request_cancelled', 'accepted',
  'declined_by_owner', 'not_selected'
);

CREATE TABLE "Application" (
  "id" UUID PRIMARY KEY,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'pending_owner_review',
  "review_due_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3)
);

CREATE TABLE "ApplicationAudit" (
  "id" UUID PRIMARY KEY,
  "application_id" UUID NOT NULL REFERENCES "Application"("id"),
  "actor_id" UUID NOT NULL,
  "action" "ApplicationAuditAction" NOT NULL,
  "from_status" "ApplicationStatus",
  "to_status" "ApplicationStatus" NOT NULL,
  "idempotency_key" VARCHAR(128),
  "command_fingerprint" CHAR(64),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

\ir ../../prisma/migrations/20260729200000_application_review_window/migration.sql

INSERT INTO "Application" (
  "id", "status", "review_due_at", "expires_at", "review_reminder_sent_at"
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'expired',
  '2026-08-01T12:00:00Z',
  '2026-08-05T12:00:00Z',
  '2026-08-01T12:00:00Z'
);

INSERT INTO "ApplicationAudit" (
  "id", "application_id", "actor_id", "action", "from_status", "to_status",
  "idempotency_key", "command_fingerprint", "metadata"
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  NULL,
  'expired',
  'pending_owner_review',
  'expired',
  'application-review-expiry:11111111-1111-4111-8111-111111111111',
  repeat('a', 64),
  '{"payloadVersion":1,"trigger":"owner_review_window"}'::jsonb
);

DO $migration_test$
DECLARE
  actor_nullable TEXT;
BEGIN
  SELECT is_nullable
  INTO actor_nullable
  FROM information_schema.columns
  WHERE table_schema = 'application_review_window_migration_test'
    AND table_name = 'ApplicationAudit'
    AND column_name = 'actor_id';

  IF actor_nullable <> 'YES' THEN
    RAISE EXCEPTION 'ApplicationAudit.actor_id did not become nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid =
      'application_review_window_migration_test."ApplicationAuditAction"'::regtype
      AND enumlabel = 'expired'
  ) THEN
    RAISE EXCEPTION 'ApplicationAuditAction.expired was not added';
  END IF;

  IF to_regclass(
    'application_review_window_migration_test."Application_status_review_reminder_sent_at_review_due_at_idx"'
  ) IS NULL THEN
    RAISE EXCEPTION 'Application reminder scan index was not created';
  END IF;

  IF to_regclass(
    'application_review_window_migration_test."Application_status_expires_at_idx"'
  ) IS NULL THEN
    RAISE EXCEPTION 'Application expiry scan index was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "ApplicationAudit"
    WHERE "actor_id" IS NULL
      AND "action" = 'expired'
      AND "to_status" = 'expired'
  ) THEN
    RAISE EXCEPTION 'A system-attributed expiry audit could not be stored';
  END IF;
END
$migration_test$;

DROP SCHEMA application_review_window_migration_test CASCADE;
