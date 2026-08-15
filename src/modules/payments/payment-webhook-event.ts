import { createHash } from 'node:crypto';

import { NormalizedPaymentTransaction } from './payments.types';

export type MinimizedPaymentWebhookPayload = Omit<
  NormalizedPaymentTransaction,
  'integrationId'
> & {
  integrationId: number;
};

export function minimizePaymentWebhookPayload(
  transaction: NormalizedPaymentTransaction,
): MinimizedPaymentWebhookPayload {
  return {
    transactionId: transaction.transactionId,
    orderId: transaction.orderId,
    amountCents: transaction.amountCents,
    currency: transaction.currency,
    integrationId: transaction.integrationId,
    pending: transaction.pending,
    success: transaction.success,
  };
}

export function createPaymentWebhookFingerprint(
  provider: string,
  payload: MinimizedPaymentWebhookPayload,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ provider, payload }))
    .digest('hex');
}
