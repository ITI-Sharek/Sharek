import {
  createPaymentWebhookFingerprint,
  minimizePaymentWebhookPayload,
} from './payment-webhook-event';
import { NormalizedPaymentTransaction } from './payments.types';

describe('payment webhook event normalization', () => {
  const transaction: NormalizedPaymentTransaction = {
    transactionId: 'transaction-1',
    orderId: 'order-1',
    amountCents: 29_900,
    currency: 'EGP',
    integrationId: 5_852_767,
    pending: false,
    success: true,
  };

  it('keeps only normalized payment facts in the stored payload', () => {
    expect(minimizePaymentWebhookPayload(transaction)).toEqual(transaction);
  });

  it('derives a stable SHA-256 fingerprint from the provider and facts', () => {
    const payload = minimizePaymentWebhookPayload(transaction);
    const fingerprint = createPaymentWebhookFingerprint('paymob', payload);

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(createPaymentWebhookFingerprint('paymob', payload)).toBe(fingerprint);
    expect(
      createPaymentWebhookFingerprint('paymob', {
        ...payload,
        success: false,
      }),
    ).not.toBe(fingerprint);
  });
});
