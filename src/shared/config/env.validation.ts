import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  GITHUB_CLIENT_ID: Joi.string().allow('').optional(),
  GITHUB_CLIENT_SECRET: Joi.string().allow('').optional(),
  GITHUB_OAUTH_CALLBACK_URL: Joi.string().uri().allow('').optional(),
  GITHUB_AUTH_CALLBACK_URL: Joi.string().uri().allow('').optional(),
  GITHUB_TOKEN_ENCRYPTION_KEY: Joi.string().min(32).allow('').optional(),
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_OAUTH_CALLBACK_URL: Joi.string().uri().allow('').optional(),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  EMAIL_FROM: Joi.string().allow('').optional(),
  AI_SERVICE_URL: Joi.string().uri().default('http://localhost:8000'),
  AI_SERVICE_TIMEOUT_MS: Joi.number().integer().min(100).default(5000),
  AI_SERVICE_AUTH_TOKEN: Joi.string().allow('').optional(),
  AI_LOW_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.7),
});
