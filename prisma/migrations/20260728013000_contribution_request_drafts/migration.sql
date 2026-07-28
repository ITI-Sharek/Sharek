-- Sprint 4 B02: preserve the existing ContributionRequest rows while evolving
-- the placeholder task shape into the canonical draft work contract.
ALTER TYPE "ContributionRequestStatus" ADD VALUE IF NOT EXISTS 'discarded';

CREATE TYPE "ContributionRequestRequirementKind" AS ENUM ('required', 'preferred');
CREATE TYPE "ContributionRequestAuditAction" AS ENUM ('created', 'updated', 'discarded');

ALTER TABLE "ContributionRequest"
  RENAME COLUMN "required_technologies" TO "technology_tags";

ALTER TABLE "ContributionRequest"
  RENAME COLUMN "deadline" TO "target_completion_date";

ALTER TABLE "ContributionRequest"
  ALTER COLUMN "technology_tags" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "difficulty" DROP NOT NULL,
  ADD COLUMN "applications_close_at" TIMESTAMP(3);

CREATE TABLE "ContributionRequestRequirement" (
  "id" UUID NOT NULL,
  "contribution_request_id" UUID NOT NULL,
  "kind" "ContributionRequestRequirementKind" NOT NULL,
  "position" INTEGER NOT NULL,
  "text" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContributionRequestRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContributionRequestAudit" (
  "id" UUID NOT NULL,
  "contribution_request_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "action" "ContributionRequestAuditAction" NOT NULL,
  "from_status" "ContributionRequestStatus",
  "to_status" "ContributionRequestStatus" NOT NULL,
  "reason" VARCHAR(500),
  "payload_version" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" VARCHAR(128),
  "command_fingerprint" CHAR(64),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContributionRequestAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContributionRequestRequirement_contribution_request_id_kind_position_key"
  ON "ContributionRequestRequirement"("contribution_request_id", "kind", "position");
CREATE INDEX "ContributionRequestRequirement_contribution_request_id_kind_idx"
  ON "ContributionRequestRequirement"("contribution_request_id", "kind");
CREATE UNIQUE INDEX "ContributionRequestAudit_actor_id_action_idempotency_key_key"
  ON "ContributionRequestAudit"("actor_id", "action", "idempotency_key");
CREATE INDEX "ContributionRequestAudit_contribution_request_id_created_at_idx"
  ON "ContributionRequestAudit"("contribution_request_id", "created_at");
CREATE INDEX "ContributionRequest_project_id_status_idx"
  ON "ContributionRequest"("project_id", "status");
CREATE INDEX "ContributionRequest_owner_id_created_at_idx"
  ON "ContributionRequest"("owner_id", "created_at");

ALTER TABLE "ContributionRequestRequirement"
  ADD CONSTRAINT "ContributionRequestRequirement_contribution_request_id_fkey"
  FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContributionRequestAudit"
  ADD CONSTRAINT "ContributionRequestAudit_contribution_request_id_fkey"
  FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContributionRequestAudit"
  ADD CONSTRAINT "ContributionRequestAudit_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
