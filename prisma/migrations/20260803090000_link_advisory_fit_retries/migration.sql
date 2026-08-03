ALTER TABLE "AssessmentAttempt"
  ADD COLUMN "retry_of_attempt_id" UUID;

CREATE INDEX "AssessmentAttempt_retry_of_attempt_id_idx"
  ON "AssessmentAttempt"("retry_of_attempt_id");

ALTER TABLE "AssessmentAttempt"
  ADD CONSTRAINT "AssessmentAttempt_retry_of_attempt_id_fkey"
  FOREIGN KEY ("retry_of_attempt_id") REFERENCES "AssessmentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
