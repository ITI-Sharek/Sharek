import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SubscriptionPlanType,
  SubscriptionSource,
  SubscriptionStatus,
  SubscriptionUserRoleContext,
} from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import {
  CONTRIBUTOR_PLAN_CATALOG,
  ContributorPlanPolicy,
  OWNER_PLAN_CATALOG,
  OwnerPlanPolicy,
  PLAN_RANK,
} from './plan-catalog';

/** The subset of the Prisma client this service needs, so callers can hand it a transaction. */
export type EntitlementsDatabase = Pick<Prisma.TransactionClient, 'subscription'>;

interface ResolvedPlan {
  /** The plan in force right now. `free` is the absence of a paid plan, never an error. */
  readonly planType: SubscriptionPlanType;
  /** `active` when no row exists — a free user is in good standing, not lapsed. */
  readonly status: SubscriptionStatus;
  readonly source: SubscriptionSource;
  /** Null for free users and for open-ended plans that have no billing period. */
  readonly periodStart: Date | null;
  readonly periodEnd: Date | null;
}

export interface OwnerEntitlements extends ResolvedPlan, OwnerPlanPolicy {
  readonly roleContext: 'owner';
}

export interface ContributorEntitlements
  extends ResolvedPlan,
    ContributorPlanPolicy {
  readonly roleContext: 'contributor';
}

export type Entitlements = OwnerEntitlements | ContributorEntitlements;

const FREE_PLAN: ResolvedPlan = {
  planType: SubscriptionPlanType.free,
  status: SubscriptionStatus.active,
  source: SubscriptionSource.default,
  periodStart: null,
  periodEnd: null,
};

const PLAN_SELECTION = {
  plan_type: true,
  status: true,
  source: true,
  starts_at: true,
  expires_at: true,
  current_period_start: true,
  current_period_end: true,
} satisfies Prisma.SubscriptionSelect;

/**
 * The single source of every plan number in the backend.
 *
 * Two rules make the answers trustworthy:
 *
 * - **Role context is not transferable.** An owner subscription is resolved
 *   only against owner questions and a contributor subscription only against
 *   contributor questions, so the return type is discriminated by role rather
 *   than being one bag of fields callers pick from.
 * - **Expiry needs no background job.** A plan grants nothing once its billing
 *   period has elapsed, because the period bound is part of the query rather
 *   than a status a sweeper has to write. A `cancelled` plan still grants until
 *   its period ends: cancelling stops the renewal, it does not refund the month
 *   already paid for. Only `expired` never grants.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly database: DatabaseService) {}

  async resolveForOwner(
    userId: string,
    database: EntitlementsDatabase = this.database,
    now = new Date(),
  ): Promise<OwnerEntitlements> {
    const plan = await this.resolvePlan(
      userId,
      SubscriptionUserRoleContext.owner,
      database,
      now,
    );
    return {
      roleContext: 'owner',
      ...plan,
      ...OWNER_PLAN_CATALOG[plan.planType],
    };
  }

  async resolveForContributor(
    userId: string,
    database: EntitlementsDatabase = this.database,
    now = new Date(),
  ): Promise<ContributorEntitlements> {
    const plan = await this.resolvePlan(
      userId,
      SubscriptionUserRoleContext.contributor,
      database,
      now,
    );
    return {
      roleContext: 'contributor',
      ...plan,
      ...CONTRIBUTOR_PLAN_CATALOG[plan.planType],
    };
  }

  async resolve(
    userId: string,
    roleContext: SubscriptionUserRoleContext,
    database: EntitlementsDatabase = this.database,
    now = new Date(),
  ): Promise<Entitlements> {
    return roleContext === SubscriptionUserRoleContext.owner
      ? this.resolveForOwner(userId, database, now)
      : this.resolveForContributor(userId, database, now);
  }

  /**
   * Whether an owner's plan is at least `minimumPlan`. Kept here rather than at
   * the call site so the plan ladder stays in {@link PLAN_RANK}.
   */
  async hasMinimumOwnerPlan(
    userId: string,
    minimumPlan: SubscriptionPlanType,
    now = new Date(),
  ): Promise<{ planType: SubscriptionPlanType; entitled: boolean }> {
    const { planType } = await this.resolveForOwner(userId, this.database, now);
    return {
      planType,
      entitled: PLAN_RANK[planType] >= PLAN_RANK[minimumPlan],
    };
  }

  /**
   * Records a plan an administrator granted directly, rather than one a payment
   * provider activated. The `source` stamp is the only thing that distinguishes
   * the two after the fact, so it is set here rather than left to the caller.
   */
  async assignPlan(
    input: {
      userId: string;
      roleContext: SubscriptionUserRoleContext;
      planType: SubscriptionPlanType;
      periodStart: Date;
      periodEnd: Date;
      source?: SubscriptionSource;
    },
    database: Pick<Prisma.TransactionClient, 'subscription'> = this.database,
  ): Promise<void> {
    await database.subscription.create({
      data: {
        user_id: input.userId,
        user_role_context: input.roleContext,
        plan_type: input.planType,
        status: SubscriptionStatus.active,
        source: input.source ?? SubscriptionSource.admin,
        starts_at: input.periodStart,
        expires_at: input.periodEnd,
        current_period_start: input.periodStart,
        current_period_end: input.periodEnd,
      },
    });
  }

  private async resolvePlan(
    userId: string,
    roleContext: SubscriptionUserRoleContext,
    database: EntitlementsDatabase,
    now: Date,
  ): Promise<ResolvedPlan> {
    const subscription = await database.subscription.findFirst({
      where: {
        user_id: userId,
        user_role_context: roleContext,
        // `expired` is terminal. `cancelled` still grants until its period ends.
        status: {
          in: [SubscriptionStatus.active, SubscriptionStatus.cancelled],
        },
        starts_at: { lte: now },
        AND: [
          // A null end is open-ended, not "ended at the epoch". Both bounds are
          // exclusive: at the instant a period ends the plan no longer grants.
          { OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
          {
            OR: [
              { current_period_end: null },
              { current_period_end: { gt: now } },
            ],
          },
        ],
      },
      orderBy: [{ starts_at: 'desc' }, { id: 'desc' }],
      select: PLAN_SELECTION,
    });

    if (!subscription) return FREE_PLAN;

    return {
      planType: subscription.plan_type,
      status: subscription.status,
      source: subscription.source,
      periodStart: subscription.current_period_start ?? subscription.starts_at,
      periodEnd: subscription.current_period_end ?? subscription.expires_at,
    };
  }
}
