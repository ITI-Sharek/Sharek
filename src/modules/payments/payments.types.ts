export interface CreatePaymentIntentionRequest {
  amountCents: number;
  currency: string;
  reference: string;
}

export interface PaymentIntention {
  intentionId: string;
  clientSecret: string;
}

export interface VerifyTransactionCallbackRequest {
  payload: unknown;
  hmac: unknown;
}

export interface NormalizedPaymentTransaction {
  transactionId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  integrationId: number;
  pending: boolean;
  success: boolean;
}

export interface PaymentProvider {
  createPaymentIntention(
    request: CreatePaymentIntentionRequest,
  ): Promise<PaymentIntention>;
  verifyAndNormalizeTransactionCallback(
    request: VerifyTransactionCallbackRequest,
  ): NormalizedPaymentTransaction;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
