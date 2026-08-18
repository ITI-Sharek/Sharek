import { ConfigService } from '@nestjs/config';
import {
  PaymentAttemptStatus,
  PaymentAttemptPurpose,
  PaymentProvider as PrismaPaymentProvider,
  SubscriptionPlanType,
  SubscriptionUserRoleContext,
} from '@prisma/client';

import { ApplicationError } from '../../shared/errors/application.error';
import { PaymentWebhookService } from './payment-webhook.service';
import { PaymentProvider } from './payments.types';

describe('PaymentWebhookService', () => {
  const paymentId = '11111111-1111-4111-8111-111111111111';
  const transaction = {
    transactionId: '987654',
    orderId: '456789',
    merchantOrderId: `sharek:payment:${paymentId}`,
    amountCents: 50_000,
    currency: 'EGP',
    integrationId: 5_852_767,
    pending: false,
    success: true,
    isLive: false,
  };
  const attempt = {
    id: paymentId,
    user_id: '22222222-2222-4222-8222-222222222222',
    purpose: PaymentAttemptPurpose.subscription_purchase,
    user_role_context: SubscriptionUserRoleContext.owner,
    plan_type: SubscriptionPlanType.gold,
    amount_cents: 50_000,
    currency: 'EGP',
    provider: PrismaPaymentProvider.paymob,
    provider_order_id: null,
    provider_transaction_id: null,
    status: PaymentAttemptStatus.pending,
  };

  function setup() {
    const database = {
      paymentAttempt: {
        findUnique: jest.fn().mockResolvedValue(attempt),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentWebhookEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) => callback(database),
    );
    const subscriptions = {
      activatePurchasedPlan: jest.fn().mockResolvedValue(undefined),
    };
    const provider: jest.Mocked<PaymentProvider> = {
      createPaymentIntention: jest.fn(),
      verifyAndNormalizeTransactionCallback: jest.fn().mockReturnValue(transaction),
    };
    const service = new PaymentWebhookService(
      database as never,
      new ConfigService({
        PAYMOB_INTEGRATION_IDS: '5852767',
        PAYMOB_EXPECTED_LIVE: false,
      }),
      subscriptions as never,
      provider,
    );
    return { database, subscriptions, provider, service };
  }

  it('marks a verified success paid and activates Gold in the same transaction', async () => {
    const { database, subscriptions, service } = setup();
    const processedAt = new Date('2026-08-18T12:00:00.000Z');

    await expect(
      service.process({ payload: { type: 'TRANSACTION' }, hmac: 'signed', processedAt }),
    ).resolves.toEqual({
      received: true,
      outcome: 'processed',
      paymentId,
      paymentStatus: PaymentAttemptStatus.paid,
    });

    expect(database.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: {
        status: PaymentAttemptStatus.paid,
        provider_order_id: '456789',
        provider_transaction_id: '987654',
        paid_at: processedAt,
      },
    });
    expect(subscriptions.activatePurchasedPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: attempt.user_id,
        roleContext: SubscriptionUserRoleContext.owner,
        planType: SubscriptionPlanType.gold,
        periodStart: processedAt,
        periodEnd: new Date('2026-09-17T12:00:00.000Z'),
      }),
      database,
    );
    expect(database.paymentWebhookEvent.update).toHaveBeenLastCalledWith({
      where: { id: 'event-1' },
      data: {
        processing_status: 'processed',
        processed_at: processedAt,
      },
    });
  });

  it('keeps a declined callback failed without activating a subscription', async () => {
    const { database, provider, subscriptions, service } = setup();
    provider.verifyAndNormalizeTransactionCallback.mockReturnValue({
      ...transaction,
      success: false,
    });

    await expect(
      service.process({ payload: {}, hmac: 'signed' }),
    ).resolves.toMatchObject({
      received: true,
      outcome: 'processed',
      paymentStatus: PaymentAttemptStatus.failed,
    });
    expect(database.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: expect.objectContaining({
        status: PaymentAttemptStatus.failed,
        failed_at: expect.any(Date),
      }),
    });
    expect(subscriptions.activatePurchasedPlan).not.toHaveBeenCalled();
  });

  it('keeps a pending callback pending without binding entitlement', async () => {
    const { database, provider, subscriptions, service } = setup();
    provider.verifyAndNormalizeTransactionCallback.mockReturnValue({
      ...transaction,
      pending: true,
      success: false,
    });

    await expect(
      service.process({ payload: {}, hmac: 'signed' }),
    ).resolves.toMatchObject({
      received: true,
      outcome: 'processed',
      paymentStatus: PaymentAttemptStatus.pending,
    });
    expect(database.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: {
        provider_order_id: '456789',
        provider_transaction_id: '987654',
      },
    });
    expect(subscriptions.activatePurchasedPlan).not.toHaveBeenCalled();
  });

  it('accepts success after pending for the same Paymob transaction', async () => {
    const { database, provider, subscriptions, service } = setup();
    const pendingAttempt = { ...attempt };
    const boundAttempt = {
      ...attempt,
      provider_order_id: transaction.orderId,
      provider_transaction_id: transaction.transactionId,
    };
    database.paymentAttempt.findUnique
      .mockResolvedValueOnce(pendingAttempt)
      .mockResolvedValueOnce(boundAttempt);
    database.paymentWebhookEvent.create
      .mockResolvedValueOnce({ id: 'event-pending' })
      .mockResolvedValueOnce({ id: 'event-success' });
    provider.verifyAndNormalizeTransactionCallback
      .mockReturnValueOnce({ ...transaction, pending: true, success: false })
      .mockReturnValueOnce(transaction);

    await expect(service.process({ payload: {}, hmac: 'signed' })).resolves.toMatchObject({
      outcome: 'processed',
      paymentStatus: PaymentAttemptStatus.pending,
    });
    await expect(service.process({ payload: {}, hmac: 'signed' })).resolves.toMatchObject({
      outcome: 'processed',
      paymentStatus: PaymentAttemptStatus.paid,
    });

    expect(database.paymentWebhookEvent.create).toHaveBeenCalledTimes(2);
    expect(subscriptions.activatePurchasedPlan).toHaveBeenCalledTimes(1);
  });

  it('ignores an amount mismatch without changing payment state', async () => {
    const { database, provider, subscriptions, service } = setup();
    provider.verifyAndNormalizeTransactionCallback.mockReturnValue({
      ...transaction,
      amountCents: 49_999,
    });

    await expect(service.process({ payload: {}, hmac: 'signed' })).resolves.toEqual({
      received: true,
      outcome: 'ignored',
      paymentId,
      paymentStatus: PaymentAttemptStatus.pending,
    });
    expect(database.paymentAttempt.update).not.toHaveBeenCalled();
    expect(subscriptions.activatePurchasedPlan).not.toHaveBeenCalled();
  });

  it('records an invalid callback without trusting or attaching it', async () => {
    const { database, provider, service } = setup();
    provider.verifyAndNormalizeTransactionCallback.mockImplementation(() => {
      throw new ApplicationError('invalid HMAC', 'PAYMOB_CALLBACK_HMAC_INVALID', 400);
    });

    await expect(
      service.process({
        payload: {
          type: 'TRANSACTION',
          obj: { id: '987654', order: { id: '456789' } },
        },
        hmac: 'invalid',
      }),
    ).rejects.toMatchObject({ code: 'PAYMOB_CALLBACK_HMAC_INVALID' });
    expect(database.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        verification_status: 'invalid',
        processing_status: 'ignored',
      }),
    });
    expect(database.paymentAttempt.update).not.toHaveBeenCalled();
  });

  it('rejects a signed callback whose merchant reference is not a v4 payment UUID', async () => {
    const { database, provider, service } = setup();
    provider.verifyAndNormalizeTransactionCallback.mockReturnValue({
      ...transaction,
      merchantOrderId: 'sharek:payment:not-a-uuid',
    });

    await expect(
      service.process({ payload: {}, hmac: 'signed' }),
    ).rejects.toMatchObject({ code: 'PAYMOB_CALLBACK_REFERENCE_INVALID' });
    expect(database.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        verification_status: 'invalid',
        processing_status: 'ignored',
      }),
    });
  });
});
