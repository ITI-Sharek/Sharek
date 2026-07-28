-- Sprint 4 B04: add immutable Application submission inputs and workflow audit.
-- Snapshot references and delivery duration remain nullable for migrated legacy
-- rows whose historical inputs cannot be reconstructed without inventing data.
CREATE TYPE "ApplicationAuditAction" AS ENUM ('submitted', 'withdrawn');

ALTER TABLE "Application"
  ADD COLUMN "contribution_approach" TEXT,
  ADD COLUMN "proposed_delivery_duration_days" INTEGER,
  ADD COLUMN "requirement_snapshot_id" UUID,
  ADD COLUMN "evidence_snapshot_id" UUID,
  ADD COLUMN "review_due_at" TIMESTAMP(3),
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "expired_at" TIMESTAMP(3);

UPDATE "Application"
SET "contribution_approach" = "cover_message"
WHERE "cover_message" IS NOT NULL;

CREATE TABLE "ApplicationRequirementSnapshot" (
  "id" UUID NOT NULL,
  "contribution_request_id" UUID NOT NULL,
  "source_request_updated_at" TIMESTAMP(3) NOT NULL,
  "requirements" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationRequirementSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationEvidenceSnapshot" (
  "id" UUID NOT NULL,
  "contributor_id" UUID NOT NULL,
  "contributor_context" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationEvidenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationAudit" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "action" "ApplicationAuditAction" NOT NULL,
  "from_status" "ApplicationStatus",
  "to_status" "ApplicationStatus" NOT NULL,
  "idempotency_key" VARCHAR(128),
  "command_fingerprint" CHAR(64),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification"
  ADD COLUMN "deduplication_key" VARCHAR(160);

CREATE UNIQUE INDEX "Application_contribution_request_id_contributor_id_key"
  ON "Application"("contribution_request_id", "contributor_id");
CREATE UNIQUE INDEX "Application_requirement_snapshot_id_key"
  ON "Application"("requirement_snapshot_id");
CREATE UNIQUE INDEX "Application_evidence_snapshot_id_key"
  ON "Application"("evidence_snapshot_id");
CREATE INDEX "Application_contribution_request_id_status_submitted_at_idx"
  ON "Application"("contribution_request_id", "status", "submitted_at");
CREATE INDEX "Application_contributor_id_submitted_at_idx"
  ON "Application"("contributor_id", "submitted_at");
CREATE INDEX "ApplicationRequirementSnapshot_contribution_request_id_idx"
  ON "ApplicationRequirementSnapshot"("contribution_request_id");
CREATE INDEX "ApplicationEvidenceSnapshot_contributor_id_created_at_idx"
  ON "ApplicationEvidenceSnapshot"("contributor_id", "created_at");
CREATE UNIQUE INDEX "ApplicationAudit_actor_id_action_idempotency_key_key"
  ON "ApplicationAudit"("actor_id", "action", "idempotency_key");
CREATE INDEX "ApplicationAudit_application_id_created_at_idx"
  ON "ApplicationAudit"("application_id", "created_at");
CREATE UNIQUE INDEX "Notification_deduplication_key_key"
  ON "Notification"("deduplication_key");

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_requirement_snapshot_id_fkey"
  FOREIGN KEY ("requirement_snapshot_id") REFERENCES "ApplicationRequirementSnapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Application"
  ADD CONSTRAINT "Application_evidence_snapshot_id_fkey"
  FOREIGN KEY ("evidence_snapshot_id") REFERENCES "ApplicationEvidenceSnapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicationEvidenceSnapshot"
  ADD CONSTRAINT "ApplicationEvidenceSnapshot_contributor_id_fkey"
  FOREIGN KEY ("contributor_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicationAudit"
  ADD CONSTRAINT "ApplicationAudit_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "Application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicationAudit"
  ADD CONSTRAINT "ApplicationAudit_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_proposed_delivery_duration_days_check"
  CHECK ("proposed_delivery_duration_days" IS NULL OR
         "proposed_delivery_duration_days" BETWEEN 1 AND 365);
