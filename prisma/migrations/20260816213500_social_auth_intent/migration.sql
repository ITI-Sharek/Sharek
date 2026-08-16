-- Bind every social OAuth state to the initiating form. Existing, unconsumed
-- states retain the historical sign-in behavior; new states must always supply
-- the explicit intent through the public start endpoint.
CREATE TYPE "SocialAuthIntent" AS ENUM ('login', 'register');

ALTER TABLE "AuthOAuthState"
  ADD COLUMN "requested_intent" "SocialAuthIntent" NOT NULL DEFAULT 'login';

CREATE INDEX "AuthOAuthState_requested_intent_idx"
  ON "AuthOAuthState"("requested_intent");
