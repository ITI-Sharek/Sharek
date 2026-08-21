import {
  ConflictApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import {
  alreadyApplied,
  applicationNotFound,
  concurrentDecision,
  normalizeDeclineFeedback,
  normalizeIdempotencyKey,
  normalizeRequiredIdempotencyKey,
} from './application-command.policy';

const VALID_KEY = '9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

describe('normalizeIdempotencyKey', () => {
  it('accepts and trims a UUID v4 key in any letter case', () => {
    expect(normalizeIdempotencyKey(VALID_KEY)).toBe(VALID_KEY);
    expect(normalizeIdempotencyKey(`  ${VALID_KEY.toUpperCase()}  `)).toBe(
      VALID_KEY.toUpperCase(),
    );
  });

  it('refuses anything that is not a UUID v4 with a stable code', () => {
    for (const invalid of [
      '',
      'not-a-uuid',
      // version digit is not 4 and variant digit is outside [89ab]
      '9f1c2d3e-4a5b-1c6d-0e9f-0a1b2c3d4e5f',
    ]) {
      expect(() => normalizeIdempotencyKey(invalid)).toThrowError(
        expect.objectContaining({
          code: 'APPLICATION_IDEMPOTENCY_KEY_INVALID',
          statusCode: 400,
        }),
      );
    }
  });
});

describe('normalizeRequiredIdempotencyKey', () => {
  it('requires a key before validating its shape', () => {
    for (const missing of [undefined, '']) {
      expect(() => normalizeRequiredIdempotencyKey(missing)).toThrowError(
        expect.objectContaining({
          code: 'APPLICATION_IDEMPOTENCY_KEY_REQUIRED',
        }),
      );
    }
    expect(normalizeRequiredIdempotencyKey(VALID_KEY)).toBe(VALID_KEY);
    expect(() => normalizeRequiredIdempotencyKey('nope')).toThrowError(
      expect.objectContaining({
        code: 'APPLICATION_IDEMPOTENCY_KEY_INVALID',
      }),
    );
  });
});

describe('normalizeDeclineFeedback', () => {
  it('trims surrounding whitespace from real feedback', () => {
    expect(normalizeDeclineFeedback('  needs tests  ')).toBe('needs tests');
  });

  it('refuses missing, blank, and non-string feedback with one code', () => {
    for (const invalid of [undefined, '', '   ']) {
      expect(() =>
        normalizeDeclineFeedback(invalid as unknown as string),
      ).toThrowError(
        expect.objectContaining({
          code: 'APPLICATION_DECISION_FEEDBACK_REQUIRED',
          statusCode: 400,
        }),
      );
    }
  });
});

describe('error factories', () => {
  it('constructs the stable conflict and not-found vocabulary', () => {
    expect(alreadyApplied()).toBeInstanceOf(ConflictApplicationError);
    expect(alreadyApplied()).toMatchObject({
      code: 'ALREADY_APPLIED',
      statusCode: 409,
      message: 'An Application already exists for this Contribution Request',
    });

    expect(applicationNotFound()).toBeInstanceOf(NotFoundApplicationError);
    expect(applicationNotFound()).toMatchObject({
      code: 'APPLICATION_NOT_FOUND',
      statusCode: 404,
      message: 'Application was not found',
    });

    expect(concurrentDecision()).toBeInstanceOf(ConflictApplicationError);
    expect(concurrentDecision()).toMatchObject({
      code: 'APPLICATION_CONCURRENT_MODIFICATION',
      statusCode: 409,
      message: 'Application changed during the Owner Decision',
    });
  });
});
