import {
  PaymentAttemptStatus,
  PaymentProvider as PrismaPaymentProvider,
  PaymentAttemptPurpose,
  SubscriptionPlanType,
  SubscriptionUserRoleContext,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { PaymentsService } from './payments.service';
import { PaymentProvider } from './payments.types';

describe('PaymentsService', () => {
  const owner: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };
  const paymentId = '33333333-3333-4333-8333-333333333333';
  const idempotencyKey = 'checkout-key-2026-08-13';
  const plan = {
    planType: SubscriptionPlanType.gold,
    amountCents: 50_000,
    currency: 'EGP' as const,
    durationDays: 30,
    checkoutAvailable: true,
    roleContexts: [
      SubscriptionUserRoleContext.owner,
      SubscriptionUserRoleContext.contributor,
    ] as const,
  };

  const database = {
    paymentAttempt: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const subscriptions = {
    getPlanCatalogEntry: jest.fn().mockReturnValue(plan),
    assertPlanPurchaseAllowed: jest.fn().mockResolvedValue(undefined),
  };
  const provider: jest.Mocked<PaymentProvider> = {
    createPaymentIntention: jest.fn(),
    verifyAndNormalizeTransactionCallback: jest.fn(),
  };
  const service = new PaymentsService(
    database as never,
    subscriptions as never,
    provider,
  );

  const pendingAttempt = (overrides: Record<string, unknown> = {}) => ({
    id: paymentId,
    user_id: owner.id,
    purpose: PaymentAttemptPurpose.subscription_purchase,
    user_role_context: SubscriptionUserRoleContext.owner,
    plan_type: SubscriptionPlanType.gold,
    amount_cents: 50_000,
    currency: 'EGP',
    idempotency_key: idempotencyKey,
    provider: PrismaPaymentProvider.paymob,
    provider_intention_id: 'intention-1',
    provider_client_secret: 'client-secret-1',
    provider_order_id: null,
    provider_transaction_id: null,
    status: PaymentAttemptStatus.pending,
    expires_at: null,
    paid_at: null,
    failed_at: null,
    cancelled_at: null,
    created_at: new Date('2026-08-13T10:00:00.000Z'),
    updated_at: new Date('2026-08-13T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    subscriptions.getPlanCatalogEntry.mockReturnValue(plan);
    subscriptions.assertPlanPurchaseAllowed.mockResolvedValue(undefined);
    database.paymentAttempt.findUnique.mockResolvedValue(null);
    database.paymentAttempt.findFirst.mockResolvedValue(null);
    database.paymentAttempt.create.mockResolvedValue(
      pendingAttempt({
        provider_intention_id: null,
        provider_client_secret: null,
      }),
    );
    database.paymentAttempt.update.mockResolvedValue(pendingAttempt());
    provider.createPaymentIntention.mockResolvedValue({
      intentionId: 'intention-1',
      clientSecret: 'client-secret-1',
    });
  });

  it('creates a pending payment and returns only safe hosted checkout data', async () => {
    await expect(
      service.createCheckout({
        actor: owner,
        planType: SubscriptionPlanType.gold,
        roleContext: SubscriptionUserRoleContext.owner,
        idempotencyKey,
      }),
    ).resolves.toEqual({
      paymentId,
      checkout: {
        provider: 'paymob',
        clientSecret: 'client-secret-1',
      },
    });

    expect(database.paymentAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        user_id: owner.id,
        purpose: PaymentAttemptPurpose.subscription_purchase,
        user_role_context: SubscriptionUserRoleContext.owner,
        plan_type: SubscriptionPlanType.gold,
        amount_cents: 50_000,
        currency: 'EGP',
        idempotency_key: idempotencyKey,
        status: PaymentAttemptStatus.pending,
      }),
    });
    expect(provider.createPaymentIntention).toHaveBeenCalledWith({
      amountCents: 50_000,
      currency: 'EGP',
      reference: expect.stringMatching(/^sharek:payment:/),
    });
    expect(database.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: {
        provider_intention_id: 'intention-1',
        provider_client_secret: 'client-secret-1',
      },
    });
  });

  it('reuses a pending idempotent payment without creating another intention', async () => {
    database.paymentAttempt.findUnique.mockResolvedValue(pendingAttempt());

    await expect(
      service.createCheckout({
        actor: owner,
        planType: SubscriptionPlanType.gold,
        roleContext: SubscriptionUserRoleContext.owner,
        idempotencyKey,
      }),
    ).resolves.toEqual({
      paymentId,
      checkout: {
        provider: 'paymob',
        clientSecret: 'client-secret-1',
      },
    });

    expect(provider.createPaymentIntention).not.toHaveBeenCalled();
    expect(database.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('rejects reusing an idempotency key for a different checkout', async () => {
    database.paymentAttempt.findUnique.mockResolvedValue(
      pendingAttempt({ plan_type: SubscriptionPlanType.gold }),
    );

    await expect(
      service.createCheckout({
        actor: owner,
        planType: SubscriptionPlanType.gold,
        roleContext: SubscriptionUserRoleContext.owner,
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_IDEMPOTENCY_CONFLICT' });
    expect(provider.createPaymentIntention).not.toHaveBeenCalled();
  });

  it('does not allow a caller to purchase for another role context', async () => {
    await expect(
      service.createCheckout({
        actor: owner,
        planType: SubscriptionPlanType.gold,
        roleContext: SubscriptionUserRoleContext.contributor,
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_ROLE_CONTEXT_NOT_ALLOWED' });
    expect(database.paymentAttempt.findUnique).not.toHaveBeenCalled();
    expect(provider.createPaymentIntention).not.toHaveBeenCalled();
  });

  it('does not create a checkout for Bronze', async () => {
    subscriptions.getPlanCatalogEntry.mockReturnValue({
      ...plan,
      planType: SubscriptionPlanType.free,
      amountCents: 0,
      durationDays: null,
      checkoutAvailable: false,
    });

    await expect(
      service.createCheckout({
        actor: owner,
        planType: SubscriptionPlanType.free,
        roleContext: SubscriptionUserRoleContext.owner,
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_PLAN_CHECKOUT_UNAVAILABLE' });
    expect(database.paymentAttempt.create).not.toHaveBeenCalled();
    expect(provider.createPaymentIntention).not.toHaveBeenCalled();
  });

  it('returns only the caller-owned payment status', async () => {
    database.paymentAttempt.findFirst.mockResolvedValue(pendingAttempt());

    await expect(service.getPaymentStatus(owner, paymentId)).resolves.toEqual({
      paymentId,
      planType: SubscriptionPlanType.gold,
      roleContext: SubscriptionUserRoleContext.owner,
      amountCents: 50_000,
      currency: 'EGP',
      status: PaymentAttemptStatus.pending,
      createdAt: new Date('2026-08-13T10:00:00.000Z'),
      paidAt: null,
    });
    expect(database.paymentAttempt.findFirst).toHaveBeenCalledWith({
      where: { id: paymentId, user_id: owner.id },
    });
  });

  it('does not reveal another user’s payment', async () => {
    database.paymentAttempt.findFirst.mockResolvedValue(null);

    await expect(service.getPaymentStatus(owner, paymentId)).rejects.toMatchObject({
      code: 'PAYMENT_NOT_FOUND',
    });
    expect(database.paymentAttempt.findFirst).toHaveBeenCalledWith({
      where: { id: paymentId, user_id: owner.id },
    });
  });

  it('rejects inactive accounts from checkout and status operations', async () => {
    const inactive = { ...owner, status: 'suspended' as const };

    await expect(
      service.createCheckout({
        actor: inactive,
        planType: SubscriptionPlanType.gold,
        roleContext: SubscriptionUserRoleContext.owner,
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_ACCOUNT_NOT_ELIGIBLE' });
    await expect(service.getPaymentStatus(inactive, paymentId)).rejects.toMatchObject({
      code: 'PAYMENT_ACCOUNT_NOT_ELIGIBLE',
    });
  });
});
