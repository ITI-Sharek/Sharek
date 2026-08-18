import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentAttemptStatus,
  PaymentAttemptPurpose,
  PaymentProvider as PrismaPaymentProvider,
  PaymentWebhookProcessingStatus,
  PaymentWebhookVerificationStatus,
  Prisma,
  SubscriptionPlanType,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../../shared/database/database.service';
import { ApplicationError } from '../../shared/errors/application.error';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import {
  createPaymentWebhookFingerprint,
  minimizePaymentWebhookPayload,
} from './payment-webhook-event';
import { transitionPaymentAttemptStatus } from './payment-attempt-state';
import {
  NormalizedPaymentTransaction,
  PAYMENT_PROVIDER,
  PaymentProvider,
} from './payments.types';

const PAYMENT_REFERENCE =
  /^sharek:payment:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export interface PaymentWebhookResult {
  received: true;
  outcome: 'processed' | 'duplicate' | 'ignored';
  paymentId?: string;
  paymentStatus?: PaymentAttemptStatus;
}

@Injectable()
export class PaymentWebhookService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly subscriptions: EntitlementsService,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
  ) {}

  async process(input: {
    payload: unknown;
    hmac: unknown;
    processedAt?: Date;
  }): Promise<PaymentWebhookResult> {
    const processedAt = input.processedAt ?? new Date();
    let transaction: NormalizedPaymentTransaction;
    try {
      transaction = this.provider.verifyAndNormalizeTransactionCallback({
        payload: input.payload,
        hmac: input.hmac,
      });
    } catch (error) {
      await this.recordInvalidCallback(input.payload, error);
      throw error;
    }

    const minimized = minimizePaymentWebhookPayload(transaction);
    const fingerprint = createPaymentWebhookFingerprint('paymob', minimized);
    let paymentId: string;
    try {
      paymentId = this.paymentIdFromReference(transaction.merchantOrderId);
    } catch (error) {
      await this.recordInvalidCallback(input.payload, error);
      throw error;
    }

    try {
      return await this.database.$transaction(async (database) => {
        const event = await database.paymentWebhookEvent.create({
          data: {
            provider: PrismaPaymentProvider.paymob,
            provider_event_id: transaction.transactionId,
            fingerprint,
            minimized_payload: minimized,
            verification_status: PaymentWebhookVerificationStatus.verified,
            processing_status: PaymentWebhookProcessingStatus.pending,
            verified_at: processedAt,
          },
        });

        await database.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('payment_webhook:' || ${paymentId}::text, 0))`,
        );
        const attempt = await database.paymentAttempt.findUnique({
          where: { id: paymentId },
        });
        if (!attempt) {
          await this.markEventIgnored(database, event.id, processedAt);
          return { received: true, outcome: 'ignored' };
        }

        const mismatch = this.findMismatch(attempt, transaction);
        if (mismatch) {
          await this.markEventIgnored(database, event.id, processedAt);
          return {
            received: true,
            outcome: 'ignored',
            paymentId: attempt.id,
            paymentStatus: attempt.status,
          };
        }

        await database.paymentWebhookEvent.update({
          where: { id: event.id },
          data: { payment_attempt_id: attempt.id },
        });

        if (attempt.status !== PaymentAttemptStatus.pending) {
          await this.markEventIgnored(database, event.id, processedAt);
          return {
            received: true,
            outcome: 'ignored',
            paymentId: attempt.id,
            paymentStatus: attempt.status,
          };
        }

        const nextStatus = transaction.pending
          ? PaymentAttemptStatus.pending
          : transaction.success
            ? PaymentAttemptStatus.paid
            : PaymentAttemptStatus.failed;

        if (nextStatus === PaymentAttemptStatus.pending) {
          await database.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              provider_order_id: transaction.orderId,
              provider_transaction_id: transaction.transactionId,
            },
          });
          await this.markEventProcessed(database, event.id, processedAt);
          return {
            received: true,
            outcome: 'processed',
            paymentId: attempt.id,
            paymentStatus: PaymentAttemptStatus.pending,
          };
        }

        transitionPaymentAttemptStatus(attempt.status, nextStatus);
        await database.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: nextStatus,
            provider_order_id: transaction.orderId,
            provider_transaction_id: transaction.transactionId,
            ...(nextStatus === PaymentAttemptStatus.paid
              ? { paid_at: processedAt }
              : { failed_at: processedAt }),
          },
        });

        if (nextStatus === PaymentAttemptStatus.paid) {
          const periodEnd = new Date(processedAt);
          periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);
          await this.subscriptions.activatePurchasedPlan(
            {
              userId: attempt.user_id,
              roleContext: attempt.user_role_context,
              planType: SubscriptionPlanType.gold,
              periodStart: processedAt,
              periodEnd,
            },
            database,
          );
        }

        await this.markEventProcessed(database, event.id, processedAt);
        return {
          received: true,
          outcome: 'processed',
          paymentId: attempt.id,
          paymentStatus: nextStatus,
        };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.database.paymentWebhookEvent.findFirst({
          where: {
            provider: PrismaPaymentProvider.paymob,
            fingerprint,
          },
          select: { payment_attempt_id: true },
        });
        // Only an exact callback replay is a duplicate. Provider order or
        // transaction identity collisions on PaymentAttempt must remain hard
        // failures instead of being mislabeled and acknowledged.
        if (!duplicate) throw error;
        return {
          received: true,
          outcome: 'duplicate',
          ...(duplicate?.payment_attempt_id
            ? { paymentId: duplicate.payment_attempt_id }
            : {}),
        };
      }
      throw error;
    }
  }

  private findMismatch(
    attempt: {
      id: string;
      purpose: PaymentAttemptPurpose;
      provider: PrismaPaymentProvider;
      plan_type: SubscriptionPlanType;
      amount_cents: number;
      currency: string;
      provider_order_id: string | null;
      provider_transaction_id: string | null;
    },
    transaction: NormalizedPaymentTransaction,
  ): string | null {
    const configuredIntegrationIds = this.config
      .get<string>('PAYMOB_INTEGRATION_IDS', '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isSafeInteger(value) && value > 0);
    const expectedLive = this.config.get<boolean | string>(
      'PAYMOB_EXPECTED_LIVE',
      false,
    );
    const live = expectedLive === true || expectedLive === 'true';

    if (attempt.provider !== PrismaPaymentProvider.paymob) return 'provider';
    if (attempt.purpose !== PaymentAttemptPurpose.subscription_purchase) {
      return 'purpose';
    }
    if (attempt.plan_type !== SubscriptionPlanType.gold) return 'plan';
    if (attempt.amount_cents !== transaction.amountCents) return 'amount';
    if (attempt.currency.toUpperCase() !== transaction.currency.toUpperCase()) {
      return 'currency';
    }
    if (!configuredIntegrationIds.includes(transaction.integrationId)) {
      return 'integration';
    }
    if (transaction.isLive !== null && transaction.isLive !== live) {
      return 'environment';
    }
    if (
      attempt.provider_order_id &&
      attempt.provider_order_id !== transaction.orderId
    ) {
      return 'order';
    }
    if (
      attempt.provider_transaction_id &&
      attempt.provider_transaction_id !== transaction.transactionId
    ) {
      return 'transaction';
    }
    return null;
  }

  private paymentIdFromReference(reference: string): string {
    const match = PAYMENT_REFERENCE.exec(reference);
    if (!match) {
      throw new ApplicationError(
        'Paymob callback reference is invalid',
        'PAYMOB_CALLBACK_REFERENCE_INVALID',
        400,
      );
    }
    return match[1];
  }

  private async recordInvalidCallback(payload: unknown, error: unknown): Promise<void> {
    const safePayload = this.safeInvalidPayload(payload, error);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ provider: 'paymob', payload: safePayload }))
      .digest('hex');
    try {
      await this.database.paymentWebhookEvent.create({
        data: {
          provider: PrismaPaymentProvider.paymob,
          fingerprint,
          minimized_payload: safePayload,
          verification_status: PaymentWebhookVerificationStatus.invalid,
          processing_status: PaymentWebhookProcessingStatus.ignored,
        },
      });
    } catch (createError) {
      if (!this.isUniqueConstraintError(createError)) throw createError;
    }
  }

  private safeInvalidPayload(payload: unknown, error: unknown): Prisma.JsonObject {
    const record = this.isRecord(payload) ? payload : {};
    const transaction = this.isRecord(record.obj) ? record.obj : {};
    const order = this.isRecord(transaction.order) ? transaction.order : {};
    return {
      invalid: true,
      errorCode: error instanceof ApplicationError ? error.code : 'PAYMOB_CALLBACK_INVALID',
      type: typeof record.type === 'string' ? record.type.slice(0, 32) : null,
      transactionId: this.safeScalar(transaction.id),
      orderId: this.safeScalar(order.id),
      merchantOrderId: this.safeScalar(order.merchant_order_id),
    };
  }

  private async markEventProcessed(
    database: Pick<Prisma.TransactionClient, 'paymentWebhookEvent'>,
    eventId: string,
    processedAt: Date,
  ): Promise<void> {
    await database.paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        processing_status: PaymentWebhookProcessingStatus.processed,
        processed_at: processedAt,
      },
    });
  }

  private async markEventIgnored(
    database: Pick<Prisma.TransactionClient, 'paymentWebhookEvent'>,
    eventId: string,
    processedAt: Date,
  ): Promise<void> {
    await database.paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        processing_status: PaymentWebhookProcessingStatus.ignored,
        processed_at: processedAt,
      },
    });
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private safeScalar(value: unknown): string | number | boolean | null {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return typeof value === 'string' ? value.slice(0, 255) : value;
    }
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
