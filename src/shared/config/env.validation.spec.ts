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
      APPLICATION_REVIEW_QUEUE_ENABLED: true,
      APPLICATION_REVIEW_SWEEP_INTERVAL_MS: 60_000,
      APPLICATION_REVIEW_SWEEP_BATCH_SIZE: 100,
      AI_ADVISORY_FIT_TIMEOUT_MS: 75_000,
      ADVISORY_FIT_QUEUE_ENABLED: true,
      ADVISORY_FIT_REAP_INTERVAL_MS: 60_000,
      ADVISORY_FIT_STALE_AFTER_MS: 600_000,
      MATERIAL_MAX_BYTES: 26_214_400,
      MATERIAL_STORAGE_ROOT: './.material-storage',
    });
  });

  it('rejects unsafe Application review sweep controls', () => {
    expect(
      envValidationSchema.validate({
        ...validEnvironment,
        APPLICATION_REVIEW_SWEEP_INTERVAL_MS: 9_999,
      }).error,
    ).toBeDefined();
    expect(
      envValidationSchema.validate({
        ...validEnvironment,
        APPLICATION_REVIEW_SWEEP_BATCH_SIZE: 1_001,
      }).error,
    ).toBeDefined();
  });

  it('rejects an Advisory Fit stale threshold that would reap live work', () => {
    // Three BullMQ attempts against a 75s provider timeout means a request can
    // legitimately sit in `requested` for minutes; reaping sooner discards a
    // result the provider is still producing. Production-gated so local race
    // proofs can compress both numbers.
    const production = {
      ...validEnvironment,
      NODE_ENV: 'production',
      // Required in production; supplied so the assertions below fail on the
      // threshold rule rather than on a missing unrelated variable.
      AI_SERVICE_AUTH_TOKEN: 'production-ai-token-at-least-32-characters',
      AI_ADVISORY_FIT_TIMEOUT_MS: 75_000,
    };

    // The cross-field rules report a generic message, so the discriminating
    // assertion is the pair: this value is rejected while a longer one passes
    // with everything else held identical.
    expect(
      envValidationSchema.validate({
        ...production,
        ADVISORY_FIT_STALE_AFTER_MS: 120_000,
      }).error,
    ).toBeDefined();

    expect(
      envValidationSchema.validate({
        ...production,
        ADVISORY_FIT_STALE_AFTER_MS: 300_000,
      }).error,
    ).toBeUndefined();

    // Outside production the same value is allowed.
    expect(
      envValidationSchema.validate({
        ...validEnvironment,
        AI_ADVISORY_FIT_TIMEOUT_MS: 75_000,
        ADVISORY_FIT_STALE_AFTER_MS: 120_000,
      }).error,
    ).toBeUndefined();
  });

  it('rejects Material size limits outside the supported band', () => {
    // Supported formats and limits are configuration, not constants, so the
    // bounds are what stop a deployment accepting a 2GB upload by typo.
    expect(
      envValidationSchema.validate({ ...validEnvironment, MATERIAL_MAX_BYTES: 512 }).error,
    ).toBeDefined();
    expect(
      envValidationSchema.validate({ ...validEnvironment, MATERIAL_MAX_BYTES: 209_715_200 }).error,
    ).toBeDefined();
    expect(
      envValidationSchema.validate({ ...validEnvironment, MATERIAL_MAX_BYTES: 5_242_880 }).error,
    ).toBeUndefined();
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
