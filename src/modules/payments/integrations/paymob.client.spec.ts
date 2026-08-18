import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

import { PaymobClient } from './paymob.client';

const originalFetch = global.fetch;
const hmacSecret = 'sandbox-hmac-secret';

const transaction = {
  amount_cents: 12500,
  created_at: '2026-08-13T12:00:00.000000',
  currency: 'EGP',
  error_occured: false,
  has_parent_transaction: false,
  id: 987654,
  integration_id: 12345,
  is_3d_secure: true,
  is_auth: false,
  is_capture: true,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 456789, merchant_order_id: 'sharek:payment:11111111-1111-4111-8111-111111111111' },
  owner: 2468,
  pending: false,
  source_data: {
    pan: '2346',
    sub_type: 'MasterCard',
    type: 'card',
  },
  success: true,
  is_live: false,
};

function config(overrides: Record<string, unknown> = {}): ConfigService {
  return new ConfigService({
    PAYMENTS_PAYMOB_ENABLED: true,
    PAYMOB_API_BASE_URL: 'https://accept.paymob.com',
    PAYMOB_INTENTION_PATH: '/v1/intention/',
    PAYMOB_SECRET_KEY: 'sandbox-secret',
    PAYMOB_PUBLIC_KEY: 'sandbox-public-key',
    PAYMOB_HMAC_SECRET: hmacSecret,
    PAYMOB_NOTIFICATION_URL: 'https://api.example.test/payments/paymob/webhook',
    PAYMOB_REDIRECTION_URL: 'https://app.example.test/payments/result',
    PAYMOB_EXPECTED_LIVE: false,
    PAYMOB_INTEGRATION_IDS: '12345, 67890',
    PAYMOB_REQUEST_TIMEOUT_MS: 1000,
    ...overrides,
  });
}

function response(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(payload),
  } as Response;
}

function callbackHmac(value = transaction): string {
  const fields = [
    value.amount_cents,
    value.created_at,
    value.currency,
    value.error_occured,
    value.has_parent_transaction,
    value.id,
    value.integration_id,
    value.is_3d_secure,
    value.is_auth,
    value.is_capture,
    value.is_refunded,
    value.is_standalone_payment,
    value.is_voided,
    value.order.id,
    value.owner,
    value.pending,
    value.source_data.pan,
    value.source_data.sub_type,
    value.source_data.type,
    value.success,
  ]
    .map(String)
    .join('');

  return createHmac('sha512', hmacSecret).update(fields).digest('hex');
}

