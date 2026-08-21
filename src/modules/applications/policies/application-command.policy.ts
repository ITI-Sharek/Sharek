import {
  BadRequestApplicationError,
  ConflictApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new BadRequestApplicationError(
      'Application idempotency key must be a UUID',
      'APPLICATION_IDEMPOTENCY_KEY_INVALID',
    );
  }
  return normalized;
}

export function normalizeRequiredIdempotencyKey(value?: string): string {
  if (!value) {
    throw new BadRequestApplicationError(
      'Idempotency-Key is required for an Owner Decision',
      'APPLICATION_IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  return normalizeIdempotencyKey(value);
}

export function normalizeDeclineFeedback(value: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestApplicationError(
      'Owner decision feedback is required when declining an Application',
      'APPLICATION_DECISION_FEEDBACK_REQUIRED',
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new BadRequestApplicationError(
      'Owner decision feedback is required when declining an Application',
      'APPLICATION_DECISION_FEEDBACK_REQUIRED',
    );
  }
  return normalized;
}

export function alreadyApplied(): ConflictApplicationError {
  return new ConflictApplicationError(
    'An Application already exists for this Contribution Request',
    'ALREADY_APPLIED',
  );
}

export function applicationNotFound(): NotFoundApplicationError {
  return new NotFoundApplicationError(
    'Application was not found',
    'APPLICATION_NOT_FOUND',
  );
}

export function concurrentDecision(): ConflictApplicationError {
  return new ConflictApplicationError(
    'Application changed during the Owner Decision',
    'APPLICATION_CONCURRENT_MODIFICATION',
  );
}
