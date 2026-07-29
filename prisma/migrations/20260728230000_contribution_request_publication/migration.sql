ALTER TYPE "ContributionRequestAuditAction" ADD VALUE IF NOT EXISTS 'published';
ALTER TYPE "ContributionRequestAuditAction" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE "ApplicationAuditAction" ADD VALUE IF NOT EXISTS 'request_cancelled';

CREATE INDEX "ContributionRequest_status_applications_close_at_published__idx"
ON "ContributionRequest"("status", "applications_close_at", "published_at");
