import { SubscriptionPlanType, SubscriptionUserRoleContext } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { PaymentsController } from './payments.controller';

describe('PaymentsController', () => {
  const actor: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };

  it('passes checkout input and the standard header idempotency key to the service', async () => {
    const payments = {
      createCheckout: jest.fn().mockResolvedValue({ paymentId: 'payment-1' }),
    };
    const controller = new PaymentsController(payments as never);

    await expect(
      controller.createCheckout(
        actor,
        {
          planType: SubscriptionPlanType.gold,
          roleContext: SubscriptionUserRoleContext.owner,
        },
        'header-key-2026',
      ),
    ).resolves.toEqual({ paymentId: 'payment-1' });
    expect(payments.createCheckout).toHaveBeenCalledWith({
      actor,
      planType: SubscriptionPlanType.gold,
      roleContext: SubscriptionUserRoleContext.owner,
      idempotencyKey: 'header-key-2026',
    });
  });

  it('prefers the body idempotency key when both transport forms are present', async () => {
    const payments = { createCheckout: jest.fn().mockResolvedValue({}) };
    const controller = new PaymentsController(payments as never);

    await controller.createCheckout(
      actor,
      {
        planType: SubscriptionPlanType.gold,
        roleContext: SubscriptionUserRoleContext.owner,
        idempotencyKey: 'body-key-2026',
      },
      'header-key-2026',
    );

    expect(payments.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'body-key-2026' }),
    );
  });

  it('delegates payment status reads with the authenticated actor', async () => {
    const status = { paymentId: 'payment-1', status: 'pending' };
    const payments = { getPaymentStatus: jest.fn().mockResolvedValue(status) };
    const controller = new PaymentsController(payments as never);

    await expect(
      controller.getPaymentStatus(actor, '33333333-3333-4333-8333-333333333333'),
    ).resolves.toBe(status);
    expect(payments.getPaymentStatus).toHaveBeenCalledWith(
      actor,
      '33333333-3333-4333-8333-333333333333',
    );
  });
});
