import { PaymentAttemptStatus } from '@prisma/client';

import { transitionPaymentAttemptStatus } from './payment-attempt-state';

describe('payment attempt state transitions', () => {
  it.each([
    [PaymentAttemptStatus.pending, PaymentAttemptStatus.paid],
    [PaymentAttemptStatus.pending, PaymentAttemptStatus.failed],
    [PaymentAttemptStatus.pending, PaymentAttemptStatus.cancelled],
    [PaymentAttemptStatus.paid, PaymentAttemptStatus.refunded],
  ])('allows %s to become %s', (from, to) => {
    expect(transitionPaymentAttemptStatus(from, to)).toBe(to);
  });

  it.each(Object.values(PaymentAttemptStatus))(
    'treats repeating %s as an idempotent success',
    (status) => {
      expect(transitionPaymentAttemptStatus(status, status)).toBe(status);
    },
  );

  it.each([
    [PaymentAttemptStatus.failed, PaymentAttemptStatus.pending],
    [PaymentAttemptStatus.failed, PaymentAttemptStatus.paid],
    [PaymentAttemptStatus.cancelled, PaymentAttemptStatus.paid],
    [PaymentAttemptStatus.paid, PaymentAttemptStatus.failed],
    [PaymentAttemptStatus.refunded, PaymentAttemptStatus.paid],
  ])('rejects the retry-unsafe transition %s to %s', (from, to) => {
    expect(() => transitionPaymentAttemptStatus(from, to)).toThrow(
      expect.objectContaining({
        code: 'PAYMENT_ATTEMPT_INVALID_TRANSITION',
        statusCode: 409,
      }),
    );
  });
});
