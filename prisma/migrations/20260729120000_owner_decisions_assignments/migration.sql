-- Sprint 4 B05: immutable human Owner Decisions, one Assignment per Request,
-- and reportable decline feedback. NOT_SELECTED remains an Application audit
-- outcome and never creates an OwnerDecision row.
ALTER TYPE "ContributionRequestAuditAction" ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE "ApplicationAuditAction" ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE "ApplicationAuditAction" ADD VALUE IF NOT EXISTS 'declined_by_owner';
ALTER TYPE "ApplicationAuditAction" ADD VALUE IF NOT EXISTS 'not_selected';
ALTER TYPE "ReportedContentType" ADD VALUE IF NOT EXISTS 'owner_decision';

CREATE TYPE "OwnerDecisionType" AS ENUM ('accepted', 'declined');

CREATE TABLE "OwnerDecision" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "contribution_request_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "decision_type" "OwnerDecisionType" NOT NULL,
  "feedback" VARCHAR(2000),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "command_fingerprint" CHAR(64) NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OwnerDecision_feedback_check" CHECK (
    ("decision_type" = 'accepted' AND "feedback" IS NULL)
    OR
    (
      "decision_type" = 'declined'
      AND "feedback" IS NOT NULL
      AND btrim("feedback") <> ''
    )
  )
);

CREATE TABLE "Assignment" (
  "id" UUID NOT NULL,
  "contribution_request_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "owner_decision_id" UUID NOT NULL,
  "contributor_id" UUID NOT NULL,
  "agreed_delivery_duration_days" INTEGER NOT NULL,
  "agreed_delivery_due_at" TIMESTAMP(3) NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Assignment_delivery_duration_days_check" CHECK (
    "agreed_delivery_duration_days" BETWEEN 1 AND 365
  )
);

ALTER TABLE "Report" ADD COLUMN "owner_decision_id" UUID;

CREATE UNIQUE INDEX "OwnerDecision_application_id_key"
  ON "OwnerDecision"("application_id");
CREATE UNIQUE INDEX "OwnerDecision_owner_id_idempotency_key_key"
  ON "OwnerDecision"("owner_id", "idempotency_key");
CREATE INDEX "OwnerDecision_contribution_request_id_decided_at_idx"
  ON "OwnerDecision"("contribution_request_id", "decided_at");

CREATE UNIQUE INDEX "Assignment_contribution_request_id_key"
  ON "Assignment"("contribution_request_id");
CREATE UNIQUE INDEX "Assignment_application_id_key"
  ON "Assignment"("application_id");
CREATE UNIQUE INDEX "Assignment_owner_decision_id_key"
  ON "Assignment"("owner_decision_id");
CREATE INDEX "Assignment_contributor_id_assigned_at_idx"
  ON "Assignment"("contributor_id", "assigned_at");

CREATE UNIQUE INDEX "Report_reporter_id_owner_decision_id_key"
  ON "Report"("reporter_id", "owner_decision_id");
CREATE INDEX "Report_owner_decision_id_created_at_idx"
  ON "Report"("owner_decision_id", "created_at");

ALTER TABLE "OwnerDecision"
  ADD CONSTRAINT "OwnerDecision_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "Application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnerDecision"
  ADD CONSTRAINT "OwnerDecision_contribution_request_id_fkey"
  FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnerDecision"
  ADD CONSTRAINT "OwnerDecision_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_contribution_request_id_fkey"
  FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "Application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_owner_decision_id_fkey"
  FOREIGN KEY ("owner_decision_id") REFERENCES "OwnerDecision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_contributor_id_fkey"
  FOREIGN KEY ("contributor_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Report"
  ADD CONSTRAINT "Report_owner_decision_id_fkey"
  FOREIGN KEY ("owner_decision_id") REFERENCES "OwnerDecision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
