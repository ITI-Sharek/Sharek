BEGIN;

CREATE SCHEMA owner_decision_migration_test;
SET LOCAL search_path TO owner_decision_migration_test;

CREATE TYPE "ContributionRequestStatus" AS ENUM (
  'draft', 'published', 'assigned', 'completed', 'cancelled', 'discarded'
);
CREATE TYPE "ContributionRequestAuditAction" AS ENUM (
  'created', 'updated', 'discarded'
);
CREATE TYPE "ApplicationStatus" AS ENUM (
  'pending_owner_review', 'accepted', 'declined_by_owner', 'not_selected',
  'expired', 'withdrawn', 'request_cancelled'
);
CREATE TYPE "ApplicationAuditAction" AS ENUM ('submitted', 'withdrawn');
CREATE TYPE "ReportReason" AS ENUM (
  'fraud', 'misuse', 'reputation_manipulation', 'inaccurate_ai', 'harassment',
  'other'
);
CREATE TYPE "ReportStatus" AS ENUM (
  'open', 'investigating', 'resolved', 'dismissed'
);
CREATE TYPE "ReportedContentType" AS ENUM (
  'user', 'project', 'contribution_request', 'application', 'delivery',
  'skill_profile'
);

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY
);
CREATE TABLE "ContributionRequest" (
  "id" UUID PRIMARY KEY,
  "owner_id" UUID NOT NULL REFERENCES "User"("id"),
  "status" "ContributionRequestStatus" NOT NULL
);
CREATE TABLE "Application" (
  "id" UUID PRIMARY KEY,
  "contribution_request_id" UUID NOT NULL REFERENCES "ContributionRequest"("id"),
  "contributor_id" UUID NOT NULL REFERENCES "User"("id"),
  "status" "ApplicationStatus" NOT NULL
);
CREATE TABLE "ApplicationAudit" (
  "id" UUID PRIMARY KEY,
  "application_id" UUID NOT NULL REFERENCES "Application"("id"),
  "actor_id" UUID NOT NULL REFERENCES "User"("id"),
  "action" "ApplicationAuditAction" NOT NULL,
  "from_status" "ApplicationStatus",
  "to_status" "ApplicationStatus" NOT NULL,
  "idempotency_key" VARCHAR(128),
  "command_fingerprint" CHAR(64),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ContributionRequestAudit" (
  "id" UUID PRIMARY KEY,
  "contribution_request_id" UUID NOT NULL REFERENCES "ContributionRequest"("id"),
  "actor_id" UUID NOT NULL REFERENCES "User"("id"),
  "action" "ContributionRequestAuditAction" NOT NULL,
  "from_status" "ContributionRequestStatus",
  "to_status" "ContributionRequestStatus" NOT NULL,
  "reason" VARCHAR(500),
  "payload_version" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" VARCHAR(128),
  "command_fingerprint" CHAR(64),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Report" (
  "id" UUID PRIMARY KEY,
  "reporter_id" UUID NOT NULL REFERENCES "User"("id"),
  "reported_user_id" UUID REFERENCES "User"("id"),
  "reported_content_id" UUID,
  "reported_content_type" "ReportedContentType",
  "reason" "ReportReason" NOT NULL,
  "description" TEXT NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'open',
  "resolved_by" UUID REFERENCES "User"("id"),
  "resolution_notes" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "User" ("id") VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
INSERT INTO "ContributionRequest" ("id", "owner_id", "status") VALUES
  ('33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'published'),
  ('33333333-3333-4333-8333-333333333334',
   '11111111-1111-4111-8111-111111111111', 'published');
INSERT INTO "Application" (
  "id", "contribution_request_id", "contributor_id", "status"
) VALUES
  ('44444444-4444-4444-8444-444444444441',
   '33333333-3333-4333-8333-333333333333',
   '22222222-2222-4222-8222-222222222222', 'pending_owner_review'),
  ('44444444-4444-4444-8444-444444444442',
   '33333333-3333-4333-8333-333333333334',
   '22222222-2222-4222-8222-222222222222', 'pending_owner_review'),
  ('44444444-4444-4444-8444-444444444443',
   '33333333-3333-4333-8333-333333333333',
   '22222222-2222-4222-8222-222222222222', 'pending_owner_review');

\ir ../../prisma/migrations/20260729120000_owner_decisions_assignments/migration.sql

DO $migration_test$
BEGIN
  BEGIN
    INSERT INTO "OwnerDecision" (
      "id", "application_id", "contribution_request_id", "owner_id",
      "decision_type", "feedback", "idempotency_key", "command_fingerprint"
    ) VALUES (
      '55555555-5555-4555-8555-555555555551',
      '44444444-4444-4444-8444-444444444441',
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111', 'declined', NULL,
      '66666666-6666-4666-8666-666666666651',
      repeat('a', 64)
    );
    RAISE EXCEPTION 'A decline with NULL feedback was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "OwnerDecision" (
      "id", "application_id", "contribution_request_id", "owner_id",
      "decision_type", "feedback", "idempotency_key", "command_fingerprint"
    ) VALUES (
      '55555555-5555-4555-8555-555555555552',
      '44444444-4444-4444-8444-444444444441',
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111', 'declined', '',
      '66666666-6666-4666-8666-666666666652',
      repeat('b', 64)
    );
    RAISE EXCEPTION 'A decline with empty feedback was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "OwnerDecision" (
      "id", "application_id", "contribution_request_id", "owner_id",
      "decision_type", "feedback", "idempotency_key", "command_fingerprint"
    ) VALUES (
      '55555555-5555-4555-8555-555555555553',
      '44444444-4444-4444-8444-444444444441',
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111', 'declined', '   ',
      '66666666-6666-4666-8666-666666666653',
      repeat('c', 64)
    );
    RAISE EXCEPTION 'A decline with whitespace-only feedback was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$migration_test$;

