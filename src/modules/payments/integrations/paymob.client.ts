import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { ApplicationError } from '../../../shared/errors/application.error';
import {
  CreatePaymentIntentionRequest,
  NormalizedPaymentTransaction,
  PaymentCustomerProfileInput,
  PaymentIntention,
  PaymentProvider,
  VerifyTransactionCallbackRequest,
} from '../payments.types';

const PAYMOB_INTENTION_RESPONSE_CODE = 'PAYMOB_PROVIDER_RESPONSE_INVALID';
const PAYMOB_CALLBACK_CODE = 'PAYMOB_CALLBACK_INVALID';
const PAYMOB_HMAC_CODE = 'PAYMOB_CALLBACK_HMAC_INVALID';
const PAYMENT_REFERENCE =
  /^sharek:payment:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const transactionHmacFields = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

@Injectable()
export class PaymobClient implements PaymentProvider {
  constructor(private readonly config: ConfigService) {}

  async createPaymentIntention(
    request: CreatePaymentIntentionRequest,
  ): Promise<PaymentIntention> {
    const configuration = this.getConfiguration();
    this.validateIntentionRequest(request);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      configuration.requestTimeoutMs,
    );

    try {
      const response = await fetch(
        `${configuration.apiBaseUrl}${configuration.intentionPath}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Token ${configuration.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: request.amountCents,
            currency: request.currency,
            payment_methods: configuration.integrationIds,
            items: [
              {
                name: request.itemName,
                amount: request.amountCents,
                description: request.itemName,
                quantity: 1,
              },
            ],
            billing_data: this.toBillingData(request.customer),
            customer: {
              first_name: request.customer.firstName,
              last_name: request.customer.lastName,
              email: request.customer.email,
            },
            special_reference: request.reference,
            notification_url: configuration.notificationUrl,
            redirection_url: configuration.redirectionUrl,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new ApplicationError(
          'Paymob provider returned an error',
          'PAYMOB_PROVIDER_HTTP_ERROR',
          502,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        this.invalidIntentionResponse();
      }

      return this.normalizeIntentionResponse(payload, configuration);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;

      if (
        controller.signal.aborted ||
        (error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError'))
      ) {
        throw new ApplicationError(
          'Paymob provider request timed out',
          'PAYMOB_PROVIDER_TIMEOUT',
          504,
          { retryable: true },
        );
      }

      throw new ApplicationError(
        'Paymob provider is unavailable',
        'PAYMOB_PROVIDER_UNAVAILABLE',
        503,
        { retryable: true },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  verifyAndNormalizeTransactionCallback(
    request: VerifyTransactionCallbackRequest,
  ): NormalizedPaymentTransaction {
    const configuration = this.getConfiguration();
    const transaction = this.getTransaction(request.payload);
    const order = this.requiredRecord(transaction, 'order');
    const concatenated = transactionHmacFields
      .map((field) => this.callbackFieldAsString(transaction, field))
      .join('');

    this.verifyHmac(concatenated, request.hmac, configuration.hmacSecret);

    return {
      transactionId: this.requiredIdentifier(transaction, 'id'),
      orderId: this.requiredIdentifier(
        order,
        'id',
      ),
      merchantOrderId: this.requiredString(order, 'merchant_order_id'),
      amountCents: this.requiredInteger(transaction, 'amount_cents'),
      currency: this.requiredString(transaction, 'currency').toUpperCase(),
      integrationId: this.requiredInteger(transaction, 'integration_id'),
      pending: this.requiredBoolean(transaction, 'pending'),
      success: this.requiredBoolean(transaction, 'success'),
      isLive:
        typeof transaction.is_live === 'boolean' ? transaction.is_live : null,
    };
  }

  createHostedCheckoutUrl(clientSecret: string): string {
    const configuration = this.getConfiguration();
    if (typeof clientSecret !== 'string' || !clientSecret.trim()) {
      throw new ApplicationError(
        'Paymob client secret is invalid',
        'PAYMOB_CHECKOUT_SECRET_INVALID',
        502,
      );
    }
    return this.createCheckoutUrl(
      configuration.apiBaseUrl,
      configuration.publicKey,
      clientSecret.trim(),
    );
  }

  private getConfiguration(): {
    apiBaseUrl: string;
    intentionPath: string;
    secretKey: string;
    publicKey: string;
    hmacSecret: string;
    notificationUrl: string;
    redirectionUrl: string;
    expectedLive: boolean;
    integrationIds: number[];
    requestTimeoutMs: number;
  } {
    if (!this.isEnabled()) {
      throw new ApplicationError(
        'Paymob payments provider is disabled',
        'PAYMOB_PROVIDER_DISABLED',
        503,
      );
    }

    const apiBaseUrl = this.config
      .get<string>('PAYMOB_API_BASE_URL', 'https://accept.paymob.com')
      .trim()
      .replace(/\/+$/, '');
    const intentionPath = this.config
      .get<string>('PAYMOB_INTENTION_PATH', '/v1/intention/')
      .trim();
    const secretKey = this.config.get<string>('PAYMOB_SECRET_KEY', '').trim();
    const publicKey = this.config.get<string>('PAYMOB_PUBLIC_KEY', '').trim();
    const hmacSecret = this.config.get<string>('PAYMOB_HMAC_SECRET', '').trim();
    const notificationUrl = this.config
      .get<string>('PAYMOB_NOTIFICATION_URL', '')
      .trim();
    const redirectionUrl = this.config
      .get<string>('PAYMOB_REDIRECTION_URL', '')
      .trim();
    const expectedLive = this.config.get<boolean | string>(
      'PAYMOB_EXPECTED_LIVE',
      false,
    );
    const integrationIdsValue = this.config.get<string>(
      'PAYMOB_INTEGRATION_IDS',
      '',
    );
    const requestTimeoutMs = this.config.get<number>(
      'PAYMOB_REQUEST_TIMEOUT_MS',
      10_000,
    );
    const environment = this.config.get<string>('NODE_ENV', 'development');

    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(apiBaseUrl);
    } catch {
      throw this.invalidConfiguration();
    }

    if (parsedBaseUrl.protocol !== 'https:') {
      throw this.invalidConfiguration();
    }

    if (
      !intentionPath.startsWith('/') ||
      !/^\/[a-zA-Z0-9/_-]+$/.test(intentionPath) ||
      !secretKey ||
      !publicKey ||
      !hmacSecret ||
      !notificationUrl ||
      !redirectionUrl ||
      !Number.isInteger(requestTimeoutMs) ||
      requestTimeoutMs < 100 ||
      requestTimeoutMs > 30_000
    ) {
      throw this.invalidConfiguration();
    }

    for (const [kind, urlValue] of [
      ['notification', notificationUrl],
      ['redirection', redirectionUrl],
    ] as const) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlValue);
      } catch {
        throw this.invalidConfiguration();
      }
      const isDevelopmentLoopbackRedirect =
        kind === 'redirection' &&
        environment !== 'production' &&
        parsedUrl.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
      if (
        parsedUrl.protocol !== 'https:' &&
        !isDevelopmentLoopbackRedirect
      ) {
        throw this.invalidConfiguration();
      }
    }

    const integrationIdTokens = integrationIdsValue
      .split(',')
      .map((value) => value.trim());
    if (
      integrationIdTokens.length === 0 ||
      integrationIdTokens.some(
        (value) =>
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) <= 0,
      )
    ) {
      throw this.invalidConfiguration();
    }
    const integrationIds = integrationIdTokens.map((value) => Number(value));

    return {
      apiBaseUrl,
      intentionPath,
      secretKey,
      publicKey,
      hmacSecret,
      notificationUrl,
      redirectionUrl,
      expectedLive: expectedLive === true || expectedLive === 'true',
      integrationIds,
      requestTimeoutMs,
    };
  }

  private isEnabled(): boolean {
    const value = this.config.get<boolean | string>(
      'PAYMENTS_PAYMOB_ENABLED',
      false,
    );
    return value === true || value === 'true';
  }

  private validateIntentionRequest(
    request: CreatePaymentIntentionRequest,
  ): void {
    if (
      !Number.isSafeInteger(request.amountCents) ||
      request.amountCents <= 0 ||
      typeof request.currency !== 'string' ||
      !request.currency.trim() ||
      request.currency.trim().length > 10 ||
      typeof request.reference !== 'string' ||
      !PAYMENT_REFERENCE.test(request.reference.trim()) ||
      typeof request.itemName !== 'string' ||
      !request.itemName.trim() ||
      request.itemName.trim().length > 255 ||
      !this.isPaymentCustomerProfile(request.customer)
    ) {
      throw new ApplicationError(
        'Paymob payment intention request is invalid',
        'PAYMOB_INTENTION_REQUEST_INVALID',
        400,
      );
    }
  }

  private normalizeIntentionResponse(
    payload: unknown,
    configuration: { apiBaseUrl: string; publicKey: string },
  ): PaymentIntention {
    if (!this.isRecord(payload)) this.invalidIntentionResponse();

    const intentionId = payload.id;
    const clientSecret = payload.client_secret;
    if (
      typeof intentionId !== 'string' ||
      !intentionId.trim() ||
      typeof clientSecret !== 'string' ||
      !clientSecret.trim()
    ) {
      this.invalidIntentionResponse();
    }

    return {
      intentionId: intentionId.trim(),
      clientSecret: clientSecret.trim(),
      checkoutUrl: this.createCheckoutUrl(
        configuration.apiBaseUrl,
        configuration.publicKey,
        clientSecret.trim(),
      ),
    };
  }

  private createCheckoutUrl(
    apiBaseUrl: string,
    publicKey: string,
    clientSecret: string,
  ): string {
    const checkoutUrl = new URL('/unifiedcheckout/', apiBaseUrl);
    checkoutUrl.searchParams.set('publicKey', publicKey);
    checkoutUrl.searchParams.set('clientSecret', clientSecret);
    return checkoutUrl.toString();
  }

  private toBillingData(customer: PaymentCustomerProfileInput): Record<string, string> {
    return {
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: customer.email,
      phone_number: customer.phoneNumber ?? '',
      apartment: 'NA',
      floor: 'NA',
      street: 'NA',
      building: 'NA',
      shipping_method: 'NA',
      postal_code: 'NA',
      city: customer.city?.trim() || 'NA',
      country: customer.country?.trim() || 'EG',
      state: customer.region?.trim() || 'NA',
    };
  }

  private isPaymentCustomerProfile(
    customer: PaymentCustomerProfileInput,
  ): boolean {
    return (
      this.isNonEmptyString(customer?.firstName) &&
      this.isNonEmptyString(customer?.lastName) &&
      this.isNonEmptyString(customer?.email) &&
      /^\+[1-9]\d{7,14}$/.test(customer?.phoneNumber ?? '')
    );
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private getTransaction(payload: unknown): Record<string, unknown> {
    if (!this.isRecord(payload) || payload.type !== 'TRANSACTION') {
      throw this.invalidCallback();
    }
    return this.requiredRecord(payload, 'obj', PAYMOB_CALLBACK_CODE);
  }

  private verifyHmac(
    concatenated: string,
    receivedHmac: unknown,
    secret: string,
  ): void {
    if (
      typeof receivedHmac !== 'string' ||
      !/^[0-9a-fA-F]+$/.test(receivedHmac) ||
      receivedHmac.length !== 128
    ) {
      throw new ApplicationError(
        'Paymob callback HMAC is invalid',
        PAYMOB_HMAC_CODE,
        400,
      );
    }

    const expected = createHmac('sha512', secret)
      .update(concatenated)
      .digest();
    const received = Buffer.from(receivedHmac, 'hex');
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new ApplicationError(
        'Paymob callback HMAC is invalid',
        PAYMOB_HMAC_CODE,
        400,
      );
    }
  }

  private callbackFieldAsString(
    transaction: Record<string, unknown>,
    field: (typeof transactionHmacFields)[number],
  ): string {
    const value = field.startsWith('order.')
      ? this.requiredRecord(transaction, 'order')[field.slice('order.'.length)]
      : field.startsWith('source_data.')
        ? this.requiredRecord(transaction, 'source_data')[
            field.slice('source_data.'.length)
          ]
        : transaction[field];

    if (
      (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean') ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      (typeof value === 'string' && value.length === 0)
    ) {
      throw this.invalidCallback();
    }
    return String(value);
  }

  private requiredIdentifier(
    record: Record<string, unknown>,
    key: string,
  ): string {
    const value = record[key];
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' &&
        (!Number.isSafeInteger(value) || value <= 0)) ||
      (typeof value === 'string' && (!value || value.length > 255))
    ) {
      throw this.invalidCallback();
    }
    return String(value);
  }

  private requiredString(
    record: Record<string, unknown>,
    key: string,
  ): string {
    const value = record[key];
    if (typeof value !== 'string' || !value || value.length > 255) {
      throw this.invalidCallback();
    }
    return value;
  }

  private requiredInteger(
    record: Record<string, unknown>,
    key: string,
  ): number {
    const value = record[key];
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'number' &&
        (!Number.isSafeInteger(value) || value < 0)) ||
      (typeof value === 'string' && !/^\d+$/.test(value))
    ) {
      throw this.invalidCallback();
    }
    const result = Number(value);
    if (!Number.isSafeInteger(result)) throw this.invalidCallback();
    return result;
  }

  private requiredBoolean(
    record: Record<string, unknown>,
    key: string,
  ): boolean {
    const value = record[key];
    if (typeof value !== 'boolean') throw this.invalidCallback();
    return value;
  }

  private requiredRecord(
    record: Record<string, unknown>,
    key: string,
    code = PAYMOB_CALLBACK_CODE,
  ): Record<string, unknown> {
    const value = record[key];
    if (!this.isRecord(value)) {
      throw new ApplicationError(
        'Paymob transaction callback is malformed',
        code,
        400,
      );
    }
    return value;
  }

  private invalidIntentionResponse(): never {
    throw new ApplicationError(
      'Paymob provider returned an invalid intention response',
      PAYMOB_INTENTION_RESPONSE_CODE,
      502,
    );
  }

  private invalidConfiguration(): ApplicationError {
    return new ApplicationError(
      'Paymob payments provider configuration is incomplete',
      'PAYMOB_CONFIGURATION_INVALID',
      503,
    );
  }

  private invalidCallback(): ApplicationError {
    return new ApplicationError(
      'Paymob transaction callback is malformed',
      PAYMOB_CALLBACK_CODE,
      400,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
