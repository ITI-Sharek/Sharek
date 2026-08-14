import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  REALTIME_NOTIFICATIONS_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  NOTIFICATION_EVENT_RECOVERY_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(86_400_000)
    .default(60_000),
  NOTIFICATION_EVENT_RECOVERY_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(1_000)
    .default(100),
  NOTIFICATION_EVENT_MAX_PUBLISH_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(5),
  NOTIFICATION_RETENTION_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  NOTIFICATION_RETENTION_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(86_400_000)
    .default(60_000),
  NOTIFICATION_RETENTION_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(1_000)
    .default(100),
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
  DELIVERY_REPUTATION_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false'),
  DELIVERY_REPUTATION_SWEEP_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(86_400_000)
    .default(60_000),
  ADVISORY_FIT_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  ADVISORY_FIT_REAP_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(86_400_000)
    .default(60_000),
  ADVISORY_FIT_STALE_AFTER_MS: Joi.number()
    .integer()
    .min(60_000)
    .max(86_400_000)
    .default(600_000),
  MATERIAL_STORAGE_ROOT: Joi.string().default('./.material-storage'),
  MATERIAL_MAX_BYTES: Joi.number()
    .integer()
    .min(1_024)
    .max(104_857_600)
    .default(26_214_400),
  MATERIAL_ALLOWED_MIME_TYPES: Joi.string().default(
    'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain',
  ),
  MATERIAL_SCAN_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  MATERIAL_SCAN_REAP_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(86_400_000)
    .default(60_000),
  MATERIAL_SCAN_STALE_AFTER_MS: Joi.number()
    .integer()
    .min(60_000)
    .max(86_400_000)
    .default(600_000),
  MATERIAL_SCAN_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3),
  // The stub stands in for a real scanner. `content` reports the EICAR test
  // file as infected and everything else as clean; the other three force a
  // verdict so an operator can reproduce one on demand.
  MATERIAL_SCANNER_STUB_MODE: Joi.string()
    .valid('content', 'clean', 'infected', 'error')
    .default('content'),
  // Its own secret, never the access-token one. Sharing would make a download
  // link and a session token interchangeable inputs to the same verifier, and
  // the download link is deliberately the far weaker of the two.
  MATERIAL_DOWNLOAD_TOKEN_SECRET: Joi.string().min(32).required(),
  // Minutes, not hours. The link is re-authorized at redemption, so this bounds
  // how long a *leaked* link stays useful, not how long access lasts.
  MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(30)
    .max(3_600)
    .default(300),
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
  // FastAPI allows up to 60 seconds for the provider call; leave network
  // overhead before NestJS converts a slow but valid response into UNAVAILABLE.
  AI_ADVISORY_FIT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(120_000)
    .default(75_000),
  AI_SKILL_GAP_GUIDANCE_PATH: Joi.string()
    .pattern(/^\/[a-zA-Z0-9/_-]+$/)
    .default('/skill-gap-guidance/generate'),
  AI_SKILL_GAP_GUIDANCE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(120_000)
    .default(75_000),
  AI_MATERIAL_ANALYSIS_PATH: Joi.string()
    .pattern(/^\/[a-zA-Z0-9/_-]+$/)
    .default('/material-analysis/analyze'),
  AI_MATERIAL_ANALYSIS_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(180_000)
    .default(135_000),
  MATERIAL_ANALYSIS_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  MATERIAL_ANALYSIS_REQUIRE_SUBSCRIPTION: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  MATERIAL_ANALYSIS_MIN_PLAN: Joi.string()
    .valid('free', 'gold')
    .default('gold'),
  MATERIAL_ANALYSIS_MAX_DOCUMENTS: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(5),
  MATERIAL_ANALYSIS_MAX_EXTRACTED_CHARACTERS: Joi.number()
    .integer()
    .min(1)
    .max(1_000_000)
    .default(250_000),
  PROPOSAL_ELIGIBILITY_GATE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  REQUIREMENT_INFERENCE_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  AI_REQUIREMENT_INFERENCE_PATH: Joi.string().default('/requirements/infer'),
  AI_REQUIREMENT_INFERENCE_TIMEOUT_MS: Joi.number().integer().min(1000).default(60000),
  MATERIAL_ANALYSIS_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  MATERIAL_ANALYSIS_REAP_INTERVAL_MS: Joi.number()
    .integer()
    .min(1_000)
    .default(60_000),
  MATERIAL_ANALYSIS_STALE_AFTER_MS: Joi.number()
    .integer()
    .min(10_000)
    .default(600_000),
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
  // A request can legitimately sit in `requested` for BullMQ's three attempts
  // times the provider timeout plus backoff. Reaping sooner than that would
  // abandon live work and discard a result the provider was about to return.
  // Production-only so local race proofs can compress both values.
  if (
    value.NODE_ENV === 'production' &&
    value.ADVISORY_FIT_STALE_AFTER_MS < 4 * value.AI_ADVISORY_FIT_TIMEOUT_MS
  ) {
    return helpers.error('any.invalid', {
      message:
        'ADVISORY_FIT_STALE_AFTER_MS must be at least four times AI_ADVISORY_FIT_TIMEOUT_MS',
    });
  }
  return value;
});