describe('PaymobClient', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('maps a typed intention request and Paymob authentication', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      response({ id: 'pi_test_123', client_secret: 'client-secret-123' }),
    );

    await expect(
      new PaymobClient(config()).createPaymentIntention({
        amountCents: 12500,
        currency: 'EGP',
        reference: 'sharek:payment:11111111-1111-4111-8111-111111111111',
        itemName: 'Sharek Gold subscription',
        customer: {
          firstName: 'Test',
          lastName: 'Customer',
          email: 'test@example.com',
          phoneNumber: '+201000000000',
          country: 'EG',
          region: null,
          city: null,
        },
      }),
    ).resolves.toEqual({
      intentionId: 'pi_test_123',
      clientSecret: 'client-secret-123',
      checkoutUrl:
        'https://accept.paymob.com/unifiedcheckout/?publicKey=sandbox-public-key&clientSecret=client-secret-123',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://accept.paymob.com/v1/intention/',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Token sandbox-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 12500,
          currency: 'EGP',
          payment_methods: [12345, 67890],
          items: [
            {
              name: 'Sharek Gold subscription',
              amount: 12500,
              description: 'Sharek Gold subscription',
              quantity: 1,
            },
          ],
          billing_data: {
            first_name: 'Test',
            last_name: 'Customer',
            email: 'test@example.com',
            phone_number: '+201000000000',
            apartment: 'NA',
            floor: 'NA',
            street: 'NA',
            building: 'NA',
            shipping_method: 'NA',
            postal_code: 'NA',
            city: 'NA',
            country: 'EG',
            state: 'NA',
          },
          customer: {
            first_name: 'Test',
            last_name: 'Customer',
            email: 'test@example.com',
          },
          special_reference:
            'sharek:payment:11111111-1111-4111-8111-111111111111',
          notification_url: 'https://api.example.test/payments/paymob/webhook',
          redirection_url: 'https://app.example.test/payments/result',
        }),
      }),
    );
  });

  it('validates and minimizes the intention response', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      response({ id: 'pi_test_123', unexpected: 'ignored' }),
    );

    await expect(
      new PaymobClient(config()).createPaymentIntention({
        amountCents: 100,
        currency: 'EGP',
        reference: 'sharek:payment:11111111-1111-4111-8111-111111111111',
        itemName: 'Sharek Gold subscription',
        customer: {
          firstName: 'Test',
          lastName: 'Customer',
          email: 'test@example.com',
          phoneNumber: '+201000000000',
          country: 'EG',
          region: null,
          city: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'PAYMOB_PROVIDER_RESPONSE_INVALID',
      statusCode: 502,
    });
  });

  it('fails closed while disabled or incompletely configured', async () => {
    const disabled = new PaymobClient(
      config({ PAYMENTS_PAYMOB_ENABLED: false }),
    );
    await expect(
      disabled.createPaymentIntention({
        amountCents: 100,
        currency: 'EGP',
        reference: 'sharek:payment:11111111-1111-4111-8111-111111111111',
        itemName: 'Sharek Gold subscription',
        customer: {
          firstName: 'Test',
          lastName: 'Customer',
          email: 'test@example.com',
          phoneNumber: '+201000000000',
          country: 'EG',
          region: null,
          city: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'PAYMOB_PROVIDER_DISABLED' });
    expect(global.fetch).not.toHaveBeenCalled();

    const incomplete = new PaymobClient(
        config({ PAYMOB_SECRET_KEY: '', PAYMOB_INTEGRATION_IDS: '' }),
    );
    await expect(
      incomplete.createPaymentIntention({
        amountCents: 100,
        currency: 'EGP',
        reference: 'sharek:payment:11111111-1111-4111-8111-111111111111',
        itemName: 'Sharek Gold subscription',
        customer: {
          firstName: 'Test',
          lastName: 'Customer',
          email: 'test@example.com',
          phoneNumber: '+201000000000',
          country: 'EG',
          region: null,
          city: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'PAYMOB_CONFIGURATION_INVALID' });
    expect(global.fetch).not.toHaveBeenCalled();

    for (const integrationIds of ['1e3', '1.0']) {
      await expect(
        new PaymobClient(config({ PAYMOB_INTEGRATION_IDS: integrationIds })).createPaymentIntention({
          amountCents: 100,
          currency: 'EGP',
          reference: 'sharek:payment:11111111-1111-4111-8111-111111111111',
          itemName: 'Sharek Gold subscription',
          customer: {
            firstName: 'Test',
            lastName: 'Customer',
            email: 'test@example.com',
            phoneNumber: '+201000000000',
            country: 'EG',
            region: null,
            city: null,
          },
        }),
      ).rejects.toMatchObject({ code: 'PAYMOB_CONFIGURATION_INVALID' });
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps a non-2xx provider response without exposing its payload', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      response({ detail: 'secret provider diagnostic' }, false, 401),
    );

    await expect(
      new PaymobClient(config()).createPaymentIntention({
        amountCents: 100,
        currency: 'EGP',
        reference: 'sharek:payment:11111111-1111-4111-8111-111111111111',
        itemName: 'Sharek Gold subscription',
        customer: {
          firstName: 'Test',
          lastName: 'Customer',
          email: 'test@example.com',
          phoneNumber: '+201000000000',
          country: 'EG',
          region: null,
          city: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'PAYMOB_PROVIDER_HTTP_ERROR',
      statusCode: 502,
    });
  });

  it('maps timeout and network failures to stable provider errors', async () => {
    const timeout = new Error('aborted');
    timeout.name = 'AbortError';
    jest.mocked(global.fetch).mockRejectedValueOnce(timeout);
    await expect(
      new PaymobClient(config()).createPaymentIntention({
        amountCents: 100,
        currency: 'EGP',
        reference: 'sharek:payment:11111111-1111-4111-8111-111111111111',
        itemName: 'Sharek Gold subscription',
        customer: {
          firstName: 'Test',
          lastName: 'Customer',
          email: 'test@example.com',
          phoneNumber: '+201000000000',
          country: 'EG',
          region: null,
          city: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'PAYMOB_PROVIDER_TIMEOUT', statusCode: 504 });

    jest.mocked(global.fetch).mockRejectedValueOnce(new Error('network down'));
    await expect(
      new PaymobClient(config()).createPaymentIntention({
        amountCents: 100,
        currency: 'EGP',
        reference: 'sharek:payment:11111111-1111-4111-8111-111111111111',
        itemName: 'Sharek Gold subscription',
        customer: {
          firstName: 'Test',
          lastName: 'Customer',
          email: 'test@example.com',
          phoneNumber: '+201000000000',
          country: 'EG',
          region: null,
          city: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'PAYMOB_PROVIDER_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('normalizes a callback after valid HMAC verification', () => {
    const result = new PaymobClient(config()).verifyAndNormalizeTransactionCallback({
      payload: { type: 'TRANSACTION', obj: transaction },
      hmac: callbackHmac(),
    });

    expect(result).toEqual({
      transactionId: '987654',
      orderId: '456789',
      merchantOrderId: 'sharek:payment:11111111-1111-4111-8111-111111111111',
      amountCents: 12500,
      currency: 'EGP',
      integrationId: 12345,
      pending: false,
      success: true,
      isLive: false,
    });
  });

  it('rebuilds a hosted checkout URL for legacy attempts that predate URL persistence', () => {
    expect(new PaymobClient(config()).createHostedCheckoutUrl('client-secret-123')).toBe(
      'https://accept.paymob.com/unifiedcheckout/?publicKey=sandbox-public-key&clientSecret=client-secret-123',
    );
  });

  it('rejects a callback when a signed field changes', () => {
    const changed = { ...transaction, amount_cents: 12501 };

    expect(() =>
      new PaymobClient(config()).verifyAndNormalizeTransactionCallback({
        payload: { type: 'TRANSACTION', obj: changed },
        hmac: callbackHmac(),
      }),
    ).toThrow('Paymob callback HMAC is invalid');
  });

  it.each([
    { type: 'TRANSACTION', obj: { ...transaction, source_data: undefined } },
    { type: 'ORDER', obj: transaction },
    { type: 'TRANSACTION', obj: { ...transaction, order: null } },
  ])('rejects malformed callback structure %#', (payload) => {
    expect(() =>
      new PaymobClient(config()).verifyAndNormalizeTransactionCallback({
        payload,
        hmac: callbackHmac(),
      }),
    ).toThrow('Paymob transaction callback is malformed');
  });

  it('rejects malformed callback digests and unequal digest lengths safely', () => {
    const client = new PaymobClient(config());
    expect(() =>
      client.verifyAndNormalizeTransactionCallback({
        payload: { type: 'TRANSACTION', obj: transaction },
        hmac: 'not-hex',
      }),
    ).toThrow('Paymob callback HMAC is invalid');

    expect(() =>
      client.verifyAndNormalizeTransactionCallback({
        payload: { type: 'TRANSACTION', obj: transaction },
        hmac: 'a'.repeat(126),
      }),
    ).toThrow('Paymob callback HMAC is invalid');
  });
});
