BEGIN;

CREATE SCHEMA application_status_migration_test;
SET LOCAL search_path TO application_status_migration_test;

CREATE TYPE "ContributionRequestStatus" AS ENUM (
  'draft',
  'published',
  'assigned',
  'completed',
  'cancelled',
  'discarded'
);
CREATE TYPE "ApplicationStatus" AS ENUM (
  'pending_validation',
  'eligible',
  'ineligible',
  'accepted',
  'rejected',
  'withdrawn'
);

CREATE TABLE "ContributionRequest" (
  "id" TEXT PRIMARY KEY,
  "status" "ContributionRequestStatus" NOT NULL
);
CREATE TABLE "Application" (
  "id" TEXT PRIMARY KEY,
  "contribution_request_id" TEXT NOT NULL REFERENCES "ContributionRequest"("id"),
  "status" "ApplicationStatus" NOT NULL DEFAULT 'pending_validation',
  "owner_reviewed_at" TIMESTAMP(3)
);

INSERT INTO "ContributionRequest" ("id", "status") VALUES
  ('draft', 'draft'),
  ('published', 'published'),
  ('assigned', 'assigned'),
  ('completed', 'completed'),
  ('cancelled', 'cancelled'),
  ('discarded', 'discarded');

INSERT INTO "Application" (
  "id",
  "contribution_request_id",
  "status",
  "owner_reviewed_at"
) VALUES
  ('pending-validation', 'published', 'pending_validation', NULL),
  ('eligible', 'published', 'eligible', NULL),
  ('ai-ineligible', 'published', 'ineligible', NULL),
  ('unproven-rejection', 'published', 'rejected', NULL),
  ('proven-owner-decline', 'published', 'rejected', '2026-07-20T10:00:00Z'),
  ('accepted', 'published', 'accepted', '2026-07-20T10:00:00Z'),
  ('withdrawn', 'published', 'withdrawn', NULL),
  ('cancelled-ineligible', 'cancelled', 'ineligible', NULL),
  ('discarded-eligible', 'discarded', 'eligible', NULL),
  ('assigned-sibling', 'assigned', 'eligible', NULL),
  ('assigned-unproven-rejection', 'assigned', 'rejected', NULL),
  ('completed-sibling', 'completed', 'pending_validation', NULL),
  ('accepted-on-assigned', 'assigned', 'accepted', '2026-07-20T10:00:00Z'),
  ('declined-before-cancellation', 'cancelled', 'rejected', '2026-07-20T10:00:00Z'),
  ('accepted-before-cancellation', 'cancelled', 'accepted', '2026-07-20T10:00:00Z'),
  ('withdrawn-before-discard', 'discarded', 'withdrawn', NULL);

\ir ../../prisma/migrations/20260728150000_application_owner_review_states/migration.sql

DO $migration_test$
DECLARE
  actual_labels TEXT[];
  default_status application_status_migration_test."ApplicationStatus";
BEGIN
  SELECT array_agg(enumlabel ORDER BY enumsortorder)
  INTO actual_labels
  FROM pg_enum
  WHERE enumtypid = 'application_status_migration_test."ApplicationStatus"'::regtype;

  IF actual_labels <> ARRAY[
    'pending_owner_review',
    'accepted',
    'declined_by_owner',
    'not_selected',
    'expired',
    'withdrawn',
    'request_cancelled'
  ] THEN
    RAISE EXCEPTION 'Unexpected ApplicationStatus labels: %', actual_labels;
  END IF;

  INSERT INTO "Application" ("id", "contribution_request_id")
  VALUES ('new-default', 'published')
  RETURNING "status" INTO default_status;

  IF default_status <> 'pending_owner_review' THEN
    RAISE EXCEPTION 'Unexpected Application.status default: %', default_status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('pending-validation', 'pending_owner_review'),
        ('eligible', 'pending_owner_review'),
        ('ai-ineligible', 'pending_owner_review'),
        ('unproven-rejection', 'pending_owner_review'),
        ('proven-owner-decline', 'declined_by_owner'),
        ('accepted', 'accepted'),
        ('withdrawn', 'withdrawn'),
        ('cancelled-ineligible', 'request_cancelled'),
        ('discarded-eligible', 'request_cancelled'),
        ('assigned-sibling', 'not_selected'),
        ('assigned-unproven-rejection', 'not_selected'),
        ('completed-sibling', 'not_selected'),
        ('accepted-on-assigned', 'accepted'),
        ('declined-before-cancellation', 'declined_by_owner'),
        ('accepted-before-cancellation', 'accepted'),
        ('withdrawn-before-discard', 'withdrawn')
    ) AS expected(id, status)
    LEFT JOIN "Application" AS application ON application."id" = expected.id
    WHERE application."status"::TEXT IS DISTINCT FROM expected.status
  ) THEN
    RAISE EXCEPTION 'One or more legacy Application rows were mapped incorrectly';
  END IF;
END
$migration_test$;

ROLLBACK;
