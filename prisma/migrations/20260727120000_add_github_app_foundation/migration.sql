-- Additive GitHub App repository-evidence foundation. Legacy OAuth credentials
-- remain intact until the separately audited cutover operation.
CREATE TYPE "GitHubAppAccountType" AS ENUM ('user', 'organization');
CREATE TYPE "GitHubAppRepositorySelection" AS ENUM ('selected', 'all');
CREATE TYPE "GitHubAppInstallationStatus" AS ENUM ('active', 'suspended', 'deleted', 'verification_failed');
CREATE TYPE "GitHubAppInstallationLinkStatus" AS ENUM ('active', 'disconnected', 'reauthorization_required', 'revoked');
CREATE TYPE "GitHubAppLinkFlowType" AS ENUM ('install_and_authorize', 'authorize_existing_installation');
CREATE TYPE "GitHubAppLinkStateStatus" AS ENUM ('issued', 'callback_processed', 'completed', 'expired', 'rejected');
CREATE TYPE "GitHubWebhookDeliveryStatus" AS ENUM ('received', 'processed', 'failed', 'ignored');

CREATE TABLE "GitHubAppInstallation" (
  "id" UUID NOT NULL,
  "installation_id" VARCHAR(50) NOT NULL,
  "account_id" VARCHAR(50) NOT NULL,
  "account_login" VARCHAR(100) NOT NULL,
  "account_type" "GitHubAppAccountType" NOT NULL,
  "repository_selection" "GitHubAppRepositorySelection" NOT NULL,
  "permissions" JSONB NOT NULL,
  "status" "GitHubAppInstallationStatus" NOT NULL DEFAULT 'verification_failed',
  "installed_at" TIMESTAMP(3) NOT NULL,
  "last_verified_at" TIMESTAMP(3),
  "suspended_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubAppInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubAppInstallationLink" (
  "id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "github_user_id" VARCHAR(50) NOT NULL,
  "github_login" VARCHAR(100) NOT NULL,
  "encrypted_user_token" TEXT,
  "user_token_expires_at" TIMESTAMP(3),
  "encrypted_refresh_token" TEXT,
  "refresh_token_expires_at" TIMESTAMP(3),
  "status" "GitHubAppInstallationLinkStatus" NOT NULL DEFAULT 'active',
  "last_verified_at" TIMESTAMP(3),
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnected_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubAppInstallationLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubAppRepository" (
  "id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "github_repository_id" VARCHAR(50) NOT NULL,
  "full_name" VARCHAR(255) NOT NULL,
  "visibility" VARCHAR(20) NOT NULL,
  "default_branch" VARCHAR(255),
  "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_verified_at" TIMESTAMP(3) NOT NULL,
  "removed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubAppRepository_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubAppLinkState" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "flow_type" "GitHubAppLinkFlowType" NOT NULL,
  "target_installation_id" UUID,
  "state_hash" VARCHAR(128) NOT NULL,
  "status" "GitHubAppLinkStateStatus" NOT NULL DEFAULT 'issued',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "callback_consumed_at" TIMESTAMP(3),
  "completion_consumed_at" TIMESTAMP(3),
  "verified_github_user_id" VARCHAR(50),
  "verified_github_login" VARCHAR(100),
  "accessible_installation_candidates" JSONB,
  "encrypted_pending_user_token" TEXT,
  "pending_user_token_expires_at" TIMESTAMP(3),
  "encrypted_pending_refresh_token" TEXT,
  "pending_refresh_token_expires_at" TIMESTAMP(3),
  "failure_code" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubAppLinkState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubWebhookDelivery" (
  "id" UUID NOT NULL,
  "delivery_id" VARCHAR(100) NOT NULL,
  "event" VARCHAR(100) NOT NULL,
  "action" VARCHAR(100),
  "provider_installation_id" VARCHAR(50),
  "status" "GitHubWebhookDeliveryStatus" NOT NULL DEFAULT 'received',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "safe_error_code" VARCHAR(100),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "GitHubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubEvidenceCutover" (
  "id" VARCHAR(50) NOT NULL DEFAULT 'github-evidence',
  "cutover_at" TIMESTAMP(3),
  "executed_by" VARCHAR(100),
  "legacy_credentials_purged_at" TIMESTAMP(3),
  "provider_revocation_succeeded_count" INTEGER NOT NULL DEFAULT 0,
  "provider_revocation_failed_count" INTEGER NOT NULL DEFAULT 0,
  "legacy_evidence_cleanup_due_at" TIMESTAMP(3),
  "legacy_evidence_cleaned_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubEvidenceCutover_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SkillProfileGeneration"
  ADD COLUMN "github_app_installation_link_id" UUID,
  ADD COLUMN "provider_installation_id" VARCHAR(50),
  ADD COLUMN "consent_version" VARCHAR(100),
  ADD COLUMN "consented_at" TIMESTAMP(3),
  ADD COLUMN "authorization_verified_at" TIMESTAMP(3),
  ADD COLUMN "authorization_failure_code" VARCHAR(100),
  ADD COLUMN "retry_of_generation_id" UUID;

CREATE UNIQUE INDEX "GitHubAppInstallation_installation_id_key" ON "GitHubAppInstallation"("installation_id");
CREATE INDEX "GitHubAppInstallation_account_id_idx" ON "GitHubAppInstallation"("account_id");
CREATE INDEX "GitHubAppInstallation_status_idx" ON "GitHubAppInstallation"("status");
CREATE UNIQUE INDEX "GitHubAppInstallationLink_installation_id_user_id_key" ON "GitHubAppInstallationLink"("installation_id", "user_id");
CREATE INDEX "GitHubAppInstallationLink_user_id_status_idx" ON "GitHubAppInstallationLink"("user_id", "status");
CREATE INDEX "GitHubAppInstallationLink_github_user_id_idx" ON "GitHubAppInstallationLink"("github_user_id");
CREATE UNIQUE INDEX "GitHubAppRepository_installation_id_github_repository_id_key" ON "GitHubAppRepository"("installation_id", "github_repository_id");
CREATE INDEX "GitHubAppRepository_installation_id_removed_at_idx" ON "GitHubAppRepository"("installation_id", "removed_at");
CREATE UNIQUE INDEX "GitHubAppLinkState_state_hash_key" ON "GitHubAppLinkState"("state_hash");
CREATE INDEX "GitHubAppLinkState_user_id_status_idx" ON "GitHubAppLinkState"("user_id", "status");
CREATE INDEX "GitHubAppLinkState_expires_at_idx" ON "GitHubAppLinkState"("expires_at");
CREATE UNIQUE INDEX "GitHubWebhookDelivery_delivery_id_key" ON "GitHubWebhookDelivery"("delivery_id");
CREATE INDEX "GitHubWebhookDelivery_provider_installation_id_idx" ON "GitHubWebhookDelivery"("provider_installation_id");
CREATE INDEX "GitHubWebhookDelivery_status_idx" ON "GitHubWebhookDelivery"("status");
CREATE INDEX "SkillProfileGeneration_github_app_installation_link_id_idx" ON "SkillProfileGeneration"("github_app_installation_link_id");
CREATE INDEX "SkillProfileGeneration_retry_of_generation_id_idx" ON "SkillProfileGeneration"("retry_of_generation_id");

ALTER TABLE "GitHubAppInstallationLink" ADD CONSTRAINT "GitHubAppInstallationLink_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "GitHubAppInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GitHubAppInstallationLink" ADD CONSTRAINT "GitHubAppInstallationLink_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitHubAppRepository" ADD CONSTRAINT "GitHubAppRepository_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "GitHubAppInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitHubAppLinkState" ADD CONSTRAINT "GitHubAppLinkState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitHubAppLinkState" ADD CONSTRAINT "GitHubAppLinkState_target_installation_id_fkey" FOREIGN KEY ("target_installation_id") REFERENCES "GitHubAppInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SkillProfileGeneration" ADD CONSTRAINT "SkillProfileGeneration_github_app_installation_link_id_fkey" FOREIGN KEY ("github_app_installation_link_id") REFERENCES "GitHubAppInstallationLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SkillProfileGeneration" ADD CONSTRAINT "SkillProfileGeneration_retry_of_generation_id_fkey" FOREIGN KEY ("retry_of_generation_id") REFERENCES "SkillProfileGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
