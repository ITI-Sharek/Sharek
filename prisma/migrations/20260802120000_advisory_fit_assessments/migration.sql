CREATE TYPE "AssessmentRequestStatus" AS ENUM (
  'requested',
  'completed',
  'not_started_system_limit',
  'not_started_no_assessable_evidence',
  'cancelled_not_needed',
  'unavailable'
);

CREATE TYPE "AssessmentAttemptStatus" AS ENUM ('completed', 'failed');

CREATE TYPE "AssessmentFindingKind" AS ENUM (
  'supported',
  'partially_supported',
  'not_evidenced',
  'inconclusive'
);

CREATE TYPE "AssessmentConfidence" AS ENUM ('high', 'medium', 'low');

CREATE TYPE "AdvisoryFitBand" AS ENUM (
  'strong',
  'partial',
  'limited',
  'unknown',
  'unavailable'
);

CREATE TYPE "AssessmentAuditAction" AS ENUM (
  'requested',
  'attempt_completed',
  'attempt_failed',
  'not_started_system_limit',
  'not_started_no_assessable_evidence',
  'cancelled_not_needed',
  'unavailable',
  'presented'
);

CREATE TABLE "AssessmentRequest" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "contribution_request_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "requirement_snapshot_id" UUID NOT NULL,
  "evidence_snapshot_id" UUID NOT NULL,
  "status" "AssessmentRequestStatus" NOT NULL DEFAULT 'requested',
  "idempotency_key" VARCHAR(128) NOT NULL,
  "command_fingerprint" CHAR(64) NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentAttempt" (
  "id" UUID NOT NULL,
  "assessment_request_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "AssessmentAttemptStatus" NOT NULL,
  "provider" VARCHAR(100),
  "model" VARCHAR(100),
  "prompt_version" VARCHAR(100),
  "schema_version" VARCHAR(100),
  "service_version" VARCHAR(100),
  "latency_ms" INTEGER,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "error_code" VARCHAR(100),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvisoryFitAssessment" (
  "id" UUID NOT NULL,
  "assessment_attempt_id" UUID NOT NULL,
  "fit_band" "AdvisoryFitBand" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdvisoryFitAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentFinding" (
  "id" UUID NOT NULL,
  "advisory_fit_assessment_id" UUID NOT NULL,
  "requirement_id" UUID NOT NULL,
  "requirement_kind" "ContributionRequestRequirementKind" NOT NULL,
  "finding" "AssessmentFindingKind" NOT NULL,
  "confidence" "AssessmentConfidence" NOT NULL,
  "citations" JSONB NOT NULL,
  "uncertainty" JSONB NOT NULL,
  "explanation" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentFinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentPresentation" (
  "id" UUID NOT NULL,
  "advisory_fit_assessment_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "presented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentPresentation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentRequestAudit" (
  "id" UUID NOT NULL,
  "assessment_request_id" UUID NOT NULL,
  "actor_id" UUID,
  "action" "AssessmentAuditAction" NOT NULL,
  "from_status" "AssessmentRequestStatus",
  "to_status" "AssessmentRequestStatus" NOT NULL,
  "attempt_number" INTEGER,
  "idempotency_key" VARCHAR(128),
  "command_fingerprint" CHAR(64),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentRequestAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentRequest_owner_id_idempotency_key_key"
  ON "AssessmentRequest"("owner_id", "idempotency_key");
CREATE INDEX "AssessmentRequest_application_id_status_created_at_idx"
  ON "AssessmentRequest"("application_id", "status", "created_at");
CREATE INDEX "AssessmentRequest_contribution_request_id_created_at_idx"
  ON "AssessmentRequest"("contribution_request_id", "created_at");
CREATE UNIQUE INDEX "AssessmentRequest_one_active_application_idx"
  ON "AssessmentRequest"("application_id")
  WHERE "status" = 'requested';

CREATE UNIQUE INDEX "AssessmentAttempt_assessment_request_id_attempt_number_key"
  ON "AssessmentAttempt"("assessment_request_id", "attempt_number");
CREATE INDEX "AssessmentAttempt_assessment_request_id_created_at_idx"
  ON "AssessmentAttempt"("assessment_request_id", "created_at");

CREATE UNIQUE INDEX "AdvisoryFitAssessment_assessment_attempt_id_key"
  ON "AdvisoryFitAssessment"("assessment_attempt_id");

CREATE UNIQUE INDEX "AssessmentFinding_advisory_fit_assessment_id_requirement_id_key"
  ON "AssessmentFinding"("advisory_fit_assessment_id", "requirement_id");
CREATE INDEX "AssessmentFinding_requirement_id_idx"
  ON "AssessmentFinding"("requirement_id");

CREATE UNIQUE INDEX "AssessmentPresentation_advisory_fit_assessment_id_key"
  ON "AssessmentPresentation"("advisory_fit_assessment_id");

CREATE UNIQUE INDEX "AssessmentRequestAudit_assessment_request_id_action_attempt_number_key"
  ON "AssessmentRequestAudit"("assessment_request_id", "action", "attempt_number");
CREATE INDEX "AssessmentRequestAudit_assessment_request_id_created_at_idx"
  ON "AssessmentRequestAudit"("assessment_request_id", "created_at");

ALTER TABLE "AssessmentRequest"
  ADD CONSTRAINT "AssessmentRequest_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssessmentRequest_contribution_request_id_fkey"
  FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssessmentRequest_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssessmentRequest_requirement_snapshot_id_fkey"
  FOREIGN KEY ("requirement_snapshot_id") REFERENCES "ApplicationRequirementSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssessmentRequest_evidence_snapshot_id_fkey"
  FOREIGN KEY ("evidence_snapshot_id") REFERENCES "ApplicationEvidenceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssessmentAttempt"
  ADD CONSTRAINT "AssessmentAttempt_assessment_request_id_fkey"
  FOREIGN KEY ("assessment_request_id") REFERENCES "AssessmentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdvisoryFitAssessment"
  ADD CONSTRAINT "AdvisoryFitAssessment_assessment_attempt_id_fkey"
  FOREIGN KEY ("assessment_attempt_id") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssessmentFinding"
  ADD CONSTRAINT "AssessmentFinding_advisory_fit_assessment_id_fkey"
  FOREIGN KEY ("advisory_fit_assessment_id") REFERENCES "AdvisoryFitAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssessmentPresentation"
  ADD CONSTRAINT "AssessmentPresentation_advisory_fit_assessment_id_fkey"
  FOREIGN KEY ("advisory_fit_assessment_id") REFERENCES "AdvisoryFitAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssessmentPresentation_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssessmentRequestAudit"
  ADD CONSTRAINT "AssessmentRequestAudit_assessment_request_id_fkey"
  FOREIGN KEY ("assessment_request_id") REFERENCES "AssessmentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssessmentRequestAudit_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
