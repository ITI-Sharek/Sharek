-- Legacy broad repository OAuth credentials become nullable so the audited
-- runtime cutover can purge them without deleting identity or reviewed skills.
ALTER TABLE "GitHubAccount"
  ALTER COLUMN "access_token" DROP NOT NULL;
