export interface PaymentCustomerProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

export interface CreatePaymentIntentionRequest {
  amountCents: number;
  currency: string;
  reference: string;
  customer: PaymentCustomerProfileInput;
  itemName: string;
}

export interface PaymentIntention {
  intentionId: string;
  clientSecret: string;
  checkoutUrl: string;
}

export interface VerifyTransactionCallbackRequest {
  payload: unknown;
  hmac: unknown;
}

export interface NormalizedPaymentTransaction {
  transactionId: string;
  orderId: string;
  merchantOrderId: string;
  amountCents: number;
  currency: string;
  integrationId: number;
  pending: boolean;
  success: boolean;
  isLive: boolean | null;
}

export interface PaymentProvider {
  createPaymentIntention(
    request: CreatePaymentIntentionRequest,
  ): Promise<PaymentIntention>;
  createHostedCheckoutUrl?(clientSecret: string): string;
  verifyAndNormalizeTransactionCallback(
    request: VerifyTransactionCallbackRequest,
  ): NormalizedPaymentTransaction;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
