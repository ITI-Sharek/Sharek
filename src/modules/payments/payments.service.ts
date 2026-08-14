import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentAttemptPurpose,
  PaymentAttemptStatus,
  PaymentProvider as PrismaPaymentProvider,
  Prisma,
  SubscriptionPlanType,
  SubscriptionUserRoleContext,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { PaymentCheckoutDto, PaymentStatusDto } from './dto/payment-response.dto';
import { PAYMENT_PROVIDER, PaymentProvider } from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly subscriptions: EntitlementsService,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
  ) {}

  async createCheckout(input: {
    actor: AuthenticatedUser;
    planType: SubscriptionPlanType;
    roleContext: SubscriptionUserRoleContext;
    idempotencyKey: string;
  }): Promise<PaymentCheckoutDto> {
    this.assertActivePaymentUser(input.actor);
    this.assertRoleContext(input.actor, input.roleContext);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const plan = this.subscriptions.getPlanCatalogEntry(input.planType);

    if (!plan.roleContexts.includes(input.roleContext)) {
      throw new ForbiddenApplicationError(
        'The selected subscription role context is not eligible for this plan',
        'PAYMENT_ROLE_CONTEXT_NOT_ALLOWED',
      );
    }
    if (!plan.checkoutAvailable) {
      throw new BadRequestApplicationError(
        'This subscription plan does not have a checkout flow',
        'SUBSCRIPTION_PLAN_CHECKOUT_UNAVAILABLE',
      );
    }

    const existing = await this.database.paymentAttempt.findUnique({
      where: {
        user_id_idempotency_key: {
          user_id: input.actor.id,
          idempotency_key: idempotencyKey,
        },
      },
    });
    if (existing) {
      this.assertSameCheckout(existing, {
        planType: input.planType,
        roleContext: input.roleContext,
        amountCents: plan.amountCents,
        currency: plan.currency,
      });
      return this.completePendingCheckout(existing);
    }

    await this.subscriptions.assertPlanPurchaseAllowed(
      input.actor.id,
      input.roleContext,
      input.planType,
    );

    const attemptId = randomUUID();
    let attempt: PaymentAttemptRecord;
    try {
      attempt = await this.database.paymentAttempt.create({
        data: {
          id: attemptId,
          user_id: input.actor.id,
          purpose: PaymentAttemptPurpose.subscription_purchase,
          user_role_context: input.roleContext,
          plan_type: input.planType,
          amount_cents: plan.amountCents,
          currency: plan.currency,
          idempotency_key: idempotencyKey,
          provider: PrismaPaymentProvider.paymob,
          status: PaymentAttemptStatus.pending,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const racedAttempt = await this.database.paymentAttempt.findUnique({
        where: {
          user_id_idempotency_key: {
            user_id: input.actor.id,
            idempotency_key: idempotencyKey,
          },
        },
      });
      if (!racedAttempt) throw error;
      this.assertSameCheckout(racedAttempt, {
        planType: input.planType,
        roleContext: input.roleContext,
        amountCents: plan.amountCents,
        currency: plan.currency,
      });
      return this.completePendingCheckout(racedAttempt);
    }

    return this.completePendingCheckout(attempt);
  }

  async getPaymentStatus(
    actor: AuthenticatedUser,
    paymentId: string,
  ): Promise<PaymentStatusDto> {
    this.assertActivePaymentUser(actor);
    const attempt = await this.database.paymentAttempt.findFirst({
      where: { id: paymentId, user_id: actor.id },
    });
    if (!attempt) {
      throw new NotFoundApplicationError(
        'Payment was not found',
        'PAYMENT_NOT_FOUND',
      );
    }

    return {
      paymentId: attempt.id,
      planType: attempt.plan_type,
      roleContext: attempt.user_role_context,
      amountCents: attempt.amount_cents,
      currency: attempt.currency,
      status: attempt.status,
      createdAt: attempt.created_at,
      paidAt: attempt.paid_at,
    };
  }

  private async completePendingCheckout(
    attempt: PaymentAttemptRecord,
  ): Promise<PaymentCheckoutDto> {
    return this.database.$transaction(async (transaction) => {
      // The provider call is deliberately inside the bounded transaction. A
      // compare-and-set after the call would still create two Paymob
      // intentions when concurrent retries race; this advisory lock makes one
      // retry observe the first provider reference instead.
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('payment_checkout:' || ${attempt.id}::text, 0))`,
      );
      const currentAttempt = await transaction.paymentAttempt.findUnique({
        where: { id: attempt.id },
      });
      if (!currentAttempt) {
        throw new NotFoundApplicationError(
          'Payment was not found',
          'PAYMENT_NOT_FOUND',
        );
      }
      if (currentAttempt.status !== PaymentAttemptStatus.pending) {
        throw new ConflictApplicationError(
          'The idempotent payment command has already reached a terminal state',
          'PAYMENT_IDEMPOTENCY_REPLAY_NOT_PENDING',
        );
      }

      if (
        currentAttempt.provider_intention_id &&
        currentAttempt.provider_client_secret
      ) {
        return this.toCheckoutDto(currentAttempt);
      }

      const intention = await this.provider.createPaymentIntention({
        amountCents: currentAttempt.amount_cents,
        currency: currentAttempt.currency,
        reference: `sharek:payment:${currentAttempt.id}`,
      });
      const updatedAttempt = await transaction.paymentAttempt.update({
        where: { id: currentAttempt.id },
        data: {
          provider_intention_id: intention.intentionId,
          provider_client_secret: intention.clientSecret,
        },
      });
      return this.toCheckoutDto(updatedAttempt);
    });
  }

  private toCheckoutDto(attempt: PaymentAttemptRecord): PaymentCheckoutDto {
    if (!attempt.provider_client_secret) {
      throw new ConflictApplicationError(
        'Payment checkout data is not available yet',
        'PAYMENT_CHECKOUT_DATA_UNAVAILABLE',
      );
    }
    return {
      paymentId: attempt.id,
      checkout: {
        provider: 'paymob',
        clientSecret: attempt.provider_client_secret,
      },
    };
  }

  private assertSameCheckout(
    attempt: PaymentAttemptRecord,
    requested: {
      planType: SubscriptionPlanType;
      roleContext: SubscriptionUserRoleContext;
      amountCents: number;
      currency: string;
    },
  ): void {
    if (
      attempt.plan_type !== requested.planType ||
      attempt.user_role_context !== requested.roleContext ||
      attempt.amount_cents !== requested.amountCents ||
      attempt.currency !== requested.currency
    ) {
      throw new ConflictApplicationError(
        'Idempotency key was already used for another payment checkout',
        'PAYMENT_IDEMPOTENCY_CONFLICT',
      );
    }
  }

  private assertRoleContext(
    actor: AuthenticatedUser,
    roleContext: SubscriptionUserRoleContext,
  ): void {
    if (actor.role !== roleContext) {
      throw new ForbiddenApplicationError(
        'A payment checkout must use the caller’s active role context',
        'PAYMENT_ROLE_CONTEXT_NOT_ALLOWED',
      );
    }
  }

  private assertActivePaymentUser(actor: AuthenticatedUser): void {
    if (
      actor.status !== 'active' ||
      (actor.role !== 'owner' && actor.role !== 'contributor')
    ) {
      throw new ForbiddenApplicationError(
        'An active owner or contributor account is required for payments',
        'PAYMENT_ACCOUNT_NOT_ELIGIBLE',
      );
    }
  }

  private normalizeIdempotencyKey(value: string): string {
    if (
      typeof value !== 'string' ||
      value.trim().length < 8 ||
      value.trim().length > 128
    ) {
      throw new BadRequestApplicationError(
        'A payment idempotency key between 8 and 128 characters is required',
        'PAYMENT_IDEMPOTENCY_KEY_INVALID',
      );
    }
    return value.trim();
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

type PaymentAttemptRecord = {
  id: string;
  user_id: string;
  purpose: PaymentAttemptPurpose;
  user_role_context: SubscriptionUserRoleContext;
  plan_type: SubscriptionPlanType;
  amount_cents: number;
  currency: string;
  idempotency_key: string;
  provider: PrismaPaymentProvider;
  provider_intention_id: string | null;
  provider_client_secret: string | null;
  provider_order_id: string | null;
  provider_transaction_id: string | null;
  status: PaymentAttemptStatus;
  expires_at: Date | null;
  paid_at: Date | null;
  failed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
