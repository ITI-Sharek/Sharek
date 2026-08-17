CREATE TABLE "SavedProject" (
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedProject_pkey" PRIMARY KEY ("user_id", "project_id")
);

CREATE INDEX "SavedProject_project_id_created_at_idx"
ON "SavedProject"("project_id", "created_at");

ALTER TABLE "SavedProject"
ADD CONSTRAINT "SavedProject_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedProject"
ADD CONSTRAINT "SavedProject_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
