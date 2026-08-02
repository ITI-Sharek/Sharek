import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  SKILL_PROFILE_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  SKILL_PROFILE_QUEUE_CONCURRENCY: Joi.number().integer().min(1).max(10).default(2),
  APPLICATION_REVIEW_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  APPLICATION_REVIEW_SWEEP_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(86_400_000)
    .default(60_000),
  APPLICATION_REVIEW_SWEEP_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(1_000)
    .default(100),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000,http://localhost:3001'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  GITHUB_CLIENT_ID: Joi.string().allow('').optional(),
  GITHUB_API_URL: Joi.string()
    .uri()
    .default('https://api.github.com')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().uri({ scheme: ['https'] }),
    }),
  GITHUB_API_OVERALL_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1)
    .max(8000)
    .default(8000),
  GITHUB_API_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1)
    .default(4000),
  GITHUB_CLIENT_SECRET: Joi.string().allow('').optional(),
  GITHUB_OAUTH_CALLBACK_URL: Joi.string().uri().allow('').optional(),
  GITHUB_AUTH_CALLBACK_URL: Joi.string().uri().allow('').optional(),
  GITHUB_TOKEN_ENCRYPTION_KEY: Joi.string().min(32).allow('').optional(),
  GITHUB_APP_ID: Joi.string().pattern(/^\d+$/).allow('').optional(),
  GITHUB_APP_CLIENT_ID: Joi.string().allow('').optional(),
  GITHUB_APP_CLIENT_SECRET: Joi.string().allow('').optional(),
  GITHUB_APP_PRIVATE_KEY_BASE64: Joi.string().base64().allow('').optional(),
  GITHUB_APP_WEBHOOK_SECRET: Joi.string().min(32).allow('').optional(),
  GITHUB_APP_WEBHOOK_PROXY_URL: Joi.string().uri().allow('').optional(),
  // Existing environments may store either the bare app slug or its public
  // GitHub Apps URL. Runtime code treats this as display/management metadata.
  GITHUB_APP_SLUG: Joi.string().allow('').optional(),
  GITHUB_APP_INSTALLATION_URL: Joi.string().uri().allow('').optional(),
  GITHUB_APP_CALLBACK_URL: Joi.string().uri().allow('').optional(),
  GITHUB_APP_FRONTEND_RETURN_URL: Joi.string().uri().allow('').optional(),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  EMAIL_FROM: Joi.string().allow('').optional(),
  AI_SERVICE_URL: Joi.string().uri().default('http://localhost:8010'),
  AI_SERVICE_TIMEOUT_MS: Joi.number().integer().min(100).default(60000),
  AI_ADVISORY_FIT_PATH: Joi.string().pattern(/^\/[a-zA-Z0-9/_-]+$/).default('/advisory-fit/assess'),
  AI_ADVISORY_FIT_TIMEOUT_MS: Joi.number().integer().min(100).default(10000),
  AI_SERVICE_AUTH_TOKEN: Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
  AI_LOW_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.7),
}).custom((value, helpers) => {
  if (
    value.GITHUB_API_REQUEST_TIMEOUT_MS > value.GITHUB_API_OVERALL_TIMEOUT_MS
  ) {
    return helpers.error('any.invalid', {
      message:
        'GITHUB_API_REQUEST_TIMEOUT_MS must not exceed GITHUB_API_OVERALL_TIMEOUT_MS',
    });
  }
  return value;
});
