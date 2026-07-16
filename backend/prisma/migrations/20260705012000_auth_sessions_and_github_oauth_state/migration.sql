-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token_hash" VARCHAR(128) NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubOAuthState" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "state_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_access_token_hash_key" ON "AuthSession"("access_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refresh_token_hash_key" ON "AuthSession"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "AuthSession_user_id_idx" ON "AuthSession"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubOAuthState_state_hash_key" ON "GitHubOAuthState"("state_hash");

-- CreateIndex
CREATE INDEX "GitHubOAuthState_user_id_idx" ON "GitHubOAuthState"("user_id");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubOAuthState" ADD CONSTRAINT "GitHubOAuthState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
