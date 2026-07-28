BEGIN;

CREATE SCHEMA application_status_migration_guard_test;
SET LOCAL search_path TO application_status_migration_guard_test;

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

INSERT INTO "ContributionRequest" ("id", "status")
VALUES ('draft', 'draft');
INSERT INTO "Application" (
  "id",
  "contribution_request_id",
  "status",
  "owner_reviewed_at"
) VALUES ('invalid-draft-application', 'draft', 'ineligible', NULL);

\ir ../../prisma/migrations/20260728150000_application_owner_review_states/migration.sql

ROLLBACK;
