process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://sharek:sharek@localhost:5432/sharek?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-change-me';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-change-me';
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? 'mock';
process.env.AI_LOW_CONFIDENCE_THRESHOLD =
  process.env.AI_LOW_CONFIDENCE_THRESHOLD ?? '0.70';

