import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SubscriptionEntitlementKey,
  SubscriptionPlanType,
  SubscriptionSource,
  SubscriptionStatus,
  SubscriptionUserRoleContext,
  UserActionType,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import {
  ConflictApplicationError,
  ForbiddenApplicationError,
} from '../../shared/errors/application.error';
import { DatabaseService } from '../../shared/database/database.service';

export const OWNER_MONTHLY_CONTRIBUTION_REQUEST_LIMITS: Record<
  SubscriptionPlanType,
  number
> = {
  bronze: 10,
  silver: 20,
  gold: 30,
};

const MATERIAL_ANALYSIS_ENTITLEMENT =
  SubscriptionEntitlementKey.project_material_analysis;

type SubscriptionDatabase = Pick<
  Prisma.TransactionClient,
  'subscription' | 'subscriptionEntitlement' | 'usageTracker'
>;

export interface SubscriptionPlanStatusDto {
  roleContext: 'owner' | 'contributor';
  plan: SubscriptionPlanType;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  usage: {
    used: number;
    limit: number;
    periodStart: string;
    periodEnd: string;
  } | null;
  benefits: Array<{
    key: string;
    state: 'included' | 'unavailable' | 'not_applicable';
    label: string;
  }>;
  entitlements: Array<{
    key: 'PROJECT_MATERIAL_ANALYSIS';
    state: 'granted' | 'unavailable';
  }>;
}

export interface OwnerPublicationEntitlement {
  planType: SubscriptionPlanType;
  monthlyLimit: number;
  monthlyUsage: number;
  monthlyUsagePeriodStart: Date;
  monthlyUsagePeriodEnd: Date;
  source: SubscriptionSource;
}

export interface OwnerPublicationReservation
  extends OwnerPublicationEntitlement {
  monthlyUsageBefore: number;
}

export interface OwnerMatchingEntitlement {
  entitled: boolean;
  planType: SubscriptionPlanType;
  resultLimit: 0 | 5 | 10;
  source: SubscriptionSource;
}

