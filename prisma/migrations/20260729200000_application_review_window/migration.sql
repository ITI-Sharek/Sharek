ALTER TYPE "ApplicationAuditAction" ADD VALUE 'expired';

ALTER TABLE "Application"
ADD COLUMN "review_reminder_sent_at" TIMESTAMP(3);

ALTER TABLE "ApplicationAudit"
ALTER COLUMN "actor_id" DROP NOT NULL;

CREATE INDEX "Application_status_review_reminder_sent_at_review_due_at_idx"
ON "Application"("status", "review_reminder_sent_at", "review_due_at");

CREATE INDEX "Application_status_expires_at_idx"
ON "Application"("status", "expires_at");
