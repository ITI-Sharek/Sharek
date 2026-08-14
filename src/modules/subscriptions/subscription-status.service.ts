import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { SubscriptionUserRoleContext } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { ForbiddenApplicationError } from '../../shared/errors/application.error';
import { ApplicationDailyQuotaService } from '../applications/services/application-daily-quota.service';
import { ProjectsService } from '../projects/projects.service';
import {
  SubscriptionBenefitDto,
  SubscriptionEntitlementDto,
  SubscriptionPlanStatusDto,
  SubscriptionUsageDto,
} from './dto/subscription-status.dto';
import {
  ContributorEntitlements,
  EntitlementsService,
  OwnerEntitlements,
} from './entitlements.service';

/**
 * Assembles `GET /me/subscription`.
 *
 * Benefits are written here rather than derived in the UI from the plan name,
 * so the sentence a user reads and the limit the backend enforces come from the
 * same place and cannot drift.
 *
 * Two things are deliberately absent:
 *
 * - **Commission.** Phase 1 has no paid tasks, so a commission rate has nothing
 *   to apply to. Advertising a waived commission the user cannot yet benefit
 *   from would be advertising an unusable benefit.
 * - **Cross-role benefits.** An owner is not shown contributor allowances and
 *   vice versa. The plan a user holds is resolved per role context, so listing
 *   the other role's benefits would describe a plan they do not have.
 */
@Injectable()
export class SubscriptionStatusService {
  constructor(
    private readonly entitlements: EntitlementsService,
    // Usage is counted by whichever module owns the thing being counted:
    // published Contribution Requests by projects, Applications by
    // applications. This module owns the limit, never the tally.
    @Inject(forwardRef(() => ProjectsService))
    private readonly projects: ProjectsService,
    @Inject(forwardRef(() => ApplicationDailyQuotaService))
    private readonly applicationQuota: ApplicationDailyQuotaService,
  ) {}

  async getPlanStatus(
    actor: AuthenticatedUser,
    now = new Date(),
  ): Promise<SubscriptionPlanStatusDto> {
    const roleContext = this.assertPlanViewer(actor);

    if (roleContext === SubscriptionUserRoleContext.owner) {
      const entitlements = await this.entitlements.resolveForOwner(
        actor.id,
        undefined,
        now,
      );
      return {
        ...this.planFacts(entitlements),
        roleContext: 'owner',
        usage: await this.ownerUsage(actor.id, now),
        benefits: this.ownerBenefits(entitlements),
        entitlements: await this.materialAnalysisEntitlement(
          actor.id,
          roleContext,
          now,
        ),
      };
    }

    const entitlements = await this.entitlements.resolveForContributor(
      actor.id,
      undefined,
      now,
    );
    return {
      ...this.planFacts(entitlements),
      roleContext: 'contributor',
      usage: await this.contributorUsage(actor.id, now),
      benefits: this.contributorBenefits(entitlements),
      entitlements: await this.materialAnalysisEntitlement(
        actor.id,
        roleContext,
        now,
      ),
    };
  }

  /**
   * The route reads the caller's own plan and nothing else. There is no user
   * parameter anywhere in this module's HTTP surface, so no cross-user read
   * path exists to authorize in the first place.
   */
  private assertPlanViewer(
    actor: AuthenticatedUser,
  ): SubscriptionUserRoleContext {
    if (
      actor.status !== 'active' ||
      (actor.role !== 'owner' && actor.role !== 'contributor')
    ) {
      throw new ForbiddenApplicationError(
        'An active owner or contributor account is required',
        'SUBSCRIPTION_ACCOUNT_NOT_ELIGIBLE',
      );
    }
    return actor.role === 'owner'
      ? SubscriptionUserRoleContext.owner
      : SubscriptionUserRoleContext.contributor;
  }

  private planFacts(entitlements: OwnerEntitlements | ContributorEntitlements) {
    return {
      plan: entitlements.planType,
      status: entitlements.status,
      source: entitlements.source,
    };
  }

  private async ownerUsage(
    ownerId: string,
    now: Date,
  ): Promise<SubscriptionUsageDto> {
    const usage = await this.projects.getOwnerPublicationUsage(ownerId, now);
    return {
      used: usage.used,
      limit: usage.limit,
      periodStart: usage.periodStart.toISOString(),
      periodEnd: usage.periodEnd.toISOString(),
    };
  }

  private async contributorUsage(
    contributorId: string,
    now: Date,
  ): Promise<SubscriptionUsageDto> {
    const [tally, entitlements] = await Promise.all([
      this.applicationQuota.read({ contributorId, now }),
      this.entitlements.resolveForContributor(contributorId, undefined, now),
    ]);
    return {
      used: tally.used,
      limit: entitlements.dailyApplicationLimit,
      // The window the count is measured over — today, in UTC — rather than the
      // billing period. It is what "resets at" means to a contributor, and it
      // is present for free users, who have a daily allowance but no billing
      // period at all.
      periodStart: tally.periodStart.toISOString(),
      periodEnd: tally.periodEnd.toISOString(),
    };
  }

  private ownerBenefits(
    entitlements: OwnerEntitlements,
  ): SubscriptionBenefitDto[] {
    return [
      {
        key: 'OWNER_MONTHLY_CONTRIBUTION_REQUESTS',
        state: 'included',
        label: `${entitlements.monthlyContributionRequestLimit} published Contribution Requests per month`,
      },
    ];
  }

  private contributorBenefits(
    entitlements: ContributorEntitlements,
  ): SubscriptionBenefitDto[] {
    const dailyApplications = entitlements.dailyApplicationLimit;
    return [
      {
        key: 'CONTRIBUTOR_DAILY_APPLICATIONS',
        state: 'included',
        label:
          dailyApplications === 1
            ? '1 Application per day'
            : `${dailyApplications} Applications per day`,
      },
      entitlements.matchedProjectLimit > 0
        ? {
            key: 'CONTRIBUTOR_MATCHED_PROJECTS',
            state: 'included',
            label: `${entitlements.matchedProjectLimit} matched projects`,
          }
        : {
            key: 'CONTRIBUTOR_MATCHED_PROJECTS',
            state: 'unavailable',
            label: 'Matched projects',
          },
    ];
  }

  private async materialAnalysisEntitlement(
    userId: string,
    roleContext: SubscriptionUserRoleContext,
    now: Date,
  ): Promise<SubscriptionEntitlementDto[]> {
    const { entitled } =
      await this.entitlements.resolveMaterialAnalysisEntitlement(
        userId,
        roleContext,
        now,
      );
    return [
      {
        key: 'PROJECT_MATERIAL_ANALYSIS',
        state: entitled ? 'granted' : 'unavailable',
      },
    ];
  }
}
