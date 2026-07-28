-- Sprint 4 B01: replace the superseded AI-validation gate with the
-- owner-review Application lifecycle while preserving historical meaning.
DO $migration_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Application" AS application
    INNER JOIN "ContributionRequest" AS request
      ON request."id" = application."contribution_request_id"
    WHERE request."status" = 'draft'
      AND (
        application."status" IN (
          'pending_validation',
          'eligible',
          'ineligible'
        )
        OR (
          application."status" = 'rejected'
          AND application."owner_reviewed_at" IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot migrate unresolved Applications attached to a draft Contribution Request',
      HINT = 'Resolve the invalid parent/request history before retrying the migration.';
  END IF;
END
$migration_guard$;

CREATE TYPE "ApplicationStatus_owner_review" AS ENUM (
  'pending_owner_review',
  'accepted',
  'declined_by_owner',
  'not_selected',
  'expired',
  'withdrawn',
  'request_cancelled'
);

ALTER TABLE "Application"
  ADD COLUMN "status_owner_review" "ApplicationStatus_owner_review";

UPDATE "Application" AS application
SET "status_owner_review" = (
  CASE
    -- These legacy states already record terminal human/contributor outcomes.
    WHEN application."status" = 'accepted' THEN 'accepted'
    WHEN application."status" = 'withdrawn' THEN 'withdrawn'
    WHEN application."status" = 'rejected'
      AND application."owner_reviewed_at" IS NOT NULL
      THEN 'declined_by_owner'

    -- AI or otherwise unresolved outcomes inherit terminal Request meaning.
    WHEN request."status" IN ('cancelled', 'discarded')
      THEN 'request_cancelled'
    WHEN request."status" IN ('assigned', 'completed')
      THEN 'not_selected'

    -- The guard above excludes non-actionable drafts. Remaining
    -- pending_validation, eligible, AI-produced ineligible, and rejected rows
    -- without proof of an owner action belong to actionable published Requests.
    ELSE 'pending_owner_review'
  END
)::"ApplicationStatus_owner_review"
FROM "ContributionRequest" AS request
WHERE request."id" = application."contribution_request_id";

ALTER TABLE "Application"
  ALTER COLUMN "status_owner_review" SET NOT NULL,
  ALTER COLUMN "status" DROP DEFAULT,
  DROP COLUMN "status";

ALTER TABLE "Application"
  RENAME COLUMN "status_owner_review" TO "status";

ALTER TABLE "Application"
  ALTER COLUMN "status" SET DEFAULT 'pending_owner_review';

DROP TYPE "ApplicationStatus";
ALTER TYPE "ApplicationStatus_owner_review" RENAME TO "ApplicationStatus";
