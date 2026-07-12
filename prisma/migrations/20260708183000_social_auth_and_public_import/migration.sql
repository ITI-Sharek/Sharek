CREATE TYPE "AuthProvider" AS ENUM ('google', 'github');

ALTER TABLE "User" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TABLE "AuthProviderAccount" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_user_id" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(100),
    "avatar_url" VARCHAR(500),
    "profile_url" VARCHAR(500),
    "raw_profile_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "AuthProviderAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthOAuthState" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "provider" "AuthProvider" NOT NULL,
    "state_hash" VARCHAR(128) NOT NULL,
    "requested_role" "UserRole" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthProviderAccount_provider_provider_user_id_key" ON "AuthProviderAccount"("provider", "provider_user_id");
CREATE UNIQUE INDEX "AuthProviderAccount_provider_user_id_key" ON "AuthProviderAccount"("provider", "user_id");
CREATE INDEX "AuthProviderAccount_user_id_idx" ON "AuthProviderAccount"("user_id");

CREATE UNIQUE INDEX "AuthOAuthState_state_hash_key" ON "AuthOAuthState"("state_hash");
CREATE INDEX "AuthOAuthState_provider_idx" ON "AuthOAuthState"("provider");
CREATE INDEX "AuthOAuthState_requested_role_idx" ON "AuthOAuthState"("requested_role");

ALTER TABLE "AuthProviderAccount" ADD CONSTRAINT "AuthProviderAccount_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthOAuthState" ADD CONSTRAINT "AuthOAuthState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
