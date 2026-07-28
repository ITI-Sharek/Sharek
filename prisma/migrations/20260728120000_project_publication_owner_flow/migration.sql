-- Expand the Project table for the explicit owner-controlled publication flow.
-- This migration performs no provider or other network access.
ALTER TABLE "Project"
  ADD COLUMN "slug" VARCHAR(80),
  ADD COLUMN "slug_normalized" VARCHAR(80),
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "manual_overrides" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "source_visibility" VARCHAR(20),
  ADD COLUMN "source_owner_id" VARCHAR(50),
  ADD COLUMN "source_owner_type" VARCHAR(20),
  ADD COLUMN "source_default_branch" VARCHAR(255),
  ADD COLUMN "source_updated_at" TIMESTAMP(3),
  ADD COLUMN "source_fetched_at" TIMESTAMP(3),
  ADD COLUMN "archived_at" TIMESTAMP(3);

UPDATE "Project"
SET
  "slug" = LEFT(
    COALESCE(
      NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("title"), '[^a-z0-9]+', '-', 'g')), ''),
      'project'
    ),
    47
  ) || '-' || REPLACE("id"::text, '-', ''),
  "slug_normalized" = LEFT(
    COALESCE(
      NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("title"), '[^a-z0-9]+', '-', 'g')), ''),
      'project'
    ),
    47
  ) || '-' || REPLACE("id"::text, '-', ''),
  "manual_overrides" = '["title","description","tags","technologies"]'::jsonb,
  "source_visibility" = 'public',
  "source_fetched_at" = "updated_at",
  "archived_at" = CASE WHEN "status" = 'archived' THEN "updated_at" ELSE NULL END;

ALTER TABLE "Project"
  ALTER COLUMN "slug" SET NOT NULL,
  ALTER COLUMN "slug_normalized" SET NOT NULL;

DROP INDEX IF EXISTS "Project_github_repo_url_key";
CREATE UNIQUE INDEX "projects_slug_normalized_unique" ON "Project"("slug_normalized");
CREATE INDEX "Project_github_repo_url_idx" ON "Project"("github_repo_url");
CREATE INDEX "Project_github_repo_id_status_idx" ON "Project"("github_repo_id", "status");
CREATE UNIQUE INDEX "Project_one_published_repository_idx"
  ON "Project"("github_repo_id")
  WHERE "status" = 'published' AND "github_repo_id" IS NOT NULL;

CREATE TABLE "ProjectOperation" (
  "id" UUID NOT NULL,
  "project_id" UUID,
  "actor_id" UUID NOT NULL,
  "operation" VARCHAR(40) NOT NULL,
  "key_hash" VARCHAR(64) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "response" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectOperation_actor_id_operation_key_hash_key"
  ON "ProjectOperation"("actor_id", "operation", "key_hash");
CREATE INDEX "ProjectOperation_created_at_idx" ON "ProjectOperation"("created_at");

CREATE TABLE "ProjectStateTransition" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "from_status" "ProjectStatus" NOT NULL,
  "to_status" "ProjectStatus" NOT NULL,
  "validation_outcome" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectStateTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectStateTransition_project_id_created_at_idx"
  ON "ProjectStateTransition"("project_id", "created_at");
CREATE INDEX "ProjectStateTransition_actor_id_idx" ON "ProjectStateTransition"("actor_id");

ALTER TABLE "ProjectOperation"
  ADD CONSTRAINT "ProjectOperation_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStateTransition"
  ADD CONSTRAINT "ProjectStateTransition_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
