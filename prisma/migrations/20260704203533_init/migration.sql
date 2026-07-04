-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'contributor', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'suspended', 'deactivated');

-- CreateEnum
CREATE TYPE "LanguageCode" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "SubscriptionPlanType" AS ENUM ('bronze', 'silver', 'gold');

-- CreateEnum
CREATE TYPE "SubscriptionUserRoleContext" AS ENUM ('owner', 'contributor');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('web', 'mobile', 'ai_ml', 'devops', 'tools_utilities');

-- CreateEnum
CREATE TYPE "ProjectDifficulty" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ContributionRequestDifficulty" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "ContributionRequestStatus" AS ENUM ('draft', 'published', 'assigned', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending_validation', 'eligible', 'ineligible', 'accepted', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('submitted', 'under_review', 'approved', 'rejected', 'revision_requested');

-- CreateEnum
CREATE TYPE "DeliveryReviewOutcome" AS ENUM ('approved', 'rejected', 'revision_requested');

-- CreateEnum
CREATE TYPE "DisputeType" AS ENUM ('skill_assessment', 'validation_decision');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'under_review', 'upheld', 'overturned', 'dismissed');

-- CreateEnum
CREATE TYPE "GitHubAccountIngestionStatus" AS ENUM ('pending', 'in_progress', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('application_status', 'skill_review', 'delivery_update', 'match_found', 'task_recommendation', 'plan_limit', 'system');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('fraud', 'misuse', 'reputation_manipulation', 'inaccurate_ai', 'harassment', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'investigating', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "AiTraceAgentType" AS ENUM ('skill_profiling', 'skill_validation', 'skill_gap_guidance', 'contributor_matching');

-- CreateEnum
CREATE TYPE "AiTraceTriggerEntityType" AS ENUM ('user', 'application', 'contribution_request');

-- CreateEnum
CREATE TYPE "AiTraceStatus" AS ENUM ('success', 'partial', 'failure');

-- CreateEnum
CREATE TYPE "AiValidationDecision" AS ENUM ('eligible', 'ineligible', 'review_needed');

-- CreateEnum
CREATE TYPE "SkillProfileStatus" AS ENUM ('pending', 'approved', 'rejected', 'disputed');

-- CreateEnum
CREATE TYPE "SkillProfileProficiencyLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "ReportedContentType" AS ENUM ('user', 'project', 'contribution_request', 'application', 'delivery', 'skill_profile');

-- CreateEnum
CREATE TYPE "UserActionType" AS ENUM ('order_created', 'application_submitted');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "avatar_url" VARCHAR(500),
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "preferred_language" "LanguageCode" NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_type" "SubscriptionPlanType" NOT NULL,
    "user_role_context" "SubscriptionUserRoleContext" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "github_repo_url" VARCHAR(500) NOT NULL,
    "github_repo_id" VARCHAR(50),
    "languages" JSONB,
    "tags" JSONB,
    "technologies" JSONB,
    "repo_statistics" JSONB,
    "category" "ProjectCategory",
    "difficulty" "ProjectDifficulty",
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "readme_content" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionRequest" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "required_technologies" JSONB NOT NULL,
    "difficulty" "ContributionRequestDifficulty" NOT NULL,
    "deadline" DATE,
    "reward" DECIMAL(10,2),
    "reward_currency" VARCHAR(3),
    "status" "ContributionRequestStatus" NOT NULL DEFAULT 'draft',
    "max_applicants" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "contribution_request_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "cover_message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending_validation',
    "is_priority" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "validated_at" TIMESTAMP(3),
    "owner_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiValidationResult" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "decision" "AiValidationDecision" NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "justification" TEXT NOT NULL,
    "matched_skills" JSONB,
    "missing_skills" JSONB,
    "source_attribution" JSONB,
    "model_used" VARCHAR(50),
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMatchResult" (
    "id" UUID NOT NULL,
    "contribution_request_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "match_score" DOUBLE PRECISION NOT NULL,
    "justification" TEXT,
    "matched_skills" JSONB,
    "reputation_signals" JSONB,
    "source_attribution" JSONB,
    "rank" INTEGER NOT NULL,
    "model_used" VARCHAR(50),
    "notification_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTraceLog" (
    "id" UUID NOT NULL,
    "agent_type" "AiTraceAgentType" NOT NULL,
    "trigger_entity_id" UUID NOT NULL,
    "trigger_entity_type" "AiTraceTriggerEntityType" NOT NULL,
    "input_payload" JSONB,
    "output_payload" JSONB,
    "confidence_score" DOUBLE PRECISION,
    "model_used" VARCHAR(50),
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "latency_ms" INTEGER,
    "status" "AiTraceStatus" NOT NULL,
    "error_message" TEXT,
    "retrieved_sources" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTraceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "contribution_request_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "pr_url" VARCHAR(500) NOT NULL,
    "contributor_notes" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'submitted',
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryReview" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT,
    "outcome" "DeliveryReviewOutcome" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "skill_profile_id" UUID,
    "ai_validation_result_id" UUID,
    "type" "DisputeType" NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubAccount" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "github_id" VARCHAR(50) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "access_token" VARCHAR(500) NOT NULL,
    "refresh_token" VARCHAR(500),
    "avatar_url" VARCHAR(500),
    "profile_url" VARCHAR(500),
    "raw_profile_data" JSONB,
    "ingestion_status" "GitHubAccountIngestionStatus" NOT NULL DEFAULT 'pending',
    "token_expires_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "GitHubAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reported_user_id" UUID,
    "reported_content_id" UUID,
    "reported_content_type" "ReportedContentType",
    "reason" "ReportReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationRecord" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "overall_rating" DOUBLE PRECISION,
    "total_contributions" INTEGER NOT NULL DEFAULT 0,
    "successful_contributions" INTEGER NOT NULL DEFAULT 0,
    "success_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "top_verified_skills" JSONB,
    "total_ratings_received" INTEGER NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillGapGuidance" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "contribution_request_id" UUID NOT NULL,
    "missing_skills" JSONB NOT NULL,
    "recommended_technologies" JSONB,
    "learning_resources" JSONB,
    "practice_projects" JSONB,
    "estimated_improvement_time" VARCHAR(50),
    "guidance_narrative" TEXT,
    "source_attribution" JSONB,
    "model_used" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillGapGuidance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillProfile" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "skill_name" VARCHAR(100) NOT NULL,
    "proficiency_level" "SkillProfileProficiencyLevel" NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "evidence_summary" TEXT,
    "evidence_sources" JSONB,
    "status" "SkillProfileStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "admin_notes" TEXT,
    "original_proficiency" "SkillProfileProficiencyLevel",
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageTracker" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action_type" "UserActionType" NOT NULL,
    "period_date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Subscription_user_id_idx" ON "Subscription"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_github_repo_url_key" ON "Project"("github_repo_url");

-- CreateIndex
CREATE UNIQUE INDEX "AiValidationResult_application_id_key" ON "AiValidationResult"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_application_id_key" ON "Delivery"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReview_delivery_id_key" ON "DeliveryReview"("delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_ai_validation_result_id_key" ON "Dispute"("ai_validation_result_id");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubAccount_user_id_key" ON "GitHubAccount"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubAccount_github_id_key" ON "GitHubAccount"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationRecord_user_id_key" ON "ReputationRecord"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "SkillGapGuidance_application_id_key" ON "SkillGapGuidance"("application_id");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_contribution_request_id_fkey" FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiValidationResult" ADD CONSTRAINT "AiValidationResult_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMatchResult" ADD CONSTRAINT "AiMatchResult_contribution_request_id_fkey" FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMatchResult" ADD CONSTRAINT "AiMatchResult_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_contribution_request_id_fkey" FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReview" ADD CONSTRAINT "DeliveryReview_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReview" ADD CONSTRAINT "DeliveryReview_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_skill_profile_id_fkey" FOREIGN KEY ("skill_profile_id") REFERENCES "SkillProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_ai_validation_result_id_fkey" FOREIGN KEY ("ai_validation_result_id") REFERENCES "AiValidationResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubAccount" ADD CONSTRAINT "GitHubAccount_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationRecord" ADD CONSTRAINT "ReputationRecord_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillGapGuidance" ADD CONSTRAINT "SkillGapGuidance_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillGapGuidance" ADD CONSTRAINT "SkillGapGuidance_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillGapGuidance" ADD CONSTRAINT "SkillGapGuidance_contribution_request_id_fkey" FOREIGN KEY ("contribution_request_id") REFERENCES "ContributionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillProfile" ADD CONSTRAINT "SkillProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillProfile" ADD CONSTRAINT "SkillProfile_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageTracker" ADD CONSTRAINT "UsageTracker_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
