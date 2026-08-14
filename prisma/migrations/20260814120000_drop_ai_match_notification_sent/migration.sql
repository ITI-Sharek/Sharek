-- Drop `AiMatchResult.notification_sent`.
--
-- The column existed for owner-side auto-notification of best-matching
-- contributors: publish a Request, find contributors, notify them. That feature
-- is out of scope and will not be built — matching is pull-only, and the
-- owner-facing matching UI was removed on 2026-08-14.
--
-- The column is dropped rather than left unused because a boolean named
-- `notification_sent` sitting next to a match row is an invitation to wire up
-- the `match_found` notification on sight. Removing it makes the absence of the
-- feature visible in the schema instead of depending on someone reading a
-- decision log first.
--
-- No data is lost that anything reads: nothing in the backend has ever written
-- or read this column.

-- AlterTable
ALTER TABLE "AiMatchResult" DROP COLUMN "notification_sent";

-- Matching reads results back for one contributor, newest first. Without this
-- the read is a sequential scan over every match ever computed.
-- CreateIndex
CREATE INDEX "AiMatchResult_contributor_id_created_at_idx" ON "AiMatchResult"("contributor_id", "created_at" DESC);

-- One persisted result per (Request, contributor, computation). Recomputing a
-- shortlist replaces the previous rows for that contributor rather than
-- accumulating duplicates, and the uniqueness that makes that safe is enforced
-- here rather than by the writer remembering to delete first.
-- CreateIndex
CREATE UNIQUE INDEX "AiMatchResult_contribution_request_id_contributor_id_key" ON "AiMatchResult"("contribution_request_id", "contributor_id");
