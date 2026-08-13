import { PaymentAttemptStatus } from '@prisma/client';

import { ConflictApplicationError } from '../../shared/errors/application.error';

const allowedTransitions: Readonly<
  Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]>
> = {
  [PaymentAttemptStatus.pending]: [
    PaymentAttemptStatus.paid,
    PaymentAttemptStatus.failed,
    PaymentAttemptStatus.cancelled,
  ],
  [PaymentAttemptStatus.paid]: [PaymentAttemptStatus.refunded],
  [PaymentAttemptStatus.failed]: [],
  [PaymentAttemptStatus.cancelled]: [],
  [PaymentAttemptStatus.refunded]: [],
};

export function transitionPaymentAttemptStatus(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus,
): PaymentAttemptStatus {
  if (from === to) return from;
  if (allowedTransitions[from].includes(to)) return to;

  throw new ConflictApplicationError(
    `Payment attempt cannot transition from ${from} to ${to}`,
    'PAYMENT_ATTEMPT_INVALID_TRANSITION',
  );
}