INSERT INTO "OwnerDecision" (
  "id", "application_id", "contribution_request_id", "owner_id",
  "decision_type", "feedback", "idempotency_key", "command_fingerprint"
) VALUES (
  '55555555-5555-4555-8555-555555555554',
  '44444444-4444-4444-8444-444444444441',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111', 'accepted', NULL,
  '66666666-6666-4666-8666-666666666666', repeat('d', 64)
);

DO $idempotency_test$
BEGIN
  BEGIN
    INSERT INTO "OwnerDecision" (
      "id", "application_id", "contribution_request_id", "owner_id",
      "decision_type", "feedback", "idempotency_key", "command_fingerprint"
    ) VALUES (
      '55555555-5555-4555-8555-555555555555',
      '44444444-4444-4444-8444-444444444443',
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111', 'accepted', NULL,
      '66666666-6666-4666-8666-666666666666', repeat('e', 64)
    );
    RAISE EXCEPTION 'A duplicate Owner Decision command was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$idempotency_test$;

INSERT INTO "OwnerDecision" (
  "id", "application_id", "contribution_request_id", "owner_id",
  "decision_type", "feedback", "idempotency_key", "command_fingerprint"
) VALUES
  (
    '55555555-5555-4555-8555-555555555555',
    '44444444-4444-4444-8444-444444444443',
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111', 'accepted', NULL,
    '66666666-6666-4666-8666-666666666667', repeat('e', 64)
  ),
  (
    '55555555-5555-4555-8555-555555555556',
    '44444444-4444-4444-8444-444444444442',
    '33333333-3333-4333-8333-333333333334',
    '11111111-1111-4111-8111-111111111111', 'accepted', NULL,
    '66666666-6666-4666-8666-666666666668', repeat('f', 64)
  );
INSERT INTO "Assignment" (
  "id", "contribution_request_id", "application_id", "owner_decision_id",
  "contributor_id", "agreed_delivery_duration_days",
  "agreed_delivery_due_at"
) VALUES (
  '77777777-7777-4777-8777-777777777771',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444441',
  '55555555-5555-4555-8555-555555555554',
  '22222222-2222-4222-8222-222222222222', 5,
  '2026-08-03T12:00:00Z'
);

DO $assignment_test$
BEGIN
  BEGIN
    INSERT INTO "Assignment" (
      "id", "contribution_request_id", "application_id", "owner_decision_id",
      "contributor_id", "agreed_delivery_duration_days",
      "agreed_delivery_due_at"
    ) VALUES (
      '77777777-7777-4777-8777-777777777772',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444443',
      '55555555-5555-4555-8555-555555555555',
      '22222222-2222-4222-8222-222222222222', 5,
      '2026-08-03T12:00:00Z'
    );
    RAISE EXCEPTION 'A second Assignment for one Request was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "Assignment" (
      "id", "contribution_request_id", "application_id", "owner_decision_id",
      "contributor_id", "agreed_delivery_duration_days",
      "agreed_delivery_due_at"
    ) VALUES (
      '77777777-7777-4777-8777-777777777773',
      '33333333-3333-4333-8333-333333333334',
      '44444444-4444-4444-8444-444444444441',
      '55555555-5555-4555-8555-555555555556',
      '22222222-2222-4222-8222-222222222222', 5,
      '2026-08-03T12:00:00Z'
    );
    RAISE EXCEPTION 'A second Assignment for one Application was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$assignment_test$;

ROLLBACK;
