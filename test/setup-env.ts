process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '4000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://sharek:sharek@localhost:5432/sharek?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.SKILL_PROFILE_QUEUE_ENABLED =
  process.env.SKILL_PROFILE_QUEUE_ENABLED ?? 'false';
process.env.APPLICATION_REVIEW_QUEUE_ENABLED =
  process.env.APPLICATION_REVIEW_QUEUE_ENABLED ?? 'false';
// Disabled so no spec opens a Redis socket. Note the Advisory Fit queue throws
// on enqueue when disabled, so any future e2e that boots the real
// AdvisoryFitAssessmentService rather than a mock will need to account for it.
process.env.ADVISORY_FIT_QUEUE_ENABLED =
  process.env.ADVISORY_FIT_QUEUE_ENABLED ?? 'false';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-change-me';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-change-me';
// The GitHub settings use `||`, not `??`, on purpose. `.env.example` ships
// GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET as empty strings, and @nestjs/config
// lets process.env win over the env file, so a developer who follows the
// documented `cp .env.example .env` ends up with '' here. An empty string is
// not nullish, so `??` would preserve it and the OAuth config check would fail.
// Empty is never a valid value for any of these.
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
process.env.GITHUB_CLIENT_ID =
  process.env.GITHUB_CLIENT_ID || 'test-github-client-id';
process.env.GITHUB_CLIENT_SECRET =
  process.env.GITHUB_CLIENT_SECRET || 'test-github-client-secret';
process.env.GITHUB_OAUTH_CALLBACK_URL =
  process.env.GITHUB_OAUTH_CALLBACK_URL ||
  'http://localhost:4000/auth/github/callback/repository';
process.env.GITHUB_AUTH_CALLBACK_URL =
  process.env.GITHUB_AUTH_CALLBACK_URL ||
  'http://localhost:4000/auth/github/callback';
process.env.GITHUB_TOKEN_ENCRYPTION_KEY =
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY ||
  'test-github-token-encryption-key-32-chars-min';
process.env.AI_SERVICE_URL =
  process.env.AI_SERVICE_URL ?? 'http://localhost:8010';
process.env.AI_SERVICE_TIMEOUT_MS =
  process.env.AI_SERVICE_TIMEOUT_MS ?? '60000';
process.env.AI_SERVICE_AUTH_TOKEN = process.env.AI_SERVICE_AUTH_TOKEN ?? '';
process.env.AI_LOW_CONFIDENCE_THRESHOLD =
  process.env.AI_LOW_CONFIDENCE_THRESHOLD ?? '0.70';
