-- CreateEnum
CREATE TYPE "MaterialVisibility" AS ENUM ('public', 'restricted_project', 'assignment');

-- CreateEnum
CREATE TYPE "MaterialScanStatus" AS ENUM ('quarantined', 'scanning', 'ready', 'rejected');

-- CreateEnum
CREATE TYPE "MaterialAuditAction" AS ENUM ('uploaded', 'scan_started', 'scan_cleared', 'scan_rejected', 'scan_abandoned', 'visibility_changed', 'grant_added', 'grant_revoked', 'deleted', 'purged');

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "contribution_request_id" UUID,
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "visibility" "MaterialVisibility" NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialVersion" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "scan_status" "MaterialScanStatus" NOT NULL DEFAULT 'quarantined',
    "scan_error_code" VARCHAR(100),
    "scanned_at" TIMESTAMP(3),
    "uploaded_by" UUID NOT NULL,
    "purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialGrant" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,

    CONSTRAINT "MaterialGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialAudit" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "material_version" INTEGER,
    "actor_id" UUID,
    "action" "MaterialAuditAction" NOT NULL,
    "from_status" "MaterialScanStatus",
    "to_status" "MaterialScanStatus",
    "idempotency_key" VARCHAR(128),
    "command_fingerprint" CHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_project_id_deleted_at_idx" ON "Material"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "Material_contribution_request_id_deleted_at_idx" ON "Material"("contribution_request_id", "deleted_at");

-- CreateIndex
CREATE INDEX "Material_owner_id_idx" ON "Material"("owner_id");

-- CreateIndex
CREATE INDEX "MaterialVersion_scan_status_updated_at_idx" ON "MaterialVersion"("scan_status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialVersion_material_id_version_key" ON "MaterialVersion"("material_id", "version");

-- CreateIndex
CREATE INDEX "MaterialGrant_material_id_grantee_id_revoked_at_idx" ON "MaterialGrant"("material_id", "grantee_id", "revoked_at");

-- CreateIndex
CREATE INDEX "MaterialGrant_grantee_id_revoked_at_idx" ON "MaterialGrant"("grantee_id", "revoked_at");

-- CreateIndex
CREATE INDEX "MaterialAudit_material_id_created_at_idx" ON "MaterialAudit"("material_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialAudit_actor_id_action_idempotency_key_key" ON "MaterialAudit"("actor_id", "action", "idempotency_key");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_contribution_request_id_fkey" FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialVersion" ADD CONSTRAINT "MaterialVersion_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialVersion" ADD CONSTRAINT "MaterialVersion_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialGrant" ADD CONSTRAINT "MaterialGrant_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialGrant" ADD CONSTRAINT "MaterialGrant_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialGrant" ADD CONSTRAINT "MaterialGrant_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialAudit" ADD CONSTRAINT "MaterialAudit_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialAudit" ADD CONSTRAINT "MaterialAudit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A Material belongs to exactly one scope. Prisma cannot express this, and
-- without it a row could be attached to both a Project and a Contribution
-- Request, or to neither, leaving visibility resolution undefined.
ALTER TABLE "Material"
  ADD CONSTRAINT "Material_exactly_one_scope"
  CHECK (num_nonnulls("project_id", "contribution_request_id") = 1);
