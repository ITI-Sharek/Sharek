import {
  PaymentAttemptStatus,
  SubscriptionPlanType,
  SubscriptionUserRoleContext,
} from '@prisma/client';

export interface PaymentCheckoutDto {
  paymentId: string;
  checkout: {
    provider: 'paymob';
    clientSecret: string;
    checkoutUrl: string;
  };
}

export interface PaymentStatusDto {
  paymentId: string;
  planType: SubscriptionPlanType;
  roleContext: SubscriptionUserRoleContext;
  amountCents: number;
  currency: string;
  status: PaymentAttemptStatus;
  createdAt: Date;
  paidAt: Date | null;
}
