-- Sprint 4 B01: replace the superseded AI-validation gate with the
-- owner-review Application lifecycle while preserving historical meaning.
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

    -- pending_validation, eligible, AI-produced ineligible, and rejected rows
    -- without proof of an owner action return to the owner-review queue.
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
