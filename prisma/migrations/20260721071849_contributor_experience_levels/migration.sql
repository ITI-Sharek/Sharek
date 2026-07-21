-- DropForeignKey
ALTER TABLE "AuthOAuthState" DROP CONSTRAINT "AuthOAuthState_user_id_fkey";

-- DropForeignKey
ALTER TABLE "AuthProviderAccount" DROP CONSTRAINT "AuthProviderAccount_user_id_fkey";

-- DropForeignKey
ALTER TABLE "AuthSession" DROP CONSTRAINT "AuthSession_user_id_fkey";

-- DropForeignKey
ALTER TABLE "GitHubOAuthState" DROP CONSTRAINT "GitHubOAuthState_user_id_fkey";

-- AddForeignKey
ALTER TABLE "AuthProviderAccount" ADD CONSTRAINT "AuthProviderAccount_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthOAuthState" ADD CONSTRAINT "AuthOAuthState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubOAuthState" ADD CONSTRAINT "GitHubOAuthState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
