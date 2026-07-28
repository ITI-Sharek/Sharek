import { envValidationSchema } from './env.validation';

const validEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://sharek:sharek@localhost:5432/sharek',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'access-secret-at-least-16',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-16',
};

describe('environment validation', () => {
  it('supplies bounded GitHub provider defaults', () => {
    const result = envValidationSchema.validate(validEnvironment);

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      GITHUB_API_URL: 'https://api.github.com',
      GITHUB_API_OVERALL_TIMEOUT_MS: 8000,
      GITHUB_API_REQUEST_TIMEOUT_MS: 4000,
    });
  });

  it('rejects request timeouts above the overall provider budget', () => {
    const result = envValidationSchema.validate({
      ...validEnvironment,
      GITHUB_API_OVERALL_TIMEOUT_MS: 1000,
      GITHUB_API_REQUEST_TIMEOUT_MS: 1001,
    });

    expect(result.error).toBeDefined();
  });

  it('rejects insecure GitHub API URLs in production', () => {
    const result = envValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      GITHUB_API_URL: 'http://github.invalid',
      AI_SERVICE_AUTH_TOKEN: 'a'.repeat(32),
    });

    expect(result.error).toBeDefined();
  });
});
