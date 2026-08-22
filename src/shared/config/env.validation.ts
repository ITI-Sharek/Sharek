import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  PAYMENTS_PAYMOB_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  PAYMOB_API_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://accept.paymob.com'),
  PAYMOB_INTENTION_PATH: Joi.string()
    .pattern(/^\/[a-zA-Z0-9/_-]+$/)
    .default('/v1/intention/'),
  PAYMOB_SECRET_KEY: Joi.string().trim().allow('').default(''),
  PAYMOB_PUBLIC_KEY: Joi.string().trim().allow('').default(''),
  PAYMOB_HMAC_SECRET: Joi.string().trim().allow('').default(''),
  PAYMOB_NOTIFICATION_URL: Joi.string().trim().allow('').default(''),
  PAYMOB_REDIRECTION_URL: Joi.string().trim().allow('').default(''),
  PAYMOB_EXPECTED_LIVE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  PAYMOB_INTEGRATION_IDS: Joi.string().allow('').default(''),
  PAYMOB_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(30_000)
    .default(10_000),
  REALTIME_NOTIFICATIONS_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
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
  // S3 chat attachments (Slice 3). Deliberately a separate blast radius from
  // Materials: `S3ObjectStorage` is bound only in `ChatAttachmentsModule`.
  CHAT_ATTACHMENTS_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  CHAT_ATTACHMENT_MAX_BYTES: Joi.number()
    .integer()
    .min(1_024)
    .max(104_857_600)
    .default(26_214_400),
  CHAT_ATTACHMENT_MAX_PER_MESSAGE: Joi.number().integer().min(1).max(20).default(5),
  CHAT_ATTACHMENT_ALLOWED_MIME_TYPES: Joi.string().default(
    'image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ),
  CHAT_ATTACHMENT_UPLOAD_INTENT_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86_400)
    .default(1_800),
  CHAT_ATTACHMENT_UPLOADS_PER_MINUTE: Joi.number()
    .integer()
    .min(1)
    .max(1_000)
    .default(20),
  CHAT_ATTACHMENT_SCAN_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  CHAT_ATTACHMENT_SCAN_REAP_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(86_400_000)
    .default(60_000),
  CHAT_ATTACHMENT_SCAN_STALE_AFTER_MS: Joi.number()
    .integer()
    .min(60_000)
    .max(86_400_000)
    .default(600_000),
  CHAT_ATTACHMENT_SCAN_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),
  CHAT_ATTACHMENT_SCANNER_STUB_MODE: Joi.string()
    .valid('content', 'clean', 'infected', 'error')
    .default('content'),
  CHAT_ATTACHMENT_EVENT_MAX_PUBLISH_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(5),
  CHAT_ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(10)
    .max(600)
    .default(60),
  CHAT_ATTACHMENT_RETENTION_MONTHS: Joi.number().integer().min(1).max(120).default(12),
  CHAT_ATTACHMENT_RETENTION_WARNING_DAYS: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .default(30),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_CHAT_ATTACHMENTS_BUCKET: Joi.string().trim().allow('').default(''),
  S3_CHAT_ATTACHMENTS_KEY_PREFIX: Joi.string().default('chat-attachments/'),
  // MinIO for local dev; empty means real AWS, resolved from region alone.
  S3_ENDPOINT: Joi.string().trim().allow('').default(''),
  // Browser-facing endpoint used only when signing direct download URLs. It
  // may differ from S3_ENDPOINT when the API runs inside Docker.
  S3_PUBLIC_ENDPOINT: Joi.string().trim().allow('').default(''),
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(false),
  // Empty in production is CORRECT: the SDK default provider chain
  // (env -> SSO -> IMDS/IRSA) applies instead of a static secret.
  S3_ACCESS_KEY_ID: Joi.string().trim().allow('').default(''),
  S3_SECRET_ACCESS_KEY: Joi.string().trim().allow('').default(''),
  // MinIO without a configured KMS rejects even the AWS-compatible AES256
  // request header. An explicit empty value disables the client-side header
  // for local S3-compatible storage; absent values still default to AES256.
  S3_SERVER_SIDE_ENCRYPTION: Joi.string()
    .trim()
    .valid('AES256', 'aws:kms')
    .allow('')
    .default('AES256'),
  S3_KMS_KEY_ID: Joi.string().trim().allow('').default(''),
  S3_REQUEST_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(15_000),
  // P2P WebRTC Assignment Calls (Slice 4, ADR 0016).
  ASSIGNMENT_CALLS_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  ASSIGNMENT_CALL_RING_TIMEOUT_MS: Joi.number()
    .integer()
    .min(5_000)
    .max(120_000)
    .default(30_000),
  ASSIGNMENT_CALL_RECONNECT_GRACE_MS: Joi.number()
    .integer()
    .min(5_000)
    .max(120_000)
    .default(30_000),
  ASSIGNMENT_CALL_MAX_DURATION_MS: Joi.number()
    .integer()
    .min(60_000)
    .max(14_400_000)
    .default(3_600_000),
  // Comma-separated offsets, in ms from `answered_at`, at which a transient
  // warning fires. Validated as a list rather than two named fields so the
  // count can change without a schema edit.
  ASSIGNMENT_CALL_WARNING_MS: Joi.string().default('3000000,3480000'),
  ASSIGNMENT_CALL_QUEUE_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  ASSIGNMENT_CALL_SWEEP_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(86_400_000)
    .default(60_000),
  ASSIGNMENT_CALL_EVENT_MAX_PUBLISH_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(5),
  ASSIGNMENT_CALL_SIGNAL_MAX_SDP_BYTES: Joi.number()
    .integer()
    .min(1_024)
    .max(1_048_576)
    .default(65_536),
  ASSIGNMENT_CALL_SIGNALS_PER_10S: Joi.number()
    .integer()
    .min(1)
    .max(1_000)
    .default(60),
  // coturn's REST/`use-auth-secret` scheme (RFC 7635) signs ephemeral TURN
  // credentials with this; it never reaches the browser. Required only when
  // calling is enabled, mirroring the Paymob conditional-requirement pattern.
  TURN_STATIC_AUTH_SECRET: Joi.string().min(32).allow('').default(''),
  TURN_REALM: Joi.string().default('sharek.local'),
  TURN_URLS: Joi.string().default(
    'turn:coturn:3478?transport=udp,turn:coturn:3478?transport=tcp',
  ),
  TURN_CREDENTIAL_TTL_SECONDS: Joi.number().integer().min(60).max(3_600).default(300),
  TURN_MONTHLY_BUDGET_BYTES: Joi.number()
    .integer()
    .min(1)
    .default(53_687_091_200),
  STUN_URLS: Joi.string().default(
    'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478',
  ),
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
    .default('/gap-guidance/generate'),
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
  AI_MATCHING_RANK_PATH: Joi.string()
    .pattern(/^\/[a-zA-Z0-9/_-]+$/)
    .default('/matching/rank'),
  AI_MATCHING_RANK_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
  AI_CONTRIBUTOR_MATCHING_PATH: Joi.string()
    .pattern(/^\/[a-zA-Z0-9/_-]+$/)
    .default('/contributor-matching/generate'),
  AI_CONTRIBUTOR_MATCHING_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .default(75000),
  /**
   * Off by default. The deterministic shortlist is a complete answer, so the
   * ranker is an improvement to switch on once the agent is deployed and
   * observed — not a dependency a contributor's matched projects wait on.
   */
  MATCH_RANKER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
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
  if (value.PAYMENTS_PAYMOB_ENABLED) {
    if (
      !value.PAYMOB_SECRET_KEY ||
      !value.PAYMOB_PUBLIC_KEY ||
      !value.PAYMOB_HMAC_SECRET ||
      !value.PAYMOB_NOTIFICATION_URL ||
      !value.PAYMOB_REDIRECTION_URL
    ) {
      return helpers.error('any.invalid', {
        message:
          'PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC_SECRET, PAYMOB_NOTIFICATION_URL, and PAYMOB_REDIRECTION_URL are required when Paymob is enabled',
      });
    }

    for (const key of ['PAYMOB_NOTIFICATION_URL', 'PAYMOB_REDIRECTION_URL']) {
      let url: URL;
      try {
        url = new URL(value[key]);
      } catch {
        return helpers.error('any.invalid', {
          message: `${key} must be a valid HTTPS URL when Paymob is enabled`,
        });
      }
      const isDevelopmentLoopbackRedirect =
        key === 'PAYMOB_REDIRECTION_URL' &&
        value.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
      if (url.protocol !== 'https:' && !isDevelopmentLoopbackRedirect) {
        return helpers.error('any.invalid', {
          message: `${key} must be HTTPS, except for a loopback frontend redirect outside production`,
        });
      }
    }

    const integrationIds = String(value.PAYMOB_INTEGRATION_IDS ?? '')
      .split(',')
      .map((id) => id.trim());
    const hasInvalidIntegrationId = integrationIds.some((id) => {
      const parsed = Number(id);
      return (
        !/^\d+$/.test(id) ||
        !Number.isSafeInteger(parsed) ||
        parsed <= 0
      );
    });
    if (hasInvalidIntegrationId) {
      return helpers.error('any.invalid', {
        message:
          'PAYMOB_INTEGRATION_IDS must be a non-empty comma-separated list of positive safe integers when Paymob is enabled',
      });
    }
  }

  if (value.CHAT_ATTACHMENTS_ENABLED && !value.S3_CHAT_ATTACHMENTS_BUCKET) {
    return helpers.error('any.invalid', {
      message:
        'S3_CHAT_ATTACHMENTS_BUCKET is required when CHAT_ATTACHMENTS_ENABLED is true',
    });
  }

  if (value.ASSIGNMENT_CALLS_ENABLED && value.TURN_STATIC_AUTH_SECRET.length < 32) {
    return helpers.error('any.invalid', {
      message:
        'TURN_STATIC_AUTH_SECRET (min 32 chars) is required when ASSIGNMENT_CALLS_ENABLED is true',
    });
  }

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