export interface ContributorBenefitEntitlement {
  planType: SubscriptionPlanType;
  skillMatchedNotifications: boolean;
  taskRecommendations: boolean;
  priorityApplicationVisibility: boolean;
  commission: 'standard' | 'reduced' | 'none';
  source: SubscriptionSource;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly database: DatabaseService) {}

  async getPlanStatus(
    actor: AuthenticatedUser,
    now = new Date(),
  ): Promise<SubscriptionPlanStatusDto> {
    this.assertActivePlanViewer(actor);
    const roleContext = actor.role as 'owner' | 'contributor';
    const plan = await this.findCurrentPlan(actor.id, roleContext, this.database, now);
    const planType = plan?.plan_type ?? SubscriptionPlanType.bronze;
    const period = this.monthPeriod(now);
    const usage =
      roleContext === 'owner'
        ? await this.readUsage(actor.id, period.start, this.database)
        : null;
    const materialAnalysisEntitlement =
      roleContext === 'owner'
        ? await this.getMaterialAnalysisEntitlement(actor.id, now)
        : { entitled: false, source: null };

    return {
      roleContext,
      plan: planType,
      status: plan?.status ?? SubscriptionStatus.active,
      source: plan?.source ?? SubscriptionSource.default,
      usage:
        roleContext === 'owner'
          ? {
              used: usage ?? 0,
              limit: OWNER_MONTHLY_CONTRIBUTION_REQUEST_LIMITS[planType],
              periodStart: period.start.toISOString(),
              periodEnd: period.end.toISOString(),
            }
          : null,
      benefits: this.buildBenefits(roleContext, planType),
      entitlements: [
        {
          key: 'PROJECT_MATERIAL_ANALYSIS',
          state: materialAnalysisEntitlement.entitled
            ? 'granted'
            : 'unavailable',
        },
      ],
    };
  }

  async getOwnerContributionRequestPublicationEntitlement(
    ownerId: string,
    database: SubscriptionDatabase = this.database,
    now = new Date(),
  ): Promise<OwnerPublicationEntitlement> {
    const plan = await this.findCurrentPlan(ownerId, 'owner', database, now);
    const planType = plan?.plan_type ?? SubscriptionPlanType.bronze;
    const period = this.monthPeriod(now);
    return {
      planType,
      monthlyLimit: OWNER_MONTHLY_CONTRIBUTION_REQUEST_LIMITS[planType],
      monthlyUsage: await this.readUsage(ownerId, period.start, database),
      monthlyUsagePeriodStart: period.start,
      monthlyUsagePeriodEnd: period.end,
      source: plan?.source ?? SubscriptionSource.default,
    };
  }

  async getOwnerMatchingEntitlement(
    ownerId: string,
    now = new Date(),
  ): Promise<OwnerMatchingEntitlement> {
    const plan = await this.findCurrentPlan(
      ownerId,
      'owner',
      this.database,
      now,
    );
    const planType = plan?.plan_type ?? SubscriptionPlanType.bronze;
    const resultLimit: 0 | 5 | 10 =
      planType === SubscriptionPlanType.gold
        ? 10
        : planType === SubscriptionPlanType.silver
          ? 5
          : 0;
    return {
      entitled: resultLimit > 0,
      planType,
      resultLimit,
      source: plan?.source ?? SubscriptionSource.default,
    };
  }

  async getContributorBenefitEntitlement(
    contributorId: string,
    now = new Date(),
  ): Promise<ContributorBenefitEntitlement> {
    const plan = await this.findCurrentPlan(
      contributorId,
      'contributor',
      this.database,
      now,
    );
    const planType = plan?.plan_type ?? SubscriptionPlanType.bronze;
    return {
      planType,
      skillMatchedNotifications:
        planType === SubscriptionPlanType.silver ||
        planType === SubscriptionPlanType.gold,
      taskRecommendations: planType === SubscriptionPlanType.gold,
      priorityApplicationVisibility: planType === SubscriptionPlanType.gold,
      commission:
        planType === SubscriptionPlanType.gold
          ? 'none'
          : planType === SubscriptionPlanType.silver
            ? 'reduced'
            : 'standard',
      source: plan?.source ?? SubscriptionSource.default,
    };
  }

  async listOwnerPriorityVisibility(
    ownerIds: string[],
    now = new Date(),
  ): Promise<Set<string>> {
    const ids = [...new Set(ownerIds)];
    if (ids.length === 0) return new Set();
    const plans = await this.database.subscription.findMany({
      where: {
        user_id: { in: ids },
        user_role_context: SubscriptionUserRoleContext.owner,
        status: SubscriptionStatus.active,
        starts_at: { lte: now },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      select: { user_id: true, plan_type: true },
    });
    return new Set(
      plans
        .filter(
          (plan) =>
            plan.plan_type === SubscriptionPlanType.silver ||
            plan.plan_type === SubscriptionPlanType.gold,
        )
        .map((plan) => plan.user_id),
    );
  }

  async reserveOwnerContributionRequestPublication(
    ownerId: string,
    database: SubscriptionDatabase = this.database,
    now = new Date(),
  ): Promise<OwnerPublicationReservation> {
    const entitlement = await this.getOwnerContributionRequestPublicationEntitlement(
      ownerId,
      database,
      now,
    );
    const tracker = await database.usageTracker.upsert({
      where: {
        user_id_action_type_period_date: {
          user_id: ownerId,
          action_type: UserActionType.order_created,
          period_date: entitlement.monthlyUsagePeriodStart,
        },
      },
      create: {
        user_id: ownerId,
        action_type: UserActionType.order_created,
        period_date: entitlement.monthlyUsagePeriodStart,
        count: 0,
      },
      update: {},
    });
    const monthlyUsageBefore = tracker.count;
    if (monthlyUsageBefore >= entitlement.monthlyLimit) {
      throw new ConflictApplicationError(
        'The monthly Contribution Request publication limit was reached',
        'CONTRIBUTION_REQUEST_LIMIT_REACHED',
        {
          planType: entitlement.planType,
          monthlyLimit: entitlement.monthlyLimit,
          monthlyUsage: monthlyUsageBefore,
          periodStart: entitlement.monthlyUsagePeriodStart,
        },
      );
    }

    const updated = await database.usageTracker.updateMany({
      where: { id: tracker.id, count: monthlyUsageBefore },
      data: { count: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictApplicationError(
        'Owner publication usage changed concurrently; retry the request',
        'CONTRIBUTION_REQUEST_USAGE_CONCURRENT_MODIFICATION',
      );
    }
    return {
      ...entitlement,
      monthlyUsage: monthlyUsageBefore + 1,
      monthlyUsageBefore,
    };
  }

  async getMaterialAnalysisEntitlement(
    ownerId: string,
    now = new Date(),
    database: SubscriptionDatabase = this.database,
  ): Promise<{ entitled: boolean; source: SubscriptionSource | null }> {
    const entitlement = await database.subscriptionEntitlement.findFirst({
      where: {
        user_id: ownerId,
        key: MATERIAL_ANALYSIS_ENTITLEMENT,
        status: 'active',
        starts_at: { lte: now },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      orderBy: { starts_at: 'desc' },
      select: { source: true },
    });
    return {
      entitled: Boolean(entitlement),
      source: entitlement?.source ?? null,
    };
  }

  async assignPlan(input: {
    userId: string;
    planType: SubscriptionPlanType;
    roleContext: SubscriptionUserRoleContext;
    source: SubscriptionSource;
    startsAt?: Date;
    expiresAt?: Date;
  }) {
    const startsAt = input.startsAt ?? new Date();
    return this.database.$transaction(async (transaction) => {
      await transaction.subscription.updateMany({
        where: {
          user_id: input.userId,
          user_role_context: input.roleContext,
          status: 'active',
        },
        data: { status: 'cancelled', cancelled_at: startsAt },
      });
      return transaction.subscription.create({
        data: {
          user_id: input.userId,
          plan_type: input.planType,
          user_role_context: input.roleContext,
          status: 'active',
          source: input.source,
          starts_at: startsAt,
          expires_at: input.expiresAt,
        },
      });
    });
  }

  async grantMaterialAnalysisEntitlement(input: {
    userId: string;
    source: SubscriptionSource;
    startsAt?: Date;
    expiresAt?: Date;
  }) {
    const startsAt = input.startsAt ?? new Date();
    return this.database.$transaction(async (transaction) => {
      await transaction.subscriptionEntitlement.updateMany({
        where: {
          user_id: input.userId,
          key: MATERIAL_ANALYSIS_ENTITLEMENT,
          status: 'active',
        },
        data: { status: 'revoked', revoked_at: startsAt },
      });
      return transaction.subscriptionEntitlement.create({
        data: {
          user_id: input.userId,
          key: MATERIAL_ANALYSIS_ENTITLEMENT,
          source: input.source,
          status: 'active',
          starts_at: startsAt,
          expires_at: input.expiresAt,
        },
      });
    });
  }

  private async findCurrentPlan(
    userId: string,
    roleContext: 'owner' | 'contributor',
    database: SubscriptionDatabase,
    now: Date,
  ) {
    return database.subscription.findFirst({
      where: {
        user_id: userId,
        user_role_context: roleContext,
        status: 'active',
        starts_at: { lte: now },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      orderBy: { starts_at: 'desc' },
    });
  }

  private async readUsage(
    userId: string,
    periodStart: Date,
    database: SubscriptionDatabase,
  ): Promise<number> {
    const tracker = await database.usageTracker.findUnique({
      where: {
        user_id_action_type_period_date: {
          user_id: userId,
          action_type: UserActionType.order_created,
          period_date: periodStart,
        },
      },
      select: { count: true },
    });
    return tracker?.count ?? 0;
  }

  private monthPeriod(now: Date): { start: Date; end: Date } {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return {
      start,
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
  }

  private buildBenefits(
    roleContext: 'owner' | 'contributor',
    planType: SubscriptionPlanType,
  ): SubscriptionPlanStatusDto['benefits'] {
    if (roleContext === 'contributor') {
      return [
        { key: 'application_submission', state: 'included', label: 'Applications remain available under ordinary rules' },
        { key: 'skill_gap_guidance', state: 'included', label: 'Source-scoped skill-gap guidance on request' },
        {
          key: 'priority_application_visibility',
          state: planType === 'gold' ? 'included' : 'unavailable',
          label: 'Priority visibility for owner Application review ordering',
        },
        {
          key: 'task_recommendations',
          state: planType === 'gold' ? 'included' : 'unavailable',
          label: 'Personalized task recommendations',
        },
        {
          key: 'commission',
          state: planType === 'gold' || planType === 'silver' ? 'included' : 'not_applicable',
          label:
            planType === 'gold'
              ? 'No platform commission'
              : planType === 'silver'
                ? 'Reduced platform commission'
                : 'Standard platform commission',
        },
      ];
    }
    return [
      {
        key: 'owner_contribution_request_limit',
        state: 'included',
        label: `${OWNER_MONTHLY_CONTRIBUTION_REQUEST_LIMITS[planType]} Contribution Requests per calendar month`,
      },
      {
        key: 'ai_matching',
        state: planType === 'bronze' ? 'unavailable' : 'included',
        label:
          planType === 'bronze'
            ? 'AI contributor matching'
            : `AI contributor matching — up to ${planType === 'silver' ? 5 : 10} suggestions per Request`,
      },
      {
        key: 'priority_visibility',
        state: planType === 'bronze' ? 'unavailable' : 'included',
        label: 'Priority visibility where the owner-facing contract permits it',
      },
      {
        key: 'gold_auto_notifications',
        state: planType === 'gold' ? 'included' : 'unavailable',
        label: 'Automatic notification eligibility for approved Gold matching',
      },
      {
        key: 'commission',
        state: planType === 'gold' ? 'included' : 'not_applicable',
        label: planType === 'gold' ? 'No platform commission' : 'Standard platform commission',
      },
    ];
  }

  private assertActivePlanViewer(actor: AuthenticatedUser): void {
    if (
      actor.status !== 'active' ||
      (actor.role !== 'owner' && actor.role !== 'contributor')
    ) {
      throw new ForbiddenApplicationError(
        'An active owner or contributor account is required',
        'SUBSCRIPTION_ACCOUNT_NOT_ELIGIBLE',
      );
    }
  }
}
